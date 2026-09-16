import { useEffect, useState } from 'react';
import { paths } from '../routes';
import { Icon, type IconName } from './Icon';
import { SignInCard, type Intent } from './SignIn';
import { landingCopy, type LandingLanguage } from './landingCopy';
import './Landing.css';

const stepIcons: IconName[] = ['brush', 'text', 'book'];
const storyImages = ['little-adventure', 'moon-sailing', 'together'];
const languageKey = 'ehon-landing-language';

function initialLanguage(): LandingLanguage {
  if (typeof window === 'undefined') return 'ja';
  try {
    const saved = localStorage.getItem(languageKey);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch { /* The page works even when browser storage is unavailable. */ }
  return 'ja';
}

function StoryBrand({ label }: { label: string }) {
  return <a className="story-brand" href={paths.shelf} aria-label={label}>
    <span className="story-brand-mark"><Icon name="book" size={28} /><span aria-hidden="true">✦</span></span>
    <span className="story-brand-name" lang="ja">ぺたぺた<span lang="en">STUDIO</span></span>
  </a>;
}

function Flourish({ className = '' }: { className?: string }) {
  return <svg className={className} width="76" height="76" viewBox="0 0 76 76" fill="none" aria-hidden="true">
    <path d="M38 7c-2 20-9 28-29 31 20 2 28 10 29 31 3-21 10-29 29-31C48 35 41 27 38 7Z" stroke="currentColor" strokeWidth="1.4" />
    <path d="m12 12 8 8m36 36 8 8M63 12l-8 8M20 56l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>;
}

function Brand() {
  return <a className="brand" href={paths.shelf} aria-label="ぺたぺた ホーム"><span className="brand-mark"><Icon name="brush" /></span><h1>ぺたぺた</h1><span className="studio-wordmark">STUDIO</span></a>;
}

/** What a visitor without an account sees, on every entry (decision 58). */
export function Landing({ intent }: { intent?: Intent }) {
  const [language, setLanguage] = useState<LandingLanguage>(initialLanguage);
  const [seed, setSeed] = useState(0);
  const copy = landingCopy[language];

  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    document.title = copy.title;
    document.documentElement.lang = language;
    if (description) description.content = copy.metaDescription;
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
      if (description && previousDescription !== undefined) description.content = previousDescription;
    };
  }, [language, copy.title, copy.metaDescription]);

  const changeLanguage = () => {
    const next = language === 'en' ? 'ja' : 'en';
    setLanguage(next);
    try { localStorage.setItem(languageKey, next); } catch { /* Optional preference. */ }
  };

  return <div className="storybook" lang={language} id="beginning">
    <a className="story-skip" href="#story-main">{copy.skip}</a>
    <header className="story-header">
      <StoryBrand label={copy.home} />
      <nav className="story-navigation" aria-label={copy.navigation}>
        <a href="#little-things">{copy.about}</a>
        <a href="#possibilities">{copy.inspiration}</a>
      </nav>
      <div className="story-header-actions">
        <button className="story-language" onClick={changeLanguage} aria-label={language === 'en' ? '日本語に切り替える' : 'Switch to English'} lang={language === 'en' ? 'ja' : 'en'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg>
          {language === 'en' ? '日本語' : 'English'}
        </button>
        <a className="story-sign-in" href="#sign-in">{copy.signIn}<Icon name="arrowRight" size={16} /></a>
      </div>
    </header>

    <main id="story-main">
      <section className="story-hero" aria-labelledby="story-title">
        <div className="story-hero-copy">
          <p className="story-eyebrow"><span aria-hidden="true">✦</span>{copy.eyebrow}<span aria-hidden="true">✦</span></p>
          <h1 id="story-title">{copy.headline}<br /><em>{copy.headlineEmphasis}</em></h1>
          <p className="story-introduction">{copy.introduction}</p>
          <div className="story-hero-actions">
            <a className="story-cta" href="#sign-in">{copy.begin}<Icon name="arrowRight" size={18} /></a>
            <a className="story-wander" href="#little-things">{copy.explore}<Icon name="chevronDown" size={15} /></a>
          </div>
          <p className="story-hero-note">{copy.heroNote}</p>
        </div>
        <figure className="story-hero-art">
          <img src="/illustrations/storybook-world.webp" srcSet="/illustrations/storybook-world-small.webp 800w, /illustrations/storybook-world.webp 1600w" sizes="(max-width: 600px) 132vw, (max-width: 1600px) 100vw, 1600px" width="1600" height="800" alt={copy.heroAlt} fetchPriority="high" />
          <figcaption>{copy.artCaption}<span aria-hidden="true"> ↗</span></figcaption>
        </figure>
      </section>

      <div className="story-definition"><span lang="ja">絵本</span><span className="story-definition-word">ehon</span><span className="story-definition-line" /><p>{copy.definition}</p></div>

      <section className="story-process story-container" id="little-things" aria-labelledby="process-title">
        <div className="story-section-intro">
          <div><p className="story-eyebrow">{copy.processEyebrow}</p><h2 id="process-title">{copy.processTitle}</h2></div>
          <p>{copy.processIntro}</p>
        </div>
        <ol className="story-steps">
          {copy.steps.map((step, index) => <li key={index}>
            <div className="story-step-top"><span className={`story-step-icon story-step-icon-${index}`}><Icon name={stepIcons[index]} size={29} /></span><span className="story-step-number">0{index + 1}</span></div>
            <h3>{step.title}</h3><p>{step.body}</p><span className="story-step-detail">{step.detail}</span>
          </li>)}
        </ol>
      </section>

      <section className="story-gallery-section" id="possibilities" aria-labelledby="possibilities-title">
        <div className="story-container">
          <div className="story-centered-intro"><p className="story-eyebrow">{copy.galleryEyebrow}</p><h2 id="possibilities-title">{copy.galleryTitle}</h2><p>{copy.galleryIntro}</p></div>
          <div className="story-gallery">
            {copy.stories.map((story, index) => <figure className={`story-picture story-picture-${index}`} key={index}>
              <div className="story-picture-art"><img src={`/illustrations/${storyImages[index]}.webp`} width="720" height="720" loading="lazy" decoding="async" alt={story.alt} /></div>
              <figcaption><span>{story.category}</span><h3>{story.title}</h3><p>{story.body}</p></figcaption>
            </figure>)}
          </div>
          <div className="story-seed">
            <p className="story-eyebrow"><Icon name="sparkles" size={18} />{copy.seedLabel}</p>
            <p className="story-seed-line" aria-live="polite" aria-atomic="true">“{copy.seeds[seed]}”</p>
            <button className="story-seed-button" onClick={() => setSeed((current) => (current + 1) % copy.seeds.length)}><Icon name="rotate" size={15} />{copy.nextSeed}</button>
          </div>
        </div>
      </section>

      <section className="story-welcome story-container" aria-labelledby="welcome-title">
        <Flourish className="story-welcome-star" />
        <p className="story-eyebrow">{copy.welcomeEyebrow}</p>
        <h2 id="welcome-title">{copy.welcomeTitle}</h2>
        <p className="story-welcome-body">{copy.welcomeBody}</p>
        <p className="story-handwritten">{copy.welcomeNote}</p>
      </section>

      <section className="story-questions story-container" aria-labelledby="questions-title">
        <div><p className="story-eyebrow">{copy.faqEyebrow}</p><h2 id="questions-title">{copy.faqTitle}</h2></div>
        <div className="story-faq-list">{copy.faqs.map((faq, index) => <details key={index} name="story-questions"><summary>{faq.question}<Icon name="plus" size={18} /></summary><p>{faq.answer}</p></details>)}</div>
      </section>

      <section className="story-begin-section" aria-labelledby="begin-title">
        <div className="story-begin story-container">
          <div className="story-begin-copy"><p className="story-eyebrow">{copy.beginEyebrow}</p><h2 id="begin-title">{copy.beginTitle}</h2><p>{copy.beginBody}</p><span className="story-handwritten">{copy.beginNote}</span><Flourish className="story-begin-star" /></div>
          <SignInCard intent={intent} language={language} />
        </div>
      </section>
    </main>

    <footer className="story-footer story-container">
      <div><StoryBrand label={copy.home} /><p>{copy.footerTagline}</p></div>
      <span className="story-footer-note">{copy.footerNote}<Icon name="heart" size={15} /></span>
      <a href="#beginning">{copy.backToTop}<span aria-hidden="true">↑</span></a>
    </footer>
  </div>;
}

/** A phone camera that scanned the QR code lands here; the approval itself happens in the app. */
export function HandoffNotice() {
  return <div className="landing">
    <header className="topbar landing-bar"><Brand /></header>
    <main className="landing-main">
      <section className="sign-in-card handoff-notice">
        <Icon name="qr" size={40} />
        <h2>この QRコードは アプリで よみとります</h2>
        <p>スマホの ぺたぺたを ひらき、<b>せってい → パソコンで ぺたぺたを ひらく</b> から カメラで よみとってください。パソコンの がめんが そのまま ログインします。</p>
        <a className="button" href={paths.shelf}><Icon name="home" size={16} />ぺたぺた STUDIO へ</a>
      </section>
    </main>
  </div>;
}
