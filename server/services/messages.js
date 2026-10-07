// Approved, static translations for outbound notifications.
// Sensitive banking content is never machine-translated at runtime.
const T = {
  en: {
    account_created: {
      subject: 'Your {brand} account has been created',
      intro: 'Hello {name}, a {brand} account has been created for you (customer ID {customerId}).',
      cta: 'Activate your account and choose your password using this secure, one-time link (valid for {hours} hours):',
      outro: 'We will never ask for your password by email, SMS or WhatsApp. If you did not expect this message, ignore it or contact us.',
      sms: '{brand}: Hi {name}, your account is ready. Activate it here (valid {hours}h): {link}',
    },
    password_reset: {
      subject: 'Reset your {brand} password',
      intro: 'Hello {name}, we received a request to reset your password.',
      cta: 'Use this one-time link within {minutes} minutes:',
      outro: 'If you did not request this, you can safely ignore this message.',
      sms: '{brand}: reset your password (valid {minutes} min): {link}',
    },
  },
  fr: {
    account_created: {
      subject: 'Votre compte {brand} a été créé',
      intro: 'Bonjour {name}, un compte {brand} a été créé pour vous (identifiant client {customerId}).',
      cta: 'Activez votre compte et choisissez votre mot de passe via ce lien sécurisé à usage unique (valable {hours} heures) :',
      outro: 'Nous ne vous demanderons jamais votre mot de passe par e-mail, SMS ou WhatsApp. Si vous n’attendiez pas ce message, ignorez-le ou contactez-nous.',
      sms: '{brand} : Bonjour {name}, votre compte est prêt. Activez-le ici (valable {hours} h) : {link}',
    },
    password_reset: {
      subject: 'Réinitialisez votre mot de passe {brand}',
      intro: 'Bonjour {name}, nous avons reçu une demande de réinitialisation de votre mot de passe.',
      cta: 'Utilisez ce lien à usage unique dans les {minutes} minutes :',
      outro: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
      sms: '{brand} : réinitialisez votre mot de passe (valable {minutes} min) : {link}',
    },
  },
  es: {
    account_created: {
      subject: 'Su cuenta de {brand} ha sido creada',
      intro: 'Hola {name}, se ha creado una cuenta de {brand} para usted (ID de cliente {customerId}).',
      cta: 'Active su cuenta y elija su contraseña con este enlace seguro de un solo uso (válido {hours} horas):',
      outro: 'Nunca le pediremos su contraseña por correo, SMS o WhatsApp. Si no esperaba este mensaje, ignórelo o contáctenos.',
      sms: '{brand}: Hola {name}, su cuenta está lista. Actívela aquí (válido {hours} h): {link}',
    },
    password_reset: {
      subject: 'Restablezca su contraseña de {brand}',
      intro: 'Hola {name}, recibimos una solicitud para restablecer su contraseña.',
      cta: 'Use este enlace de un solo uso en {minutes} minutos:',
      outro: 'Si no lo solicitó, puede ignorar este mensaje.',
      sms: '{brand}: restablezca su contraseña (válido {minutes} min): {link}',
    },
  },
  pt: {
    account_created: {
      subject: 'A sua conta {brand} foi criada',
      intro: 'Olá {name}, foi criada uma conta {brand} para si (ID de cliente {customerId}).',
      cta: 'Ative a sua conta e escolha a sua palavra-passe através desta ligação segura de utilização única (válida por {hours} horas):',
      outro: 'Nunca lhe pediremos a palavra-passe por e-mail, SMS ou WhatsApp. Se não esperava esta mensagem, ignore-a ou contacte-nos.',
      sms: '{brand}: Olá {name}, a sua conta está pronta. Ative-a aqui (válido {hours} h): {link}',
    },
    password_reset: {
      subject: 'Redefina a sua palavra-passe {brand}',
      intro: 'Olá {name}, recebemos um pedido para redefinir a sua palavra-passe.',
      cta: 'Utilize esta ligação de utilização única em {minutes} minutos:',
      outro: 'Se não fez este pedido, pode ignorar esta mensagem.',
      sms: '{brand}: redefina a sua palavra-passe (válido {minutes} min): {link}',
    },
  },
  ar: {
    account_created: {
      subject: 'تم إنشاء حسابك في {brand}',
      intro: 'مرحباً {name}، تم إنشاء حساب لك في {brand} (رقم العميل {customerId}).',
      cta: 'فعّل حسابك واختر كلمة المرور عبر هذا الرابط الآمن لمرة واحدة (صالح لمدة {hours} ساعة):',
      outro: 'لن نطلب منك كلمة المرور أبداً عبر البريد الإلكتروني أو الرسائل النصية أو واتساب. إذا لم تكن تتوقع هذه الرسالة فتجاهلها أو تواصل معنا.',
      sms: '{brand}: مرحباً {name}، حسابك جاهز. فعّله من هنا (صالح {hours} ساعة): {link}',
    },
    password_reset: {
      subject: 'إعادة تعيين كلمة مرور {brand}',
      intro: 'مرحباً {name}، تلقينا طلباً لإعادة تعيين كلمة المرور.',
      cta: 'استخدم هذا الرابط لمرة واحدة خلال {minutes} دقيقة:',
      outro: 'إذا لم تطلب ذلك فيمكنك تجاهل هذه الرسالة.',
      sms: '{brand}: أعد تعيين كلمة المرور (صالح {minutes} دقيقة): {link}',
    },
  },
};

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

export function render(template, lang, vars) {
  const set = (T[lang] || T.en)[template] || T.en[template];
  const v = { ...vars };
  const rtl = lang === 'ar';
  const subject = fill(set.subject, v);
  const text = [fill(set.intro, v), '', fill(set.cta, v), v.link, '', fill(set.outro, v)].join('\n');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#12263a">
<h2 style="color:#0b2545">${esc(v.brand)}</h2><p>${esc(fill(set.intro, v))}</p><p>${esc(fill(set.cta, v))}</p>
<p><a href="${esc(v.link)}" style="background:#0b2545;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(v.link.split('?')[0].replace(/^https?:\/\//, ''))}</a></p>
<p style="font-size:13px;color:#5b6b7b">${esc(fill(set.outro, v))}</p></div>`;
  return { subject, text, html, sms: fill(set.sms, v) };
}
