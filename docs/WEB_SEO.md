# Public landing page and search metadata

The public origin is **https://petapeta-dev.pages.dev**, as selected for this launch. Set
`VITE_SITE_URL` to the new HTTPS origin and rebuild when a custom domain is ready. No private
book URL, preview hostname, or visitor query is used to construct a canonical URL.

`web/src/site.ts` is the source of the Japanese and English page titles/descriptions and
social-image dimensions. `web/tools/seo.ts` adds the following to the initial HTML at build
time, before any browser JavaScript runs:

- Japanese title and search description, canonical URL, and large-image preview permission.
- Open Graph title, description, site name, locale, canonical URL, and image URL/type/dimensions/alt text.
- X/Twitter `summary_large_image` card, title, description, image, and alt text.
- JSON-LD describing the website, public webpage, picture-book web application, and cover image.
- SVG/PNG favicons and an Apple touch icon matching the landing page's book mark.
- The actual Japanese landing component, rendered to static HTML. The browser leaves that
  content visible until fonts and the account session are ready. A no-JavaScript visitor can
  read the public page; creating books and signing in require JavaScript.

The generated `dist/robots.txt` points to `dist/sitemap.xml`. The sitemap lists only the public
homepage. Editor, reader, guest-book, and phone-login pages have `noindex, nofollow` in their
HTML and Cloudflare Pages response headers. They are deliberately crawlable so search engines
can read those directives. These directives supplement the existing account controls; they
are not access controls. `public/404.html` gives unknown Pages URLs an actual not-found page
instead of a copy of the public homepage.

Set `VITE_SITE_INDEXABLE=false` before building a deployment that should be excluded from
search. Its HTML and response headers become `noindex`, and its sitemap contains no URLs.
Cloudflare's own per-deployment preview headers remain in effect.

Japanese is the default. The language toggle remembers a visitor's choice and updates the
document language, title, and search description. Social metadata describes the default
Japanese page. There are no invented alternate-language URLs or `hreflang` links; those can be
added when English has its own crawlable URL.

## Social artwork

`web/public/social/ehon-studio.jpg` is the 1200 × 630 Japanese share card, generated with the
built-in image-generation tool from the landing illustration, then encoded as an optimized
JPEG. The prompts and illustration paths are documented in [LANDING_ARTWORK.md](LANDING_ARTWORK.md).

## Verification and release

Build with `cd web && pnpm build`. Inspect the built HTML, `robots.txt`, and `sitemap.xml`;
the metadata must exist with JavaScript disabled. A local production preview uses
`pnpm preview --port 4185`. On deployment, verify that the canonical URL and social image
return HTTP 200 and the private routes send their `X-Robots-Tag` header.

After deploying, the sitemap is at `https://petapeta-dev.pages.dev/sitemap.xml`.
Search Console ownership verification and sitemap submission depend on the site's owner
account. This change does not deploy the site or claim that a search engine has indexed it.

Reference specifications: [Open Graph](https://ogp.me/),
[Google's JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[robots directives](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag),
and [Cloudflare Pages headers](https://developers.cloudflare.com/pages/configuration/headers/).
