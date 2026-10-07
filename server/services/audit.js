import { AuditLog } from '../models/index.js';

const SENSITIVE = /pass|token|secret|code|hash|otp/i;

function clean(v, depth = 0) {
  if (v == null || depth > 3) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x, depth + 1));
  if (typeof v === 'object' && !(v instanceof Date) && !v._bsontype) {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = SENSITIVE.test(k) ? '[redacted]' : clean(val, depth + 1);
    return o;
  }
  return typeof v === 'string' ? v.slice(0, 200) : v;
}

/** Record an auditable event. Never throws: auditing must not break the request. */
export async function audit(req, action, { actor, resourceType, resourceId, metadata } = {}) {
  try {
    const a = actor || req?.user;
    await AuditLog.create({
      actorId: a?._id,
      actorRole: a?.role,
      actorEmail: a?.email,
      action,
      resourceType,
      resourceId: resourceId ? String(resourceId) : undefined,
      ip: req?.ip,
      userAgent: req?.get?.('user-agent')?.slice(0, 200),
      metadata: clean(metadata),
    });
  } catch (e) {
    console.error('audit failure', action, e.message);
  }
}
