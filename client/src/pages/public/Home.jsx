import { Link } from 'react-router-dom';  
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/ui.jsx';
import { money } from '../../format.js';

const PRODUCTS = [['accounts', 'acct'], ['cards', 'card'], ['loans', 'loan'], ['savings', 'piggy']];

export default function Home() {
  const { t } = useTranslation();
  return (
    <>
      <section className="hero">
        <svg className="hero-waves" viewBox="0 0 1440 320" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 220c120-60 240-60 360 0s240 60 360 0 240-60 360 0 240 60 360 0v100H0z" fill="rgba(20,184,166,.18)" />
          <path d="M0 260c120-60 240-60 360 0s240 60 360 0 240-60 360 0 240 60 360 0v60H0z" fill="rgba(255,255,255,.08)" />
        </svg>
        <div className="container hero-grid">
          <div>
            <h1>{t('home.heroTitle')}</h1>
            <p className="lead">{t('home.heroSub')}</p>
            <div className="cta-row">
              <Link className="btn accent lg" to="/login">{t('home.ctaLogin')} <Icon name="arrow" size={18} className="flip" /></Link>
              <Link className="btn ghost-light lg" to="/activate">{t('home.ctaActivate')}</Link>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="bal-card">
              <div className="bal-top"><span>{t('home.heroCardLabel')}</span><Icon name="shield" size={18} /></div>
              <div className="bal-amt">{money(1248075, 'GHS')}</div>
              <div className="bal-chip">•••• 4821</div>
              <div className="bal-rows">
                <div><Icon name="down" size={16} /> <span>Salary</span><b className="pos">+{money(850000, 'GHS')}</b></div>
                <div><Icon name="up" size={16} /> <span>ECG Prepaid</span><b>−{money(24300, 'GHS')}</b></div>
              </div>
              <small>{t('home.heroCardNote')}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="container quick">
        <h2 className="sr">{t('home.quickTitle')}</h2>
        <div className="quick-grid">
          {[['balance', 'wallet', '/login'], ['transactions', 'list', '/login'], ['statements', 'doc', '/login'], ['support', 'help', '/support']].map(([k, ic, to]) => (
            <Link key={k} to={to} className="quick-tile"><span className="tile-ic"><Icon name={ic} size={24} /></span><span>{t(`home.quick.${k}`)}</span><Icon name="arrow" size={18} className="flip tile-go" /></Link>
          ))}
        </div>
      </section>

      <section className="section container">
        <div className="section-head"><h2>{t('home.productsTitle')}</h2><p className="muted">{t('home.productsSub')}</p></div>
        <div className="grid-4">
          {PRODUCTS.map(([k, ic]) => (
            <Link key={k} to={`/services/${k}`} className="card product">
              <span className="tile-ic lg"><Icon name={ic} size={28} /></span>
              <h3>{t(`services.${k}.title`)}</h3>
              <p>{t(`services.${k}.intro`)}</p>
              <span className="more">{t('home.learnMore')} <Icon name="arrow" size={16} className="flip" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section alt">
        <div className="container">
          <div className="section-head"><h2>{t('home.whyTitle')}</h2></div>
          <div className="grid-3">
            {[['why1', 'shield'], ['why2', 'globe'], ['why3', 'clock']].map(([k, ic]) => (
              <div key={k} className="why"><span className="tile-ic"><Icon name={ic} size={24} /></span><h3>{t(`home.${k}t`)}</h3><p>{t(`home.${k}d`)}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="container section">
        <div className="sec-band">
          <Icon name="lock" size={36} />
          <div><h2>{t('home.secTitle')}</h2><p>{t('home.secText')}</p></div>
          <Link to="/security" className="btn light">{t('home.secCta')}</Link>
        </div>
      </section>
    </>
  );
}
