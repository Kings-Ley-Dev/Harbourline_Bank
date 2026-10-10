import { useState } from 'react';  
import { useTranslation } from 'react-i18next';
import { Icon, Field } from '../../components/ui.jsx';

export default function Contact() {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: '', email: '', message: '' });
  const submit = (e) => {
    e.preventDefault();
    const body = `${f.message}\n\n— ${f.name} (${f.email})`;
    window.location.href = `mailto:harbourline@info.com?subject=${encodeURIComponent('Support request')}&body=${encodeURIComponent(body)}`;
  };
  return (
    <>
      <section className="page-hero"><div className="container"><span className="tile-ic lg on-dark"><Icon name="mail" size={30} /></span><h1>{t('contact.title')}</h1><p className="lead">{t('contact.intro')}</p></div></section>
      <section className="container section contact-grid">
        <div className="card info-list">
          <div><Icon name="phone" /><div><b>{t('contact.phone')}</b><p dir="ltr">+61 2 8036 4500</p></div></div>
          <div><Icon name="mail" /><div><b>{t('contact.email')}</b><p dir="ltr">harbourline@info.com</p></div></div>
          <div><Icon name="clock" /><div><b>{t('contact.hours')}</b><p>{t('contact.hoursValue')}</p></div></div>
          <div><Icon name="pin" /><div><b>{t('contact.address')}</b><p>{t('contact.addressValue')}</p></div></div>
        </div>
        <form className="card" onSubmit={submit}>
          <h2>{t('contact.formTitle')}</h2>
          <Field id="cn" label={t('contact.name')}><input id="cn" required maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field id="ce" label={t('contact.emailLabel')}><input id="ce" type="email" required maxLength={150} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field id="cm" label={t('contact.message')}><textarea id="cm" rows={5} required maxLength={1500} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></Field>
          <button className="btn primary" type="submit">{t('contact.send')}</button>
          <p className="hint">{t('contact.formNote')}</p>
        </form>
      </section>
    </>
  );
}
