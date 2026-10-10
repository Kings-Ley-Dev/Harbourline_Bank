import { Link, Navigate, useParams } from 'react-router-dom';  
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui.jsx';

const ICONS = { accounts: 'acct', cards: 'card', loans: 'loan', savings: 'piggy' };

export default function Service() {
  const { slug } = useParams();
  const { t } = useTranslation();
  if (!ICONS[slug]) return <Navigate to="/" replace />;
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="tile-ic lg on-dark"><Icon name={ICONS[slug]} size={30} /></span>
          <h1>{t(`services.${slug}.title`)}</h1>
          <p className="lead">{t(`services.${slug}.intro`)}</p>
        </div>
      </section>
      <section className="container section narrow">
        <ul className="ticks">
          {[1, 2, 3, 4].map((n) => <li key={n}><Icon name="check" size={20} /> <span>{t(`services.${slug}.f${n}`)}</span></li>)}
        </ul>
        <div className="cta-card">
          <h2>{t('services.ctaTitle')}</h2>
          <p>{t('services.ctaText')}</p>
          <div className="cta-row"><Link to="/activate" className="btn primary lg">{t('services.ctaButton')}</Link><Link to="/login" className="btn ghost lg">{t('services.ctaLogin')}</Link></div>
        </div>
      </section>
    </>
  );
}
