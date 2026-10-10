import { Link } from 'react-router-dom';  
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui.jsx';

export default function Security() {
  const { t } = useTranslation();
  return (
    <>
      <section className="page-hero"><div className="container"><span className="tile-ic lg on-dark"><Icon name="shield" size={30} /></span><h1>{t('security.title')}</h1><p className="lead">{t('security.intro')}</p></div></section>
      <section className="container section narrow">
        <ol className="tips">
          {[1, 2, 3, 4, 5].map((n) => <li key={n}><span className="step-num">{n}</span><div><h3>{t(`security.t${n}`)}</h3><p>{t(`security.d${n}`)}</p></div></li>)}
        </ol>
        <div className="cta-card warn"><h2>{t('security.reportTitle')}</h2><p>{t('security.reportText')}</p><Link className="btn primary" to="/contact">{t('nav.contact')}</Link></div>
      </section>
    </>
  );
}
