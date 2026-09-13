import { useEffect, useState } from 'react';
import { useStore } from '../cloud/store';
import { loadTemplates, templateBook, templateStore, type TemplateSummary } from '../templates';
import { paths } from '../routes';
import { Icon, type IconName } from './Icon';
import { SignInCard, type Intent } from './SignIn';
import { Thumbnail } from './Thumbnail';

const features: { icon: IconName; title: string; body: string }[] = [
  { icon: 'brush', title: '描く・はる・ことば', body: 'ブラシと 消しゴム、イラストの 素材、ふりがな つきの ことば。ページは 何枚でも。' },
  { icon: 'spread', title: '見開きで よむ・印刷する', body: 'できた えほんは 見開きで 読んで、一枚ずつ 紙や PDF に。' },
  { icon: 'phone', title: 'スマホの ぺたぺたと つながる', body: 'おなじ アカウントなら、パソコンで 描いた えほんが こどもの スマホにも とどきます。' },
  { icon: 'send', title: 'かぞくに おくる', body: 'アプリも ログインも いらない、よむだけの リンク。ひとりずつ とめられます。' },
];

function Brand() {
  return <a className="brand" href={paths.shelf} aria-label="ぺたぺた ホーム"><span className="brand-mark"><Icon name="brush" /></span><h1>ぺたぺた</h1><span className="studio-wordmark">STUDIO</span></a>;
}

/** What a visitor without an account sees, on every entry (decision 58). */
export function Landing({ intent }: { intent?: Intent }) {
  const catalog = useStore(templateStore);
  const [shown, setShown] = useState<(TemplateSummary & { json: string; pages: number[] })[]>([]);
  useEffect(() => { void loadTemplates().catch(() => undefined); }, []);
  useEffect(() => {
    if (catalog.status !== 'ready') return;
    let alive = true;
    const ordered = [...catalog.items.filter((item) => item.id === 'doc-love-letter'), ...catalog.items.filter((item) => item.id !== 'doc-love-letter')].slice(0, 3);
    void Promise.all(ordered.map(async (item) => {
      // Storyboards pair pages from the third on (cover, title page, then picture-left words-right).
      const spread = item.shape === 'PORTRAIT' && item.pageCount >= 4;
      return { ...item, json: await templateBook(item.id, 'preview-' + item.id), pages: spread ? [2, 3] : [0] };
    })).then((items) => { if (alive) setShown(items); }).catch(() => undefined);
    return () => { alive = false; };
  }, [catalog]);

  return <div className="landing">
    <header className="topbar landing-bar">
      <Brand />
      <a className="button primary" href="#sign-in"><Icon name="login" size={16} />サインイン</a>
    </header>
    <main className="landing-main">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">おやこで つくる えほん · FOR GROWN-UPS</span>
          <h2>描いて、ことばを そえて、<br />一冊の えほんに。</h2>
          <p>ぺたぺた STUDIO は、こどもと いっしょに えほんを つくる ための、パソコン向けの アトリエです。白い ページに 描き、イラストを はり、ことばを そえる。できた えほんは スマホの ぺたぺたでも ひらけて、かぞくに リンクで おくれます。</p>
          <ul className="features">
            {features.map((feature) => <li key={feature.title}>
              <span className="feature-icon"><Icon name={feature.icon} /></span>
              <div><strong>{feature.title}</strong><span>{feature.body}</span></div>
            </li>)}
          </ul>
        </div>
        <SignInCard intent={intent} />
      </section>
      {shown.length > 0 && <section className="gallery" aria-label="つくれる えほんの れい">
        <div className="shelf-section-title"><h2>こんな えほんが つくれます</h2><span>テンプレートから はじめても、白紙からでも</span></div>
        <ul className="gallery-list">
          {shown.map((item) => <li key={item.id}>
            <div className="gallery-spread" data-portrait={item.pages.length > 1 || undefined}>
              {item.pages.map((page) => <Thumbnail key={page} json={item.json} library={null} pageIndex={page} className="gallery-page" />)}
            </div>
            <strong>{item.title}</strong>
            <span>{item.pageCount} ページ · {item.description}</span>
          </li>)}
        </ul>
      </section>}
    </main>
    <footer className="landing-foot">
      <span>ぺたぺた · おやこで つくる えほん</span>
      <span>えほんは あなたの アカウントに ほぞんされ、リンクを うけとった ひとだけが よめます。</span>
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
