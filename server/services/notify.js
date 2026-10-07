import { config } from '../config.js';
import { Notification } from '../models/index.js';
import { render } from './messages.js';

const toDigits = (p) => String(p).replace(/[^\d]/g, '');

async function postJson(url, { headers = {}, body, form, auth } = {}) {
  const h = { ...headers };
  let payload;
  if (form) {
    h['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (auth) h.Authorization = `Basic ${Buffer.from(auth).toString('base64')}`;
  const res = await fetch(url, { method: 'POST', headers: h, body: payload, signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, json };
}

const channels = {
  email: {
    enabled: () => !!(config.notify.email.apiKey && config.notify.email.from),
    async send({ to, msg }) {
      // Resend REST API (https://resend.com/docs/api-reference/emails/send-email)
      const r = await postJson('https://api.resend.com/emails', {
        headers: { Authorization: `Bearer ${config.notify.email.apiKey}` },
        body: { from: config.notify.email.from, to: [to], subject: msg.subject, text: msg.text, html: msg.html },
      });
      return { ok: r.ok, info: { httpStatus: r.status, id: r.json?.id, error: r.ok ? undefined : r.json?.message } };
    },
  },
  whatsapp: {
    enabled: () => !!(config.notify.whatsapp.token && config.notify.whatsapp.phoneId),
    async send({ to, vars, lang }) {
      // WhatsApp Business Cloud API, approved template message with two body parameters: {{1}} first name, {{2}} link.
      const { token, phoneId, template, apiVersion } = config.notify.whatsapp;
      const r = await postJson(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        body: {
          messaging_product: 'whatsapp',
          to: toDigits(to),
          type: 'template',
          template: {
            name: template,
            language: { code: lang || 'en' },
            components: [{ type: 'body', parameters: [{ type: 'text', text: vars.name }, { type: 'text', text: vars.link }] }],
          },
        },
      });
      return { ok: r.ok, info: { httpStatus: r.status, id: r.json?.messages?.[0]?.id, error: r.ok ? undefined : r.json?.error?.message } };
    },
  },
  sms: {
    enabled() {
      const s = config.notify.sms;
      return (s.provider === 'twilio' && s.twilioSid && s.twilioToken && s.twilioFrom) || (s.provider === 'arkesel' && s.arkeselKey);
    },
    async send({ to, msg }) {
      const s = config.notify.sms;
      if (s.provider === 'twilio') {
        const r = await postJson(`https://api.twilio.com/2010-04-01/Accounts/${s.twilioSid}/Messages.json`, {
          auth: `${s.twilioSid}:${s.twilioToken}`,
          form: { To: to, From: s.twilioFrom, Body: msg.sms },
        });
        return { ok: r.ok, info: { httpStatus: r.status, id: r.json?.sid, error: r.ok ? undefined : r.json?.message } };
      }
      const r = await postJson('https://sms.arkesel.com/api/v2/sms/send', {
        headers: { 'api-key': s.arkeselKey },
        body: { sender: s.senderId, message: msg.sms, recipients: [toDigits(to)] },
      });
      return { ok: r.ok && r.json?.status !== 'error', info: { httpStatus: r.status, status: r.json?.status, error: r.ok ? undefined : r.json?.message } };
    },
  },
};

/**
 * Send a templated notification over the requested channels, recording a Notification row per channel.
 * Delivery failures never throw; they are stored as status "failed" so admins can see and retry them.
 * Links are never persisted in the notification record.
 */
export async function sendTemplated({ client, template, link, channelsToUse = ['email', 'whatsapp', 'sms'], triggeredBy, expires = {} }) {
  const lang = client.preferredLanguage || 'en';
  const vars = {
    brand: config.brand,
    name: client.firstName,
    customerId: client.customerId,
    link,
    hours: config.activationHours,
    minutes: config.resetMinutes,
    ...expires,
  };
  const msg = render(template, lang, vars);
  const recipients = { email: client.email, whatsapp: client.phone, sms: client.phone };

  const results = await Promise.all(
    channelsToUse.map(async (ch) => {
      const impl = channels[ch];
      const rec = await Notification.create({
        clientId: client._id,
        userId: client.userId,
        channel: ch,
        recipient: recipients[ch],
        template,
        title: msg.subject,
        status: 'queued',
        triggeredBy,
      });
      if (!impl || !impl.enabled()) {
        rec.status = 'skipped';
        rec.providerResponse = { reason: 'Channel not configured' };
        if (!config.prod && config.exposeDevLinks) console.log(`[dev:${ch}] ${template} -> ${recipients[ch]}: ${link}`);
      } else {
        try {
          const r = await impl.send({ to: recipients[ch], msg, vars, lang });
          rec.status = r.ok ? 'sent' : 'failed';
          rec.providerResponse = r.info;
          if (r.ok) rec.sentAt = new Date();
        } catch (e) {
          rec.status = 'failed';
          rec.providerResponse = { error: e.name === 'TimeoutError' ? 'Provider timed out' : 'Provider request failed' };
        }
      }
      await rec.save();
      return rec;
    })
  );
  return results;
}

export async function inApp(client, title, body, template = 'in_app') {
  return Notification.create({
    clientId: client._id,
    userId: client.userId,
    channel: 'in_app',
    recipient: client.email,
    template,
    title,
    body,
    status: 'sent',
    sentAt: new Date(),
  });
}

export const configuredChannels = () => Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, v.enabled()]));
