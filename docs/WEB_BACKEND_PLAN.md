# ぺたぺた — web studio and backend: implementation plan

Design started 2026-09-10; Phases 0–2 are implemented locally. **Direction corrected by the
owner on 2026-09-11** (decisions 52–53): drawing is the web app's primary workflow, with one
working page at a time and visible Home navigation. The earlier composition-only, all-pages
desk is superseded. Cloud provisioning and the advanced raster studio remain separate work.

---

## 0. Summary

**What.** A web app for grown-ups and creators — an illustration **studio** that opens ready to draw on one
page, optional composition tools, and a **reader** — plus a backend so one account owns
books and illustrations across web and phone, creators publish free illustration packs, and AI
(generate / edit / finish-a-paper-sketch / compose-by-prompt / story and furigana) is sold as a
subscription. Canvas drawing, composing, reading, sync and sharing are free.

**Stack.** Kotlin core compiled to JS (`shared` gains a `js` target and a Canvas2D painter) ·
TypeScript + React + Vite shell on Cloudflare Pages · Firebase Auth + Firestore + Functions v2
(asia-northeast1) · Cloudflare R2 for every blob · Stripe · Klecks (MIT) as the studio engine ·
Claude for text and intents · image provider behind one interface, chosen by testing.

**Order.** Phase 0 core → Phase 1 accounts and sync (iOS) → Phase 2 web reader + composer →
Phase 3 studio + AI + Stripe → Phase 4 packs + phone registry + paper capture. Each phase ships.

**Not in scope** (explicitly decided): live multiplayer, vector ink, paid packs, LINE login,
whole-book generation, family spaces, Android (phase 2 of the mobile plan, unchanged).

---

## 1. Decisions from the interview

| # | Question | Decision |
|---|---|---|
| 1 | Who is the web user | **A + B**: the grown-up in the family drawing for the child's books, and independent creators publishing packs |
| 2 | What a web drawing becomes | **A raster part.** Editable source kept web-side; flattened master with alpha, 2048px longest edge; referenced via `PartItem.partId`. Parts become non-square (codec v3) |
| 3 | Drawing engine | **Raster layers + PNG upload.** Embed Klecks (MIT, has embed mode, layers, pressure pen, stabiliser, brushes, fill, text, shapes, WebGL filters, line-art extraction). Vector ink later |
| 4 | Figma-like | **Canvas UX only, no multiplayer.** Soft lease per book, page-level last-write-wins, realtime listener so the phone updates within seconds |
| 5 | AI scope | generate (a), edit (b), compose-by-intents (c), story/furigana/translate (d), **paper-sketch-to-illustration via phone camera**. No whole-book generation |
| 6 | Platform | **Firebase** (Auth, Firestore, Functions, Tokyo) **+ Cloudflare R2** (zero egress). Official SDKs natively per platform; Kotlin core stays pure; pages stored as codec JSON strings |
| 7 | Ownership | **Personal.** `ownerId` field + one `isOwner()` rule helper so a family space can slot in later. Books sync only after a real sign-in |
| 8 | Sign-in | **Apple + Google only** |
| 9 | Creator publishing | **Free packs, manual approval by you**, fixed licence, required hand-drawn / AI-assisted label, `price: 0` and empty `entitlements` so paid packs touch billing only |
| 10 | Blob access | Content-addressed. **Rendered derivatives public by hash; layered sources and voice private via signed URLs.** Server-side finalize validates and derives. Fonts move to R2. No GC in v1 |
| 11 | Paying for AI | **AI is the subscription** (Stripe on the web, entitlement read by the phone, no purchase UI in the app). Free allowance = 0 by default, config knob for a trial. Drawing/composing/reading free |
| 12 | Guest link | **Read-only**, one revocable token per recipient, no expiry, no login. Voice replies stay recorded in person on the child's device; audio backed up to R2 |
| 13 | Web core | **Kotlin/JS** of `shared` with the Canvas2D painter written in Kotlin (`jsMain`); TS/React shell never touches a scene node |
| 14 | Web composer | **Composition only** (parts, text, pages, background) + a scratch area stored in a web-only side document. No crayon tool on web |
| 15 | AI reach | **Both こども and おとな**, quota belongs to the paying account. Raw photos never stored; prompts/jobs kept 30 days; paid API tiers with no-training terms only; children's-book system prompt + provider filter + a naughty-prompt test set |
| — | Cross-cutting | **No leaks, no races, performance-first flat UI** (§11) |

---

## 2. Architecture

```
 iPhone / iPad (SwiftUI + EhonCore KMP)          Browser (TS/React shell + EhonCore Kotlin/JS)
 ┌──────────────────────────────────┐            ┌──────────────────────────────────────────┐
 │ LocalBookStore (JSON files)      │            │ reader.html  app.html  studio.html       │
 │ BookRepository ── sync ──┐       │            │ Firestore JS (IndexedDB persistence)     │
 │ AssetLoader (disk LRU)   │       │            │ Klecks (lazy)   Stripe.js (lazy)         │
 │ PartRegistry (packs)     │       │            └───────┬──────────────┬───────────────────┘
 │ PaperCapture (Vision)    │       │                    │              │
 └──────────┬───────────────┼───────┘                    │              │
            │ https         │ Firebase iOS SDK           │ Firebase JS  │ https
            ▼               ▼                            ▼              ▼
   ┌─────────────────┐   ┌──────────────────────────────────────┐   ┌─────────────────────────┐
   │ assets.<domain> │   │ Firebase (asia-northeast1)           │   │ Cloud Functions v2 (TS) │
   │ Cloudflare CDN  │   │  Auth: anonymous, Apple, Google      │   │  presignUpload/finalize │
   │  ↓              │   │  Firestore: books, pages, illustr.,  │   │  signedRead             │
   │ R2 bucket       │◀──│   packs, shares, jobs, usage,        │◀─▶│  ai.intents/text/image  │
   │  a/<hash>/…     │   │   entitlements, config               │   │  stripe.*  share.*      │
   │  s/… v/… fonts/ │   │  App Check on every callable         │   │  pack.*  guest.book     │
   └─────────────────┘   └──────────────────────────────────────┘   │  scheduled: cleanup     │
                                                                    └───────┬────────┬────────┘
                                                                            ▼        ▼
                                                                 Claude API     Image provider
                                                                 (claude-opus-5) (TBD, interface)
```

Rules of the shape:

- **Mutation stays in Kotlin** on every platform (record: interop conclusion). Swift, TS and the
  AI agent all speak intents to `EditorController`.
- **The phone's local files remain the store**; sync is a layer on top (`BookRepository`).
  Decision 14's "Firestore *is* the store" is superseded: the app already has a working local store.
- **Functions are the only writer** of `assets`, `jobs`, `usage`, `entitlements`, `packs.status`.
- **Blobs never pass through Functions** on upload: presigned PUT straight to R2, then finalize.

---

## 3. Data model

### 3.1 Codec v3 (`BookCodec.FORMAT_VERSION = 3`)

| Change | Why |
|---|---|
| `Page.id: String` (new, e.g. `"p1"`) | Page-per-document sync needs a stable key; reordering becomes an update to `pageIds` only. v2 decode assigns `p1..pn` |
| `PartItem.heightPct: Float? = null` | Non-square parts. `sizePct` is percent of page width; `heightPct` is percent of page height; `null` means a physical square. Resize scales both by the effective, clamped width factor |
| `PartId` forms | `"かたち:まる"` built-in (unchanged) · `"lib:<illustrationId>"` personal library · `"pack.<packId>:<slug>"` installed pack. All fit the existing `category:name` split |
| `PartDef.Raster(assetRef)` | `assetRef` is an opaque `"a/<sha256>"`; the platform `AssetLoader` maps it to URL or file. `SceneNode.Image(assetName)` unchanged |
| `SceneBuilder(measurer, resolver: PartResolver = PartCatalog)` | Registry seam: built-ins + library + packs |

Decode policy unchanged: refuse anything newer, `ignoreUnknownKeys` for older readers of same version.

### 3.2 Firestore

```
users/{uid}                        { locale, createdAt }
books/{bookId}                     { ownerId, meta (codec JSON of Book with pages=[]), pageIds[],
                                     updatedAt, revision, lease{deviceId, expiresAt}?, deleted }
books/{bookId}/pages/{pageId}      { ownerId, json (codec JSON of Page), updatedAt }
workspaces/{bookId}                { ownerId, scratch[] (web-only: illustrationId, x, y, scale) }
illustrations/{illId}              { ownerId, title, masterRef, w, h, sourceRef?, sourceVersion,
                                     origin: blank|upload|photo|ai, aiAssisted, createdAt, updatedAt, deleted }
assets/{sha256}                    { bytes, mime, w, h, hasAlpha, derivatives[], createdBy, createdAt }   (Functions only)
packs/{packId}                     { ownerId, name, tags[], label: hand|ai, status: draft|pending|approved|rejected,
                                     parts[{slug, illId, masterRef, w, h}], price: 0, installs, reviewNote, createdAt }
packs/{packId}/entitlements/...    (empty in v1 — seam for paid packs)
shares/{token}                     { bookId, ownerId, createdAt, revokedAt? }
jobs/{jobId}                       { ownerId, kind, status: queued|running|done|failed, input, outputRef?, error?, createdAt, expiresAt }
usage/{uid}_{yyyymm}               { images, textCalls }                                                 (Functions only)
entitlements/{uid}                 { plan, status, currentPeriodEnd, stripeCustomerId }                   (Functions only)
reports/{id}                       { reporterUid, target, reason, createdAt }
sessions/{uid}                     usage counters from decision 22 (any signed-in or anonymous uid, own doc only)
config/flags                       { aiEnabled, freeImages, watermarkFree, planImageLimit }
```

Why page-per-document stays: a 20-page book with heavy finger drawing approaches 1 MiB; a page
write is the unit of change; page LWW keeps two devices' edits to different pages.

### 3.3 R2 keys (one bucket per environment, `ehon-assets-{dev,prod}`)

| Key | Access | Contents |
|---|---|---|
| `a/<sha256>/m.{png,webp}` | public via `assets.<domain>` | master, ≤ 2048px longest edge, alpha |
| `a/<sha256>/1024.webp`, `a/<sha256>/256.webp` | public | render derivative (phone, web), thumbnail |
| `s/<uid>/<illId>/<n>.zip` | private, signed GET | layered source (manifest.json + one PNG per layer, or Klecks' native project) |
| `v/<uid>/<bookId>/<replyId>.m4a` | private, signed GET | voice reply backup |
| `fonts/<file>.ttf` | public | the five downloadable faces (closes record risk 7) |

Edge cache rule on `assets.<domain>`: cache everything one year, immutable (keys are hashes).

### 3.4 Thumbnails

None stored. Shelf and gallery thumbnails are rendered on demand from the codec JSON by the same
painter (books are ~150 KB; page 1 at 256px is a few milliseconds). One less pipeline.

---

## 4. Backend functions (Firebase Functions v2, TypeScript, `asia-northeast1`, App Check enforced)

| Function | Type | Contract |
|---|---|---|
| `presignUpload` | callable | `{kind: master\|source\|voice, sha256, bytes, mime}` → `{key, url, headers}`. Rejects > 25 MB, unknown mime, over-quota storage |
| `finalizeAsset` | callable | `{key}` → validates with sharp (format, ≤ 2048px, alpha), writes `1024.webp` + `256.webp`, upserts `assets/{sha256}`. **Idempotent by hash** |
| `signedRead` | callable | `{key}` → presigned GET (10 min) for `s/` and `v/` after owner check |
| `ai.intents` | callable | `{bookId, pageIndex, pageJson, prompt, catalog[], locale}` → `{intents[], say}` (structured output). Entitlement + rate limit + `aiEnabled` |
| `ai.text` | callable | `{kind: story\|furigana\|translate, ...}` → structured JSON |
| `ai.image` | callable | `{kind: generate\|edit\|finish, prompt, sourceRef?, maskRef?, style}` → `{jobId}`; job runs in the same invocation (timeout 300 s, 1 GiB), result finalized as an asset, `jobs/{id}` updated; client listens |
| `stripe.checkout`, `stripe.portal` | callable | create Checkout / Portal sessions |
| `stripe.webhook` | https | `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` → `entitlements/{uid}` |
| `share.create`, `share.revoke` | callable | token per recipient |
| `guest.book` | https GET `/g/:token` | book JSON snapshot (meta + pages), `Cache-Control: 60`; assets are public-by-hash so the client derives URLs |
| `pack.submit` | callable | draft → pending; freezes `parts[]` |
| `pack.review` | callable, admin claim | approve / reject with note |
| `pack.install` | callable | increments `installs` (usage signal for decision 22) |
| `cleanup` | scheduled daily | delete `jobs` past `expiresAt` (30 d), expired shares' tokens are kept but revoked |
| `budgetGuard` | Pub/Sub (GCP budget alert) | flips `config/flags.aiEnabled = false` — the automatic kill switch |

Option to shorten Phase 3: the Invertase "Run Payments with Stripe" Firebase extension replaces
`stripe.*` if its `customers/{uid}/subscriptions` layout is acceptable; the entitlement read on
the phone then points there.

---

## 5. Security rules (sketch)

```
function signedIn()            { return request.auth != null; }
function isOwner(data)         { return signedIn() && data.ownerId == request.auth.uid; }
function keepsOwner()          { return request.resource.data.ownerId == resource.data.ownerId; }
function notOlder()            { return request.resource.data.updatedAt >= resource.data.updatedAt; }

match /books/{id}              { allow read: if isOwner(resource.data);
                                 allow create: if isOwner(request.resource.data);
                                 allow update, delete: if isOwner(resource.data) && keepsOwner() && notOlder(); }
match /books/{id}/pages/{p}    { allow read, write: if isOwner(get(/databases/$(db)/documents/books/$(id)).data)
                                                     && (request.method != 'update' || notOlder()); }
match /workspaces/{id}         same as books
match /illustrations/{id}      owner read/write; `masterRef` must exist in /assets (get())
match /assets/{h}              allow read: if true;  allow write: if false;        // Functions only
match /packs/{id}              allow read: if resource.data.status == 'approved' || isOwner(resource.data);
                                 allow create, update: if isOwner(...) && request.resource.data.status in ['draft','pending']
                                                        && request.resource.data.price == 0;
match /shares/{t}              owner read/write; guests never read Firestore (they call guest.book)
match /jobs/{id}, /usage/{id}, /entitlements/{uid}   owner read; write false
match /sessions/{uid}          allow write: if request.auth.uid == uid
match /config/flags            allow read: if true; write false
```

Tested with `@firebase/rules-unit-testing` against the emulator (Phase 1 acceptance).

---

## 6. Sync protocol

**Identity.** Anonymous at launch (unchanged). Sign-in at できあがり or settings. New credential →
`link` onto the anonymous UID. Credential already exists (signed up on web first) → sign in,
switch UID, re-upload local books (they were never in the cloud, so no server-side move).
Firebase Auth "auto-delete anonymous users" must stay **off**. The **web** has no anonymous stage
(decision 58): a visitor sees the landing page until Apple, Google or the phone app signs them in.
The phone vouches for a browser through `qrLoginStart` → `qrLoginApprove` → `qrLoginClaim`, whose
custom token carries `handoff: 'app'`; rules and callables accept that claim beside the providers.

**Phone (`BookRepository` in Swift, behind the interface `LocalBookStore` already has).**

1. Save path: `EditorModel.saveNow()` → local file (as today) → `SyncEngine.enqueue(bookId)`.
2. One serialized writer per book. It diffs each page's JSON hash against `lastSynced`, then one
   batched write: book meta (`revision + 1`, `updatedAt`), dirty pages, `pageIds`. Coalesces
   while a write is in flight. Retries with backoff; offline writes queue in the Firestore SDK.
3. Shelf listener: `books where ownerId == uid and deleted == false`.
4. Open-book listener: `pages` of the open book. Remote page newer than local **and** page not
   locally dirty → replace in local store, bump `EditorModel`. Snapshots with `hasPendingWrites`
   are ignored (echo suppression).
5. Lease: `runTransaction` compare-and-set on `lease` (null, expired, or same `deviceId`),
   heartbeat 60 s, TTL 180 s, released on background/close. Another holder → read-only badge
   「ウェブで へんしゅうちゅう」. Reading ignores leases.
6. First sign-in: upload every local book. Delete = `deleted: true` (hard delete later).

**Web.** Same protocol with the Firestore JS SDK and IndexedDB persistence for the composer.
Studio saves are blob uploads + one `illustrations` write; they do not touch books.

**Assets on the phone.** `AssetLoader.image(ref)`: memory LRU (pixel budget) → disk cache in
`Caches/assets/<hash>/1024.webp` → `https://assets.<domain>/a/<hash>/1024.webp`. Print uses `m.*`.
Missing asset renders the 256 thumb or a neutral placeholder, never a crash.

---

## 7. Web app (`web/`, Vite + React + TypeScript, Cloudflare Pages)

Three entries: `reader.html` (guest + owner reading; ≤ 300 KB gz incl. core), `app.html`
(shelf, composer, library, packs, settings; ≤ 600 KB gz), `studio.html` (Klecks; lazy).

### 7.1 Kotlin/JS facade (`shared/src/jsMain`, `@JsExport`)

```kotlin
class WebEditor(bookJson: String, measure: (String, Double, String) -> Double) {
  val revision: Int; fun bookJson(): String; fun pageJson(i: Int): String
  fun goToPage(i: Int); fun addPage(); fun movePage(from: Int, to: Int)
  fun addPartAt(partId: String, xPct: Double, yPct: Double, sizePct: Double, heightPct: Double)
  fun selectAt(xPct: Double, yPct: Double, w: Double, h: Double): String?
  fun beginDrag(); fun dragTo(x: Double, y: Double); fun endDrag()
  fun resizeSelected(bigger: Boolean); fun rotateSelected(); fun deleteSelected()
  fun bringForward(); fun sendBackward(); fun setPageBackground(argb: Int)
  fun setDraftText(s: String); fun setDraftRuby(s: String); fun setTextSize(step: Int)
  fun setFont(id: String); fun setTextColour(i: Int); fun commitText(): Boolean
  fun applyIntents(json: String)          // AI: one gesture = one undo step
  fun undo(); fun redo(); val canUndo: Boolean; val canRedo: Boolean
  fun render(ctx: CanvasRenderingContext2D, w: Double, h: Double, pageIndex: Int, forExport: Boolean)
  fun registerPart(partId: String, assetRef: String, aspect: Double, nameJa: String, nameEn: String)
}
object EhonCodec { fun formatVersion(): Int; fun decodeOk(json: String): Boolean; fun instantiateTemplate(id: String, ...): String }
```

Rules: primitives, `Double` for timestamps (`Long` does not export), JSON strings for anything
structured. Core additions needed: `EditorController.addPartAt`, `applyBatch(intents)` wrapped in
one `DocumentStore` gesture, `PartResolver`.

### 7.2 Painter (`jsMain/CanvasPainter.kt`)

Structural twin of `ScenePainter.swift` / `ScenePainter.kt`: Group (translate-rotate about
pivot), Ellipse, RoundRect (per-corner radii), Polygon, Ring/Crescent/Arc (even-odd), Image
(via `(ref) -> ImageBitmap?` callback; a miss schedules one repaint on load), Text + ruby
(`fillText` at resolved origins; fonts loaded with `FontFace` API from `fonts/` before first
paint), StrokePath (round joins/caps, `destination-out` for erase), SelectionRing (dashed).
`measureText` results memoised by (text, size, face). Golden fixtures: six pixel goldens rendered
by Playwright and compared to the iOS painter PNGs (record tier 2).

### 7.3 Drawing workspace (implemented)

- `/app` creates a locally saved book with one white page and the brush selected. The shelf's
  primary action does the same. Templates remain optional; `/app?template=doc-love-letter` is a test preview.
- The canvas renders **only the active page**. A thumbnail strip switches pages and adds pages.
  Fit-to-page, zoom and pan apply to that page; there is no all-pages canvas view.
- A persistent labelled toolbar exposes brush (B), eraser (E), selection (V), text (T), materials
  (I) and hand (H). The side panel shows the active tool's settings: drawing colors and brush
  sizes, text/ruby/font fields, or the illustration library. Drawing is available without login.
- Mouse, pen and touch send normalised stroke points through `WebEditor` to `EditorController`.
  Coalesced samples repaint once per animation frame; a finished stroke is one undo step.
  Escape, pointer cancellation and switching from one finger to pinch restore the gesture
  baseline. Erasing affects the ink layer, preserving paper and placed art.
- Space / middle button / hand pan; wheel pans and Ctrl/Command + wheel or two fingers zoom.
  Ctrl/Command + Z and Shift + Z undo/redo. Tool shortcuts leave text entry alone.
- System sans-serif renders all controls, including Japanese kanji. The six sliced book faces
  remain available for lettering. A failed book-font download does not block the web UI.
- Home is always visible, including on small screens; the logo also links to the shelf. Saved
  books autosave locally, and `.ehon` download and PNG page export are available in the header.
- Materials still support click-to-place and optional dragging. Personal illustrations can
  retain scratch positions in the existing web-only workspace document; this is supplemental
  to drawing. Sync, leases and asset storage keep their existing contracts.

### 7.4 Studio (Klecks)

Embed mode in `studio.html`. Canvas size fixed per illustration (≤ 2048 longest edge). Save →
export layers (or Klecks' project) into a zip → `presignUpload(source)` → PUT → flatten to PNG with
alpha → `presignUpload(master)` → PUT → `finalizeAsset` → write `illustrations/{id}`. Autosave to
IndexedDB every 30 s; explicit save to cloud. **Spike first** (Phase 3 step 1): confirm embed API,
undo memory behaviour, layer export, pressure on Safari/iPad, and bundle size.

### 7.5 AI in the browser

Never calls a provider. Calls Functions with the Firebase ID token; shows the subscription card on
`subscription_required`; applies `intents` inside `applyIntents`; image jobs are watched via the
`jobs/{id}` listener and land in the library as `origin: ai, aiAssisted: true`.

---

## 8. iOS changes

| Phase | Change |
|---|---|
| 0 | Codec v3 consumers: `PartItem.heightPct` in `SceneBuilder` box; `PartResolver` injection |
| 1 | Firebase iOS SDK via SPM in `project.yml` (Auth, Firestore, AppCheck); Sign in with Apple + Google; `BookRepository` + `SyncEngine` (§6); sign-in card at できあがり and in settings; lease badge; voice backup to `v/`; entitlement listener; fonts from `assets.<domain>/fonts/` |
| 1 | `AssetLoader` with disk LRU; `ScenePainter` Image node fetches through it; placeholder on miss |
| 2 | Shelf shows web-made books via listener (nothing new beyond §6) |
| 3 | AI on phone (paid): paper "finish", furigana, prompt box in おとな drawer and こども (quota is the account's) |
| 4 | `PartRegistry`: pack install → manifest + 1024 derivatives cached → new categories in the はる rail; `pack.install` counter |
| 4 | Paper capture: `VNDetectDocumentSegmentationRequest` → perspective crop → white-balance → luminance-to-alpha → master PNG → presign/finalize → `lib:` part. Works offline up to the upload (queued). Raw photo discarded |

---

## 9. AI layer

**Text and intents — Claude.** Model `claude-opus-5` (Messages API, `@anthropic-ai/sdk`;
adaptive thinking is on by default; `output_config.effort: "low"` for intents, `"medium"` for
story). Structured outputs via `output_config.format` with JSON schemas for `Intents`,
`Furigana`, `Story`. Prompt caching: stable system prompt + intent schema + catalog first,
volatile page JSON and prompt last. Handle `stop_reason == "refusal"` with a friendly message.
Streaming not needed (outputs are small JSON). Cheaper model is the owner's call, not the code's.

**Intents schema** (`ai.intents` output): `{ intents: [ {op:"addPart", partId, x, y, sizePct},
{op:"addText", text, ruby?, sizeStep, colorIndex, font, x, y}, {op:"move", itemId, x, y},
{op:"resize", itemId, bigger}, {op:"rotate", itemId}, {op:"delete", itemId},
{op:"setBackground", index}, {op:"bringForward"|"sendBackward", itemId} ], say: string }`.
The catalog passed in is the union of built-ins, the user's library and installed packs, with
Japanese/English names and aspects.

**Images — provider interface** (`backend/functions/src/ai/imageProvider.ts`):
`generate(prompt, size, style)`, `edit(image, prompt, mask?)`, `finish(sketch, prompt, style)`.
Candidates: Google's Gemini image model via Vertex (paid tier), OpenAI `gpt-image-1` edits,
Flux Kontext via fal/BFL. **Pick by testing `finish` on your own paper drawings.** Alpha: ask for
a flat white background and apply the same luminance-to-alpha routine as paper capture; a real
matting model is a later upgrade.

**Quota and abuse.** Order inside every AI callable: App Check → `config/flags.aiEnabled` →
`entitlements/{uid}.status == active` (else `subscription_required`) → transaction on
`usage/{uid}_{yyyymm}` against `planImageLimit` and a per-day cap → per-uid sliding-window rate
limit doc → provider call with client-supplied idempotency key on `jobs/{id}`. `budgetGuard`
flips `aiEnabled` from a GCP budget alert automatically.

**Safety.** Children's-picture-book system prompt; provider safety at the strictest setting;
`reports/` collection + report button in app and web; `backend/functions/test/prompts-naughty.json`
run manually before each release (it costs money); generated images always labelled `aiAssisted`.

**Retention.** `jobs` (with prompts) deleted after 30 days by `cleanup`. Raw photos never
uploaded. Generated images are ordinary owned assets.

---

## 10. Billing

Stripe Checkout (one subscription price, JPY, Stripe Tax on) and Customer Portal on the web.
Webhook → `entitlements/{uid}`. The iOS app **never** mentions price, purchase or upgrade; it
shows 「ウェブで つかえます」 at most. `config/flags`: `freeImages` (default 0), `watermarkFree`
(default false — drawing is the free product; the seam from decision 11 stays available),
`planImageLimit` (start 200/month), per-day cap 40.

---

## 11. Non-functional rules (enforced in review, not aspirational)

**Leaks**
- Bitmaps live in one LRU keyed by pixel count, cap ≈ 256 MB in the browser and 64 MB on the
  phone; eviction does `canvas.width = 0` / `ImageBitmap.close()`.
- One Firestore listener per open book, owned by the route; a dev-mode counter asserts the count.
- Every window listener, timer and fetch hangs off one `AbortController` per screen.
- Undo stacks bounded: `DocumentStore` 50 snapshots (exists); studio undo by byte budget.
- Klecks instance disposed on route leave; verify in the spike with heap snapshots.

**Races**
- One serialized writer per book carrying `revision`; rules reject older `updatedAt` (§5).
- Echo suppression: ignore `hasPendingWrites` snapshots and remote states older than local.
- Async results (AI intents, sync pulls) carry `bookId` + `revision`; a gate discards stale ones.
- Leases are compare-and-set transactions with heartbeat and TTL.
- Jobs and quota: client-generated `jobId`, quota decrement in the same transaction; finalize
  idempotent by hash; presign is side-effect free.
- Pointer capture per stroke; foreign `pointerId`s ignored; coalesced events drained in one rAF.
- The `EditorController` is only mutated from synchronous UI handlers or the intents gate.

**Performance-first UI**
- Flat chrome: Organic colours and radii, no paper grain, no shadows on repeated elements, no
  blur, transform-only page slide in the reader.
- React never handles pointer moves; page repaints only when `revision` changes.
- Three entries, lazy Klecks/Stripe/auth; 256px thumbnails in virtualised lists.
- Budgets: reader ≤ 300 KB gz, composer ≤ 600 KB gz, TTI ≤ 2 s on a 2019 iPad Safari, 60 fps drag
  on a 20-item page. Measured in CI with Lighthouse on Pages preview builds.

---

## 12. Phases, tasks, acceptance

### Phase 0 — Core groundwork (implemented; no backend, no accounts)
1. `shared/build.gradle.kts`: add `js { browser(); nodejs(); binaries.library(); generateTypeScriptDefinitions() }`; fix anything JVM-only the JS compile reveals. `./gradlew :shared:jsTest` runs the common suite on Node and headless Chrome.
2. Codec v3: `Page.id`, `PartItem.heightPct`; v2 fixture decodes with `p1..pn` and `heightPct = null`; new goldens for a non-square part; `BookCodecTest` size test still passes.
3. `PartResolver` interface; `PartCatalog : PartResolver`; `SceneBuilder(measurer, resolver)`; `PartDef.Raster(assetRef)` rendered as `Image`.
4. `EditorController.addPartAt(...)`, `applyBatch(...)` (one gesture), `resizeSelected` scales `heightPct`.
5. `jsMain`: `WebEditor` facade + `CanvasPainter` + `EhonCodec`.
6. `web/` scaffold (Vite, React, TS, pnpm); a harness page renders template `t1` page 1 through the facade; `make web-core` copies the Kotlin/JS package into `web/vendor/ehon-core`; `make web` runs Vite.
7. Compose and Swift painters take `heightPct` into account through the scene (no change if the scene carries the box — verify).

**Accept:** `make test` green on JVM and JS; harness page visually matches `build/shots/editor.png` for t1; iOS app still builds and opens v2 books.

Implementation notes: the harness is `web/app.html` (also served at `/`), with local file
open/save and no cloud writes. The t1 painter has been visually compared with the native
640px baseline. Six Playwright snapshots cover templates and primitive masks; native tests
cover v2 migration and non-square geometry. `WebEditor.applyIntents` takes
`{bookId, revision, intents}` and rejects stale results before applying one atomic undo step.
`BookCodec.encodePage/decodePage` use a versioned `{version, page}` envelope for future sync.
The generated facade exposes typed DOM contexts/images and no `any`; see `web/README.md`.

### Phase 1 — Accounts and sync (iOS) (implemented locally; cloud provisioning pending)
1. Firebase projects `ehon-dev`, `ehon-prod` (Tokyo); Auth: anonymous, Apple, Google; auto-delete anonymous **off**; App Check (DeviceCheck / reCAPTCHA Enterprise).
2. `backend/`: `firebase.json`, `firestore.rules` (§5), indexes, emulator config, rules tests.
3. R2 buckets + CORS + custom domain `assets.<domain>`; edge cache rule; upload the five fonts.
4. Functions: `presignUpload`, `finalizeAsset`, `signedRead`, `cleanup`, `budgetGuard`.
5. iOS: SPM Firebase, sign-in card, `BookRepository`, `SyncEngine`, lease, `AssetLoader`, fonts from R2, voice backup, entitlement listener (reads only).
6. `Makefile`: `emulators`, `functions-deploy`, `rules-test`.

**Accept:** two simulators on one account converge within 5 s; airplane-mode edits catch up; rules tests pass; a v3 book with a remote raster part renders on the phone from the CDN and from cache offline.

Implementation notes: `make rules-test` covers rules, asset finalize/quotas, cleanup, budget guard,
guest links and the QR login (22 tests); `make sync-test` runs two native clients against the
emulators. The dev project `petapeta-dev` exists since 2026-09-13 with its Tokyo database, rules,
indexes and functions deployed, the R2 bucket behind the assets Worker and the web on Cloudflare
Pages; App Check registration and budget alerts follow the provisioning steps in `backend/README.md`.

### Phase 2 — Web reader, shelf, composer (implemented; dev deployed)
1. Auth on web (Apple, Google, and the QR hand-off from the phone) behind a landing page, shelf from listener, `/read/:id` with transform-only spread. ✔
2. `guest.book` + `share.*`; `/g/:token` reader without login; share screen on iOS uses real links (system share sheet still carries `.ehon`/PDF). ✔
3. Drawing workspace: one active page, brush/eraser, pan/zoom, contextual library panel with **PNG upload → illustration** (presign, flatten check, finalize), text with furigana, page ops, scratch workspace doc, lease. ✔
4. Playwright pixel goldens for the painter; Lighthouse budgets in CI. ✔

**Accept:** upload a PNG on the web → it appears in the phone's はる rail within 10 s → place it → phone renders it; a guest link opens on iOS 17 Safari with no login; composer holds 60 fps dragging on a 20-item page.

Implementation notes: three entries (`/` shelf, `/app[/id]` composer, `/read/:id` and `/g/:token`
reader) over one bundle graph; `web/src/cloud/` holds the IndexedDB row store, the `SyncEngine`
twin, the repository, the bitmap LRU, the upload flow, the part library and the workspace
document; `web/src/desk/` is the single-page drawing workspace (§7.3). Kotlin gained `WebReader`,
`WebEditor.replaceBook`, `WebEditor.fontId` and the helpers on `EhonCodec` (`syncMetadata`,
`pagesJson`, `assembleOrNull`, `merge`, `summaryJson`, `textByFace`, `fontsJson`). Functions gained
`shareCreate`, `shareRevoke`, `guestBook`, the QR login trio `qrLoginStart` / `qrLoginApprove` /
`qrLoginClaim` (decision 58; `loginRequests` is closed to clients and purged by `cleanup`) and the
emulator-only `localBlob` stand-in for R2. Story templates are no longer compiled into the clients:
`assembleTemplates` writes `shared/build/templates/{index.json,*.ehon.json}`, `make templates-upload`
publishes them under the Worker's `templates/` prefix, and `web/src/templates.ts` and the iOS
`TemplateCatalog` fetch the index and the documents at runtime, caching by content hash (decision 60);
development builds read the assembled copy locally, served by the dev server and bundled into a Debug
iOS build (decision 61). The
iOS share screen creates one guest link per chosen family member (label = their name) and
lists/revokes them; `EhonWebURL` names the web origin. Fonts ship as unicode-range woff2 slices
built by `web/tools/slice-fonts.mjs` (decision 49): the body face
loads eagerly; web controls use system sans-serif, kanji blocks load as a book or the typed text needs them, and every canvas re-measures
and repaints when a batch lands. Byte budgets (§11) are asserted by Lighthouse CI on a gzip-served
production build (`make web-budget`, `web/lighthouserc.cjs`) and run in `.github/workflows/ci.yml`
with the shared, web and backend suites. `make web-sync-test` drives two browser contexts through
convergence and offline catch-up, the lease, a guest link's life and death, a PNG upload painted
on both devices, a scratch item that survives a reload, reaches the other browser and lands on
a page, and the QR hand-off from the landing page to a signed-in browser. Not built: marquee
selection and multi-select on the desk, dragging a placed part off a page back onto the desk, a
per-book memory of the last view, and Universal Links so a plain camera scan of the login QR opens
the app (needs an Apple team id for the associated domain).

### Phase 3 — Studio, AI, Stripe
1. **Klecks spike** (embed API, layer export, undo memory, Safari pressure, bundle) — go/no-go.
2. `/studio/:illId`: new, open, save (source + master), autosave, version list.
3. Functions `ai.intents`, `ai.text`, `ai.image` with the provider interface; pick the image provider by testing `finish` on paper drawings.
4. Stripe (or the Invertase extension), `entitlements`, settings/billing page, `config/flags`.
5. Prompt box in the composer; furigana button in the text editor; phone AI entry points.
6. Naughty-prompt test set; report buttons.

**Accept:** a subscribed test account generates, edits and places an illustration; a free account sees the subscription card; 100 rapid calls → rate-limited; budget alert flips `aiEnabled` in the emulator test.

### Phase 4 — Packs, phone registry, paper capture
1. Pack editor on web (draft → submit), `/admin/review` behind an admin claim, gallery of approved packs.
2. iOS `PartRegistry`, install flow, dynamic categories, `pack.install` counter, `pack.` part ids in the codec tests.
3. Paper capture on iOS (Vision → alpha → asset → `lib:` part), AI `finish` for subscribers.

**Accept:** an approved pack appears on a fresh install without an app update; a paper drawing becomes a part in under 5 s offline; `finish` returns an illustration for a subscriber.

### Phase 5 — later
Android (Compose painter is ready), family spaces (`ownerId` → space id), LINE via OIDC, paid packs, GC sweep, vector ink layer, template harvesting from web books (record open item).

---

## 13. Repository, tooling, environments, cost

```
shared/            + js target, src/jsMain (WebEditor, WebReader, CanvasPainter, EhonCodec)
web/               Vite + React + TS: index/app/read entries, src/{shelf,main,read}.tsx, src/cloud, src/desk, src/ui,
                   tools/{slice-fonts,serve-dist}.mjs, lighthouserc.cjs, tests/{,emulator}, vendor/ehon-core + public/fonts (generated, git-ignored)
backend/           firebase.json, firestore.rules, firestore.indexes.json, functions/ (TS: assets, share, maintenance, localBlobs), assets-worker/, test/
.github/workflows/ ci.yml: shared tests, web tests + budgets, rules and browser sync against the emulators
docs/              WEB_BACKEND_PLAN.md (this), DECISIONS.md (29–51 added)
Makefile           + web-core, web, web-build, web-test, web-fonts, web-budget, web-sync-test, emulators, rules-test, functions-deploy
```

Tooling: Node 22, pnpm, Firebase CLI + emulator suite, Wrangler (R2 setup), Playwright,
`@firebase/rules-unit-testing`. Secrets via Firebase Functions params/secrets, never in the repo.
Two environments: `dev` (emulators + `ehon-dev` + `ehon-assets-dev`) and `prod`.

Cost at zero users: domain only. Firebase Blaze free quotas, Cloudflare free tier, Stripe per
transaction. Variable costs are AI calls (covered by the subscription) and Functions compute for
finalize (fractions of a yen per image). GCP budget alerts at ¥3,000 and ¥10,000 / month; the
second one triggers `budgetGuard`.

---

## 14. Open items and risks

- **Klecks fit** is assumed from its README (MIT, embed mode, layers, pressure, brushes, filters,
  line-art extraction). PSD import and undo limits were not confirmed — the Phase 3 spike decides.
- **Image provider** unchosen; quality on paper sketches is the deciding test.
- **Kotlin/JS export gaps** (`Long`, collections, sealed hierarchies) are handled by the facade,
  but `generateTypeScriptDefinitions` output should be checked once for `any` leaks.
- **Pixel parity** across three painters is a human check plus six Playwright goldens.
- **Codec v3 refuses older apps**: closed testers must update before web-made books open on the phone.
- **Apple review**: no purchase mention in-app; Sign in with Apple present; kids-category rules
  apply if the app is listed there (no third-party analytics — decision 22 already complies).
- **Lease UX** on the phone when the web tab was simply closed: TTL of 3 minutes is the wait.
- **Domain/name** still pending trademark check (record header).
- **Web lease release on tab close is best-effort**: `pagehide` starts the release transaction but the
  browser may cut it; the phone or another tab then waits for the 175 s TTL. In-app navigation
  releases reliably.
- **`guestBook` has no App Check**: the token is the whole capability. Add a per-IP limit or App
  Check on the reader page if abuse appears.
- **Web fonts are sliced, not subset**: every glyph is still available, but a kanji typed for the
  first time paints in the fallback face for the ~100 ms its 20 KB block takes to arrive, then
  repaints. Serving the slices from the assets domain instead of the site is a one-line
  `VITE_FONTS_URL` change if Pages' file count ever matters (1,169 files today).
- **Lighthouse in CI runs on a local gzip server**, not on a Pages preview; sizes match, timings do
  not, so only byte budgets are asserted.
- **Scratch items are last-writer-wins** between two browsers of one account; they are a parking
  area, not book content, so no merge is attempted.

---

## 15. Next-session bootstrap (start here)

1. Read this file and `DECISIONS.md` rows 29–53. The owner's drawing-first and single-page corrections (#52–53) supersede the earlier desk direction.
2. Verify the baseline: `make test` (JVM + JS), `make web-test` (harness, desk, painter goldens),
   `make rules-test`, `make web-sync-test` (emulators), `make web-budget` (Lighthouse byte
   budgets), `make ios` (simulator build). `make web` starts the shelf. The same targets run in
   `.github/workflows/ci.yml` on Linux; the iOS build stays local.
3. Provisioning is the owner's work and blocks nothing local: follow `backend/README.md`
   "Provision dev and prod", then fill `web/.env.local` and `iosApp/Config/Cloud.local.xcconfig`
   and smoke-test Apple/Google sign-in, App Check and a real R2 upload on the dev project. Before
   the first Pages deploy run `make web-fonts FETCH=1` so the five downloadable faces are sliced too.
4. Phase 2 is complete apart from the desk niceties listed in its implementation notes (marquee
   selection, part → desk, remembered view). Then Phase 3 in the order in §12: the Klecks spike
   decides the studio; `ai.intents` first (it reuses `EditorIntent` end to end), then `ai.text`,
   then the image provider after the paper-sketch quality test; Stripe last, behind `config/flags`.

Conventions carried over from the repo: mutation only in Kotlin; comments only for non-obvious
why; no videos in PRs; keep every `BookCodec` version decodable; `make test` before every commit.
