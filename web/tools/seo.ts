import { createServer, type HtmlTagDescriptor, type Plugin, type ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSiteUrl, siteCopy, siteName, socialImage } from '../src/site.ts';

/** Canonical URLs must never inherit a preview hostname, query, credentials, or private book ID. */
function siteOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('VITE_SITE_URL must be a public HTTPS origin, such as https://petapeta-dev.pages.dev.');
  }
  return url.origin;
}

export function publicSeo(): Plugin {
  let config: ResolvedConfig;
  let origin = defaultSiteUrl;
  let indexable = true;
  const canonical = () => `${origin}/`;
  const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`;
  const sitemap = () => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable ? `\n  <url><loc>${canonical()}</loc></url>` : ''}\n</urlset>\n`;
  const meta = (name: string, content: string, property = false): HtmlTagDescriptor => ({ tag: 'meta', attrs: { [property ? 'property' : 'name']: name, content }, injectTo: 'head' });

  const middleware = (req: { url?: string }, res: { setHeader(name: string, value: string): void; end(body?: string): void }, next: () => void) => {
    const pathname = (req.url ?? '/').split('?')[0];
    if (!indexable || /^\/(app|read|g|login|admin)(?:\/|\.html|$)/.test(pathname)) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (pathname === '/robots.txt' || pathname === '/sitemap.xml') {
      res.setHeader('Content-Type', pathname === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8');
      res.end(pathname === '/robots.txt' ? robots() : sitemap());
      return;
    }
    next();
  };

  return {
    name: 'ehon-public-seo',
    configResolved(resolved) {
      config = resolved;
      origin = siteOrigin(resolved.env.VITE_SITE_URL || defaultSiteUrl);
      indexable = resolved.env.VITE_SITE_INDEXABLE !== 'false';
    },
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
    transformIndexHtml: {
      order: 'pre',
      async handler(html, context) {
        const tags: HtmlTagDescriptor[] = [
          { tag: 'link', attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '48x48', href: '/favicon-48.png' }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }, injectTo: 'head' },
          meta('application-name', siteName),
        ];
        if (!context.filename.endsWith('/index.html')) return { html, tags };

        const copy = siteCopy.ja;
        const imageUrl = `${origin}${socialImage.path}`;
        tags.push(
          meta('description', copy.description),
          meta('robots', indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow'),
          { tag: 'link', attrs: { rel: 'canonical', href: canonical() }, injectTo: 'head' },
          meta('og:type', 'website', true),
          meta('og:site_name', siteName, true),
          meta('og:locale', 'ja_JP', true),
          meta('og:locale:alternate', 'en_US', true),
          meta('og:title', copy.title, true),
          meta('og:description', copy.description, true),
          meta('og:url', canonical(), true),
          meta('og:image', imageUrl, true),
          meta('og:image:secure_url', imageUrl, true),
          meta('og:image:type', 'image/jpeg', true),
          meta('og:image:width', String(socialImage.width), true),
          meta('og:image:height', String(socialImage.height), true),
          meta('og:image:alt', copy.imageAlt, true),
          meta('twitter:card', 'summary_large_image'),
          meta('twitter:title', copy.title),
          meta('twitter:description', copy.description),
          meta('twitter:image', imageUrl),
          meta('twitter:image:alt', copy.imageAlt),
          {
            tag: 'script', attrs: { type: 'application/ld+json' }, injectTo: 'head',
            children: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                { '@type': 'WebSite', '@id': `${origin}/#website`, url: canonical(), name: siteName, alternateName: ['ぺたぺた', 'Peta Peta Studio'], description: copy.description, inLanguage: 'ja' },
                { '@type': 'WebPage', '@id': `${origin}/#webpage`, url: canonical(), name: copy.title, description: copy.description, inLanguage: 'ja', isPartOf: { '@id': `${origin}/#website` }, about: { '@id': `${origin}/#application` }, primaryImageOfPage: { '@id': `${origin}/#cover` } },
                { '@type': 'WebApplication', '@id': `${origin}/#application`, name: siteName, url: canonical(), description: copy.description, applicationCategory: 'DesignApplication', operatingSystem: 'Web browser', inLanguage: 'ja', image: imageUrl, featureList: ['イラストを描く・配置する', '絵本にことばをそえる', '見開きで読む', '閲覧用リンクで共有する', '印刷・PDF保存'] },
                { '@type': 'ImageObject', '@id': `${origin}/#cover`, url: imageUrl, contentUrl: imageUrl, width: socialImage.width, height: socialImage.height, caption: copy.imageAlt },
              ],
            }).replace(/</g, '\\u003c'),
          },
        );
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${copy.title}</title>`);

        // Reuse the component instead of maintaining a second, crawler-only version of the copy.
        if (config.command === 'build') {
          const renderer = await createServer({
            configFile: false, root: config.root, envDir: config.envDir, mode: config.mode,
            plugins: [react()], appType: 'custom', logLevel: 'error',
            server: { middlewareMode: true, hmr: false, watch: null },
          });
          try {
            const module = await renderer.ssrLoadModule('/src/ui/prerenderLanding.tsx') as { prerenderLanding(): string };
            html = html.replace('<div id="root"></div>', () => `<div id="root">${module.prerenderLanding()}</div>`);
          } finally { await renderer.close(); }
        }
        return { html, tags };
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots() });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() });
      if (!indexable) this.emitFile({ type: 'asset', fileName: '_headers', source: `${readFileSync(join(config.publicDir, '_headers'), 'utf8')}\n/*\n  X-Robots-Tag: noindex, nofollow\n` });
    },
  };
}
