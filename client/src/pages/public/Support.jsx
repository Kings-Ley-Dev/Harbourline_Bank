import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui.jsx';

export default function Support() {
  const { t } = useTranslation();
  return (
    <>
      <section className="page-hero"><div className="container"><span className="tile-ic lg on-dark"><Icon name="help" size={30} /></span><h1>{t('support.title')}</h1><p className="lead">{t('support.intro')}</p></div></section>
      <section className="container section narrow">
        <h2>{t('support.faqTitle')}</h2>
        <div className="faq">
          {[1, 2, 3, 4, 5].map((n) => (
            <details key={n}><summary>{t(`support.q${n}`)}<Icon name="chevron" size={18} /></summary><p>{t(`support.a${n}`)}</p></details>
          ))}
        </div>
        <div className="cta-row mt"><Link to="/contact" className="btn primary">{t('nav.contact')}</Link><Link to="/forgot-password" className="btn ghost">{t('auth.forgot')}</Link></div>
      </section>
    </>
  );
}
