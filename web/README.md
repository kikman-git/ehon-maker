# Web app

Phase 0–2 of [the web/backend plan](../docs/WEB_BACKEND_PLAN.md): the shelf, the drawing workspace and
the reader, with accounts, sync and read-only guest links when a cloud configuration is present.
Without one it is a complete local book maker that stores books in the browser.

From the repository root:

```sh
make web                 # http://localhost:5173/  (shelf; /app composer harness; /read/<id>; /g/<token>)
make web-build           # font slices, TypeScript check and production build
make web-test            # Playwright: composer harness, desk, six painter snapshots (no cloud)
make web-sync-test       # Playwright against the Auth, Firestore and Functions emulators
make web-budget          # Lighthouse byte budgets on the production build, served with gzip
make web-fonts FETCH=1   # stage the five downloadable faces and slice them too (once, before deploying)
```

Use Node 22.12+, pnpm 11.22 and JDK 21. Install the browser once with
`cd web && pnpm exec playwright install chromium` after `make web-build`.
`make test` also runs the shared suite in Node and Google Chrome via Gradle.

`make web-core` generates `vendor/ehon-core` from the production Kotlin/JS library and
copies the bundled fonts' licences to `public/licenses`. `pnpm dev` and `pnpm build` first run
`tools/slice-fonts.mjs`, which writes `public/fonts/` and `src/fonts.generated.ts` (about 30 s
the first time, instant while the sources are unchanged). All of these are ignored build output.
The generated `.d.ts` is checked for untyped exports when staging. The pnpm dependency is
a directory link, so rebuilding the core updates Vite without reinstalling the package.

## Entries and routes

Three pages share one bundle graph: `index.html` (shelf), `app.html` (composer) and
`read.html` (reader). Clean paths are rewritten by `public/_redirects` on Cloudflare Pages and
by the `cleanRoutes` plugin in `vite.config.ts` for the dev and preview servers; `public/_headers`
marks hashed assets and font slices immutable.

| Path | Page | Purpose |
|---|---|---|
| `/` | shelf | books in this browser and account, templates, account panel, guest links |
| `/app` | studio | new local book: one white page, brush selected, autosave |
| `/app?template=t1` | studio | optional template preview, file open/save, save to shelf |
| `/app/<bookId>` | studio | a saved book: drawing, autosave, lease, remote replacement, illustration library |
| `/read/<bookId>` | reader | the owner's copy with one page listener while open |
| `/g/<token>` | reader | a guest link: one fetch of `guestBook`, no login, no listener |

## Drawing workspace

Open `/app` or choose **白紙から描きはじめる** on the shelf to start with a single white page.
The brush is already selected. The top toolbar exposes **描く** (B), **消しゴム** (E), **選択** (V),
**文字** (T), **素材** (I), and **移動** (H); the side panel follows the active tool. UI text uses the
platform's sans-serif face, while text in the book keeps its chosen book font.

The desk is the page: the view bar (page arrows, **1ページ / 見開き**, fit, zoom) and the hint float
over its top and bottom edges, and the tool panel and the page strip fold away with the two
toggles beside undo, remembered per browser. Choosing **文字** or **素材** brings the panel back.
Illustrated portrait books open in **見開き** view: two facing pages, with either page editable
without moving the view. **1ページ / 見開き** switches the canvas view without changing the book;
paired thumbnails mark the current spread. Illustration templates start with **選択** active.
**よむ** in the header opens the book in the reader (a template preview is kept on the shelf
first); the reader's **続きを描く** comes back. The reader also offers **全画面** and **印刷**, which
lays every spread on its own landscape sheet with the chrome hidden, so the browser's print dialog
gives a paper copy or a PDF of the whole book.
The **きみへの ことばを さがして** template (`/app?template=doc-love-letter`) recreates the author's
storyboard the way a Japanese picture book is bound: a cover and title page, eleven spreads with
the picture on the left and the words on the right, and a back cover with the colophon, all as
separate vector pieces and handwritten Japanese text. Its first spread is also shown together in
the shelf preview.

`src/desk/` renders only the active page; the thumbnail strip changes pages and adds sheets.
Mouse, pen and finger strokes use `WebEditor.beginStroke/appendStroke/endStroke`, with
normalised points in the existing shared document. Coalesced pointer samples repaint once per
animation frame without a React render. Each stroke is one undo step. Escape, lost capture and
pointer cancellation restore the gesture baseline; a second finger switches to pinch without
leaving a stray stroke. The painter isolates the ink layer when erasing so paper and placed
illustrations remain intact in the editor, reader, thumbnails and exports.

Space or the middle button pans anywhere; the hand tool pans with the primary pointer.
Wheel pans, Ctrl/Command + wheel and two fingers zoom, and `0` fits the current page.
Ctrl/Command + Z / Shift + Z undo and redo; shortcuts ignore text fields. **ホーム** and the logo
return to the shelf and remain visible on small screens. `.ehon` files are in the File menu;
**PNGを書き出す** exports the active page at 2048px along its longest edge.

Library buttons place at the page centre on a tap and drag with a ghost once the pointer moves
(`drag.ts`); the drop lands on the frame under the pointer as `addPartAt` at that point, with the
illustration's aspect. A personal illustration dropped beside the frames becomes a scratch item:
an `<img>` of the 1024 derivative in desk units, moved, resized and deleted in place and dragged
onto a frame later. `src/cloud/workspace.ts` keeps the scratch list in localStorage (authoritative,
with a dirty flag that survives a reload) and mirrors it to `workspaces/{bookId}` for the
account's other browsers, last writer wins; the rules require the book to exist and belong to the
same account, so a brand-new book's scratch is pushed once the book itself has synced.

## Story templates

Every illustrated story on the shelf is a **document template** from the shared core: a whole book
written as one `.ehon` JSON, vector art embedded as SVG, captions as text items, everything a movable
or editable piece (decision #55, format in [`docs/EHON_FORMAT.md`](../docs/EHON_FORMAT.md)). The
sources are `shared/templates/<story>/story.json` plus `art/*.svg`; the Gradle task
`generateDocumentTemplates` assembles them into `DocumentTemplates.kt`, so the same books ship in the
phone framework and this web core. A book that carries art shows it in the materials panel under
「この えほんの え」, and selecting a caption on the page shows its text field whichever tool is
active. `pnpm ehon-check <file>` validates any document with the same code the app uses.

## Cloud configuration

Copy `.env.example` to `.env.local`. `VITE_EMULATOR_HOST=127.0.0.1` targets the emulators
with the same demo project and fake key the iOS debug build uses; otherwise the
`VITE_FIREBASE_*` values describe a provisioned project (see `backend/README.md`). Web API keys
are public identifiers; App Check (`VITE_APPCHECK_SITE_KEY`) is what gates the backend.
`VITE_ASSETS_URL` is the assets Worker domain; in emulator mode it defaults to the `localBlob`
function, which stands in for R2. `VITE_FONTS_URL` moves the font slices off the site (defaults
to `/fonts`).

## Fonts

`tools/slice-fonts.mjs` turns each face into unicode-range woff2 slices (decision 49): one kana
slice (ASCII, punctuation, hiragana, katakana, full-width forms, ~60 KB for Yomogi), kanji in
128-codepoint blocks (≤ 25 KB each), and one slice for everything else the face carries. Sources
are the bundled Yomogi, the complete faces staged by `cd backend && pnpm fonts` (or
`make web-fonts FETCH=1`), and the bundled Zen Maru Gothic subset as the UI fallback; faces that
are not staged are skipped and render with the system font. `loadFonts()` registers book-face slices
(the old UI face is skipped) and loads the body kana slice; `bookGlyphs(json)` loads what a book's
text needs through `EhonCodec.textByFace`, typing loads the current face's blocks, and the
`fonts` store's epoch bumps on `loadingdone` so every canvas re-measures and repaints once.
None of the six faces declares a Reserved Font Name, so slicing needs no rename.

## Local rows and sync

`src/cloud/localStore.ts` keeps one IndexedDB row per book: the codec JSON plus its journal
(owner, acknowledged baseline, revision, deletion flags), the same journal the phone keeps in
`sync-state.json`. Writes are serialized; `repository.flush()` resolves when they are durable, so
the shelf navigates only after a new book is on disk. Without IndexedDB the store degrades to
memory for the session.

`src/cloud/syncEngine.ts` is a structural twin of the iOS `SyncEngine`: one shelf listener per
account, one page listener per open book, a serialized writer per book with the revision guard,
the soft lease (heartbeat 60 s, TTL 175 s), refresh-merge-retry on a stale revision, and
`hasPendingWrites` echo suppression. Firestore runs with a memory cache: the repository's rows
are the durable copy, so offline edits are re-derived from the journal after a reload rather
than replayed by the SDK. Assembly and merge stay in Kotlin (`EhonCodec.assembleOrNull`,
`EhonCodec.merge`); TypeScript never edits a document.

`src/cloud/repository.ts` mirrors `BookRepository.swift`: rows are authoritative, first sign-in
claims only unowned drafts, signing out hides account rows, remote documents wait for a pointer
gesture to finish, and a remote replacement drops the editor's undo history
(`WebEditor.replaceBook`). Every asynchronous continuation re-checks the engine epoch, so a
sign-out cannot let a late result touch another account.

`src/cloud/assetLoader.ts` holds the decoded-bitmap LRU (256 MiB pixel budget; eviction drops the
image source) and `src/cloud/uploads.ts` the upload flow: PNG/WebP with alpha, ≤ 2048 px, checked
in the browser before `presignUpload` → PUT → `finalizeAsset` → an `illustrations` document.
`src/cloud/library.ts` turns the account's illustrations into `lib:` parts, cached per owner in
IndexedDB so books still paint offline, and registers them on every editor and reader.

## Facade boundary

`src/core.ts` imports only the generated `WebEditor`, `WebReader` and `EhonCodec`. TypeScript
sends intents; it never constructs or edits a scene. `pageJson()` returns `{version, page}` and
`bookJson()` returns `{version, book}`. Timestamps are JS numbers (epoch milliseconds).

Positions are page percentages. `sizePct` is width as a percentage of page width.
`heightPct` is a percentage of page height; pass `null` for a physical square.
`partHeightPct(id, width)` converts registered image aspect ratios into the correct height
for the book's page shape. Resize preserves aspect even when the width hits its clamp.

`registerPart()` combines personal/pack metadata with the built-ins. `setImageProvider()`
accepts `(ref: string) => HTMLImageElement | null | undefined`. The platform loader owns
caching, loading and repaint scheduling; the painter draws a neutral placeholder on a miss.
Call `clearMeasurements()` after a font slice loads (the desk, reader and thumbnails do this on
the `fonts` epoch). The width cache holds at most 2,048 entries. Call `dispose()` when leaving.

`WebReader` is the read-only twin for the reader and thumbnails: no history, no selection,
`speechText(i)` for read-aloud, `replyJson(i)` for family voices, `replaceBook()` for sync.
`EhonCodec.textByFace(json)` and `fontsJson(locale)` serve the font slices and the face picker;
`WebEditor.fontId` is the face new text will use.

AI/automation batches carry the revision from before the asynchronous request:

```ts
editor.applyIntents(JSON.stringify({
  bookId: editor.bookId,
  revision: editor.revision,
  intents: [
    { type: 'addPart', partId: 'いきもの:ねこ', xPct: 50, yPct: 60, sizePct: 26 },
    { type: 'rotateSelected' },
  ],
}));
```

The core rejects stale book/revision pairs, unknown intents and invalid batches; a successful
batch is one undo step. Batches cannot interrupt a pointer gesture. Available intents are
declared in `shared/src/commonMain/kotlin/app/ehon/engine/EditorIntent.kt`.

React receives the revision after discrete edits and finished/cancelled drags; pointer moves
never reach it. The reader turns pages with a transform on the spread strip and keeps at most
three spreads painted.

## Tests and budgets

`pnpm test` (Playwright, no cloud) checks all five template shapes/pages plus a mask/rotation
fixture, paints a document with embedded SVG art and opens a story template with its materials and
editable captions, and exercises drag undo, ruby, file validation, raster placement, stale intent
rejection, single-page pan/zoom, drawing/erasing, cancellation, pen/touch input, reload persistence, and library placement on the active page and adding a page. Run
`pnpm test --update-snapshots` in `web/` only when intentionally changing rendering; inspect the
resulting images.

`make web-sync-test` runs `tests/emulator/` inside `firebase emulators:exec` with the dev server
started in emulator mode. It signs two browser contexts into one emulator account and checks:
convergence within seconds and catch-up after `setOffline`, the edit lease making the second
composer read-only until the first closes, a guest link that opens without an account and dies
when revoked, a PNG upload that becomes a library part painted in both the composer and
another device's reader (through the `localBlob` stand-in for R2), and a scratch item that
survives a reload, reaches the other browser and lands on a page. In dev builds the page
exposes `window.__ehonRepository` for these tests only.

`make web-budget` builds, serves `dist/` through `tools/serve-dist.mjs` (gzip and the Pages
routes) and runs Lighthouse CI with the assertions in `lighthouserc.cjs`: script ≤ 300 KB and
total ≤ 700 KB on `/g/…`, script ≤ 600 KB and total ≤ 1 MB on `/` and `/app`, fonts ≤ 250 KB, and
zero third-party requests everywhere. Chrome comes from `CHROME_PATH` or Playwright's Chromium.
`.github/workflows/ci.yml` runs the shared tests, this suite with the budgets, and the backend
and browser emulator suites on every push and pull request.
