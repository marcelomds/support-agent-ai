import { LANGUAGES, useI18n, type Language } from './i18n'
import { ApprovalIcon, AuditIcon, ChatIcon, GlobeIcon, Logo, MetricsIcon } from './icons'

/** The first screen: what this demo is, and the way into the console. */
export function Home({ onEnter }: { onEnter: () => void }) {
  const { t, language, setLanguage } = useI18n()
  const features = [
    { icon: <ChatIcon />, title: t.homeFeature1Title, text: t.homeFeature1Text },
    { icon: <ApprovalIcon />, title: t.homeFeature2Title, text: t.homeFeature2Text },
    { icon: <AuditIcon />, title: t.homeFeature3Title, text: t.homeFeature3Text },
    { icon: <MetricsIcon />, title: t.homeFeature4Title, text: t.homeFeature4Text },
  ]

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <div className="avatar logo">
            <Logo />
          </div>
          <div>
            <strong>StreamBox</strong>
            <span>{t.brandTagline}</span>
          </div>
        </div>
        <label className="language">
          <GlobeIcon />
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} aria-label={t.language}>
            {LANGUAGES.map(({ code, label }) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="home-hero">
        <p className="home-eyebrow">{t.homeEyebrow}</p>
        <h1>{t.homeTitle}</h1>
        <p className="home-lead">{t.homeLead}</p>
        <button type="button" className="home-cta" onClick={onEnter}>
          {t.homeEnter}
        </button>
        <p className="home-note">{t.demoNote}</p>
      </section>

      <section className="home-features">
        {features.map((feature) => (
          <article key={feature.title} className="home-feature">
            <div className="home-icon">{feature.icon}</div>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
