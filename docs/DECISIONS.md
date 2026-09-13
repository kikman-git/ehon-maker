# ぺたぺた — decision record

Working name **ぺたぺた** (Petapeta). Needs checking against the App Store, Play,
J-PlatPat (商標) and a domain before it's real.

Source of truth for the design: Claude Design project `82f73dac`, files
`Ehon Maker.dc.html` / `EhonApp.dc.html` / `EhonTablet.dc.html` / `EhonPart.dc.html`, plus
`ehon-data.js` for the parts table. Read through the DesignSync tool (`/design-login`).

Web studio and backend (decisions 29–51): `WEB_BACKEND_PLAN.md` is the implementation plan.

---

## The product

An iOS-then-Android app where a child (≈3–7) makes a picture book: start from a
template, stick illustrated parts onto pages, draw on them with a finger, add text with
furigana, read it back with page turns and read-aloud, then export it as a printable
book.

## Architecture in one line

A shared Kotlin core emits a **pure-data scene graph**; each platform has one thin
painter that walks it. Screen, share-image and 300dpi PDF are the same tree at
different scales, so what a child sees is structurally what prints.

```
shared/            Kotlin, no UI, no platform types
  geom/            Size, Point, Rect, fitAspect
  design/          Argb (+ OKLCH→sRGB), Organic tokens, 9 part colours + 14 crayons
  model/           Book, Page, Item, Stroke, PageShape, Binding, FontFace, PageReply
  catalog/         PartDef, 10 shape primitives, 56 parts
  scene/           SceneNode, SceneBuilder, RenderTarget, TextMeasurer
  engine/          DocumentStore (undo), StrokeSimplify, HitTest
  template/        5 templates, each declaring its own page shape

iosApp/            SwiftUI + a CoreGraphics painter          ← phase 1
painter-compose/   Compose DrawScope painter, JVM-tested     ← phase 1
androidApp/        Compose screens                           ← phase 2
web/               TS/React harness + Kotlin/JS core + Canvas2D painter ← Phase 0 implemented
backend/           Firebase Functions, rules, R2 setup                  ← planned, WEB_BACKEND_PLAN.md
```

---

## Decisions

| # | Decision | Why it matters |
|---|---|---|
| 1 | **KMP core + shared scene graph**, thin native painters | The page renders in 6 places (editor, thumbnails, template previews, read mode, cover, export). Layout is written once |
| 2 | **`Book.contentLocale`**, separate from device locale | Device drives chrome; the book drives furigana, TTS voice and body font. A Japanese book stays Japanese when the phone flips to English |
| 3 | **Raster illustrations**; procedural 56 kept permanently as dev placeholder + test fixture | Engineering schedule stops waiting on the art schedule; goldens need no assets |
| 4 | **Export = 2048px share + 300dpi PDF**, on-device, no server. Print-on-demand is v2 | PDF is the same painter pointed at a PDF context |
| 5 | **Phone first, size-derived layout** — no fixed page pixels | iPad becomes a layout pass, not a rewrite |
| 6 | **Read mode = a two-page spread with a drag-driven 3D fold** about the centre spine + paper material + haptic, landscape-locked on every device | A picture book is a double-page object — picture on one leaf, words on the other. Same `rotationY` math on both platforms; no shaders. Curl was #8 of 8 on what creates book-feel |
| 7 | **Editor model 1a モードきりかえ** (はる / かく / もじ) | Tools and canvas never overlap — the safety property that matters for a 4-year-old's finger. Costs canvas size |
| 8 | **Commission ~28 parts**, one illustrator, one style bible; later waves ship as app updates | Bounds cost and schedule; no CDN, no backend for content. **Superseded for creator content by #30 and #38**: packs are downloadable assets, not app updates |
| 9 | **Group ruby**, manual entry, 0.5em centred | The prototype's `<ruby>` is group ruby, not mono ruby — so it's two text runs, not a text engine. Sidesteps CoreText-vs-Android asymmetry entirely |
| 10 | **Fonts: Zen Maru Gothic subset to shipped strings; Yomogi complete** ≈ 4.7MB | You own every glyph the UI font renders; you own none of the body font's. Identical metrics on both platforms is a *correctness* requirement for ruby |
| 11 | **Paywall deferred to v1.1.** Seam preserved: `watermark: Boolean` | v1 ships free and complete. Watermark is a scene node, never a composited bitmap. **Refined by #40**: the subscription sells AI; the watermark flag stays available, off by default |
| 12 | **One surface, gated actions.** `bigTargets` → 「ボタンを 大きく」 | No kid/parent mode split. Adult copy stays adult — a child ignores text they can't read |
| 13 | **Firebase** — Firestore + Auth | Chosen over per-platform cloud for cross-device and cross-platform. **Confirmed by #35**, with Cloudflare R2 for every blob |
| 14 | **Firestore *is* the store**, page-per-document, GitLive behind own `BookRepository` | Deletes the local DB, sync worker, retry/backoff and conflict resolution — the four hardest modules. Page-per-doc because a 20-page book approaches the 1MiB cap. **Superseded by #35/#36**: the local file store stays, sync is a layer on top, official SDKs replace GitLive |
| 15 | **Anonymous auth on launch; link prompt at できあがり** + `.ehon` archive | No sign-in wall in front of a child. Anonymous-only would die with the device, so the prompt lands where a parent actually cares. **Refined by #36**: nothing anonymous is written to Firestore except the usage counters |
| 16 | **All three page shapes**, fixed at creation | Percent-coordinates mean re-shaping distorts a composition |
| 17 | **Templates declare their own shape**; blank template offers the picker | Seed positions are hand-tuned per template, so authoring once at the template's own shape costs nothing. Three shapes for free |
| 18 | **ja + en**; en is the fallback for all non-JA devices | Yomogi has Latin but no Hangul, so Korean/zh-Hant would need new body fonts. わかちがき needs a children's-copy pass, not a translator |
| 19 | **Three-tier render testing**: ~40 scene goldens, 6 pixel goldens, human cross-check per release | Tier 1 is nearly free because layout is pure data. That's decision #1's dividend |
| 20 | **Name: onomatopoeia direction.** ぺたぺた, ぺたぐる as backup | A three-year-old can say it and ask for it by name. Names the primary verb (はる). ASO bought back in the subtitle |
| 21 | **iOS complete → App Store → then Android**, with the Compose painter built and JVM-tested in phase 1 | Real feedback months earlier, without letting the shared core quietly become iOS-shaped |
| 22 | **First-party usage counters to Firestore**, one write per session | Decision #8 stakes a ¥150k wave-2 commission on knowing which parts get used. No third-party analytics SDK |
| 23 | **Model 2a is the production editor**: 1a plus こども / おとな | Not a kid/parent mode split (#12) — one surface, and おとな reveals furigana, z-order and send settings. こども implies big targets |
| 24 | **Two palettes, not one.** Parts keep the frozen 9-colour ramp; drawing gets 14 (7 原色 + 7 パステル) | They were one list until the design split them. Merging them again would recolour all 56 parts and every saved book. `BookCodec` v2 remaps v1 strokes |
| 25 | **Six body faces, one bundled.** てがき ships; the other five download on first use, loaded via `CGFont` | A face a child types into must ship complete (#10); five complete Japanese fonts would triple the download. `CGFont` sidesteps the PostScript-name clash with the bundled ZMG subset |
| 26 | **Family voice is document data**: `Page.reply` holds who/how long/a file ref, never audio | Keeps a book inside Firestore's 1MiB (#14) and lets the transport change without touching the model |
| 27 | **iPad: たて＝つくる・よこ＝よむ.** Same `EditorModel`, two layouts; reading is the spread in either orientation; landscape つくる shows a rotate card. The **phone** locks よむ to landscape; the iPad cannot — iPadOS 26 answers an orientation the device is not in by windowing the app | The layout was already size-derived (#5), so the tablet is genuinely a pass, not a rewrite |
| 28 | **Device builds link Kotlin/Native in Release; part tiles rasterise once; page thumbnails are `Equatable`** | An iPhone 13 stalled 1–2s on every mode switch with the Debug framework: each revision rebuilt every visible tile's scene and repainted every page through the interop boundary. Debug K/N runs several times slower than Release, and a phone build is for feel, not for stepping through Kotlin (`EHON_KN_DEBUG=1` when it is) |
| 29 | **Web app = studio + composer + reader for grown-ups and creators (A + B)**, not a port of the phone UI | A finger on glass is the phone's weakness; a desk, a pen tablet and paper are the answer. The phone stays the child's device |
| 30 | **A web illustration is a raster part**: editable source kept web-side, flattened 2048px master with alpha, referenced via `PartItem.partId` | One asset type serves hand-drawn art, AI output and creator packs; the painters do not change; the procedural 56 stay as fixture. Creator content must reach the phone without an app update, which overturns #8's "no CDN" |
| 31 | **Parts stop being square; codec v3** adds `PartItem.heightPct` and `Page.id` | Full-page scenes and non-square characters; stable page keys for page-per-document sync |
| 32 | **Raster layers plus PNG upload; Klecks (MIT) embedded** | "Smooth and lifelike" is painterly, creators upload from Procreate anyway, and an OSS engine turns a brush engine into a week of integration. Vector ink later |
| 33 | **Canvas UX only — no multiplayer.** Soft lease per book, page-level last-write-wins, realtime listener | Collaboration here is asynchronous by nature; CRDTs and op-streamed raster are a project each. The listener still makes a web save appear on the phone in seconds |
| 34 | **AI scope: generate, edit, compose-by-intents, story/furigana/translate, paper-sketch-to-illustration. No whole-book generation** | Co-pilot, not generator: おやこで つくる, and group B are human illustrators. Intents reuse `EditorController`, so an AI edit is one undo step |
| 35 | **Firebase Auth + Firestore + Functions (Tokyo) + Cloudflare R2**; official SDKs per platform; the Kotlin core stays pure; pages stored as codec JSON | Offline queueing and listeners are bought, not built; R2's zero egress matters for fonts and packs; native SDKs retire the GitLive risk |
| 36 | **Personal ownership**: `ownerId` + one `isOwner()` rule helper; books sync only after a real sign-in | Simplest rules; a family space slots in later by changing what the id points at |
| 37 | **Apple + Google sign-in only** | Every provider is a support surface; LINE via OIDC when testers ask |
| 38 | **Free creator packs, manual approval, fixed licence, hand-drawn / AI-assisted label**; `price: 0` and an empty entitlements collection as the paid seam | Manual approval is the cheapest moderation and the quality bar for a children's catalog |
| 39 | **Blobs content-addressed; derivatives public by hash, sources and voice signed; server-side finalize; fonts on R2** | Fast cacheable render path; signing only where content is personal or valuable; one validator for everything the phone renders. Closes risk 7 |
| 40 | **AI is the subscription; drawing, composing, reading, sync and sharing are free.** Stripe on the web; the phone reads entitlements and never sells | Per-image cost needs a payer; Apple-safe, and buying screens stay away from children |
| 41 | **Guest links are read-only, one revocable token per recipient, no expiry, no login.** Voice stays recorded in person on the child's device, backed up to R2 | Closes risk 6 with a web page and one function; no transcoding pipeline in v1 |
| 42 | **Kotlin/JS core with the Canvas2D painter inside; TypeScript/React shell** | Layout written once, three painters, forty goldens prove the JS build. Wasm loses on interop, bundle size and its iOS 18.2 floor; a TS rewrite is a second schema |
| 43 | **Superseded by #52.** The original composition-only web editor exposed no drawing tool | The owner corrected the direction: the web app must focus on illustrating directly on a page |
| 44 | **AI reachable in こども and おとな; the quota belongs to the paying account.** Raw photos never stored; prompts and jobs kept 30 days; paid API tiers only; children's-book system prompt + provider filter + a naughty-prompt test set | The owner's call: whoever pays, uses. A child can author prompts, so the filters are a tested component, not a nicety |
| 45 | **Non-functional rules: bounded bitmaps, one listener per book, serialized writer with a revision guard, idempotent jobs, flat performance-first web UI** | Leaks and races are review criteria, not intentions. `WEB_BACKEND_PLAN.md` §11 |
| 46 | **The browser's local store is IndexedDB rows carrying the phone's journal shape** (owner, baseline, revision, deletion flags); Firestore runs with a memory cache on the web | Rows are the durable copy on both platforms, so offline edits are re-derived from the journal after a reload instead of replayed by the SDK; one sync contract, two structural twins (`SyncEngine.swift`, `syncEngine.ts`) |
| 47 | **Guest books come from one unauthenticated function (`guestBook`)** that returns metadata, pages in manifest order and the owner's `lib:` parts; the reader page ships without the Firebase SDK; responses are `no-store` | The token is the whole capability, revocation must be immediate, and a grandparent's first load should be a 200KB page, not a Firebase client |
| 48 | **The Functions emulator gets a `LocalBlobStore` stand-in for R2** (`functions/.blobs`, served by the `localBlob` function); never deployed | The presign → PUT → finalize → render path is tested end to end offline, in both native and browser suites, before any bucket exists |
| 49 | **Web fonts are unicode-range woff2 slices served with the site** (`web/tools/slice-fonts.mjs`: kana/ASCII slice per face loaded eagerly, kanji in 128-codepoint blocks, everything else in one; `/fonts/*` immutable, `VITE_FONTS_URL` can move them to the assets domain) | A guest's first page must not cost a 4 MB TTF, and the body faces must still cover every kanji a child types (#10). Slicing keeps both: ~60 KB up front, ~20 KB per kanji block on demand, no third-party font host in a children's app |
| 50 | **Superseded by #52 for page presentation.** The original composer was a frames desk: pages as frames on one CSS-transformed surface, canvases re-rasterised on settle, pointer machinery outside React, tap-to-place and drag-to-drop from the library, `lib:` illustrations parked on the desk in `workspaces/{bookId}` (localStorage authoritative, Firestore mirror, last writer wins) | The Figma-like workflow from decision 43 without a scene-graph rewrite: the Kotlin controller still owns one current page; the desk only decides which frame a pointer means. Scratch is a parking area, so a merge would buy nothing |
| 51 | **Byte budgets are Lighthouse CI assertions on a gzip-served production build**, run by GitHub Actions with the shared, web and backend suites; no scores asserted, no third-party request allowed | `vite preview` sends uncompressed bytes and a CI runner's timings are noise, so the plan's gz budgets are checked where they are meaningful (§11); the third-party count of zero is the privacy rule made mechanical |

| 52 | **Web opens ready to draw, on one page at a time.** A blank sheet is the primary starting point; a persistent labelled toolbar exposes brush, eraser, selection, text, materials and hand. Page thumbnails switch the active sheet; no all-pages canvas. Controls use system sans-serif; book lettering keeps its selected face | Owner correction, 2026-09-11: drawing must be discoverable and central. Existing shared strokes give web drawings persistence and one-step undo; the browser isolates erasing to ink. Layered raster painting remains a separate future extension, never a prerequisite to drawing |
| 53 | **Home navigation stays visible at every width.** Both the logo and a labelled ホーム link return to the shelf | The previous responsive layout hid the shelf link on small screens, leaving no obvious way out of a book |
| 54 | **Superseded by #55 for authoring; the layering stands.** Illustrated templates are layered: one full-bleed backdrop plate (scene, no characters), square-box sprite cut-outs with alpha seeded as ordinary parts, and the caption as a text item** (`web/src/illustrations.ts`, `web/artwork/`) | A whole-page painting is a poster: the child can only move or delete the entire picture. Sprites reuse the raster-part path (#3, #30) and the seed model of the procedural templates (#17), so every character moves, resizes, layers and deletes like any part and is also a drawer part on every page. Generation gets cheaper too: one backdrop per page plus a few reusable cut-outs per story instead of a consistent full composition per page. The backdrop is a plain 100% part for now; a locked/backdrop flag in the core is needed before these templates reach the phone's こども mode, where a tap on empty paper would select it. The raster stories and their prompt pipeline were retired the same day: every story on the shelf is now a document (#55), with its sources in `shared/templates/<story>/` |
| 55 | **A book is one document a model can write: codec v4 embeds vector art as SVG (`Book.art`, `art:<key>` parts), the shared core parses an SVG subset into path nodes and all three painters draw them; hex colours and font ids are accepted on decode; `docs/EHON_FORMAT.md` is the contract, `pnpm ehon-check` the loop** | Every language model writes SVG and JSON natively and none of them paints pixels, so a text document is the only art format an AI can author *and* revise. Art inside the document keeps a `.ehon` file self-contained across web, phone, sync and print, and every piece stays a part the child moves. Art is `Argb`, not crayon indices (#3): it is illustration, recoloured by editing its SVG. Gradients flatten to their average stop and text, images, filters and patterns are skipped and reported, so a document never half-renders: malformed SVG refuses to open. Total SVG is capped at 64 KB because metadata syncs as one Firestore document under a 100 KB rule |
| 56 | **A story template is bound like a Japanese picture book: 表紙, 扉, spreads with the picture on the left page and the words on the right, 裏表紙 with the colophon (発行 / さく / え). The owner's hand-drawn storyboard is the reference, and `shared/templates/love-letter/` the worked example** | The love-letter storyboard (2026-09-13) shows how the books are actually made: a 24-side booklet where the cover stands alone, pages 1–2, 3–4 … face each other picture-left words-right, and the back cover carries the colophon. The app pairs pages strictly by index, so a 扉 (title page) after the cover keeps every storyboard spread paired in 見開き view and gives the shelf a real cover thumbnail; a first-class cover that stands alone would remove that extra page and is the next step if templates multiply. A storyboard's own rules (固定 spreads, the last page in the author's own words, the cover picture taken from the favourite page) are documented in the template README, not enforced. Words on a page are only what the storyboard draws inside the frame; narration written in its margin is the reader's script and stays off the page, kept in the README. An encounter that the storyboard draws on two facing frames is a two-page picture, never a picture with a text page The generator also drops each piece's `<title>` at assembly so the sources stay named while the embedded art stays under the 64 KB cap |
| 57 | **The web desk is canvas-first: the view bar and hint float over the paper, the tool panel and page strip are toggles remembered per browser, and a fitted spread uses 96% of the remaining height. The reader is one click from the studio (よむ / 続きを描く), goes full screen, and prints every spread on its own landscape sheet** | Owner correction, 2026-09-13: with a header, a toolbar, a view bar, a hint line and a 113 px strip, a laptop showed each page of a spread at about 370 × 490 px and editing meant constant zooming; the same 1440 × 900 screen now shows 460 × 613 px with everything on, more with the panel or strip folded. A made book had no reading experience on the web unless one went back to the shelf, and printing produced a dark screen; a print stylesheet plus rendering every page while printing turns the browser's print dialog into the book on paper or as a PDF. Still open: a cover that stands alone in the reader (#56), and saddle-stitch imposition for folding a printed booklet |

## Deliberately not in v1

- ~~Paywall / IAP (#11) — seam is in place~~ — became the AI subscription (#40); drawing stays free
- Print-on-demand ordering (#4) — reuses the same PDF renderer
- ~~iPad / tablet layout (#5)~~ — landed with 2a as decision #27; the size-derived layout made it a pass
- Landscape-authored templates beyond t2 (#17)
- Korean, zh-Hant (#18) — blocked on body-font licensing, not translation
- Part recolouring — permanently unavailable once art is raster (#3)
- Live multiplayer on the web canvas (#33)
- Advanced vector illustration tools in the studio (#32); existing page strokes are available on the web (#52)
- Paid creator packs (#38) — the `price` field and the entitlements seam exist
- LINE login (#37)
- Whole-book generation from one prompt (#34)
- Family spaces (#36) — `ownerId` is the seam

## Known residual risks

1. **Unlinked anonymous accounts are as exposed as local-only storage.** Mitigated by the
   `.ehon` archive and the prompt's timing, not solved. (#15) Since #36 an anonymous account never
   holds cloud data either, so the exposure is exactly the device's.
2. ~~**GitLive's Firebase wrapper is community-maintained.** `BookRepository` is the hedge; swapping to hand-rolled `expect`/`actual` should be contained to one file. (#14)~~ Retired by #35: official Firebase SDKs per platform; the Kotlin core never touches the network.
3. **Style drift between art waves** is the specific failure mode of #8. The written style
   bible is the only defence, and wave 2 is months after wave 1.
4. **The font subset build step can ship tofu silently.** A CI test asserting every
   shipped string's glyphs exist in the subset is not optional. (#10)
5. **Cross-platform painter drift** is only caught automatically within a platform. Tier 3
   is a human looking at two screenshots. (#19)
6. ~~**3b's guest link is not buildable here.** 「リンクを あけると よむ がめん・アプリ 不要」 is a web page plus a backend. The app ships the *child side* (playback after よみあげ, the chip) and an on-device recorder behind the same `PageReply`; the no-app link waits on #13/#14.~~ Planned as the read-only guest link, `WEB_BACKEND_PLAN.md` Phase 2 (#41).
7. ~~**Font downloads come from GitHub raw.** Fine for testing, not for launch — move the five faces to On-Demand Resources or a CDN you control before the store build. (#25)~~ Planned: served from R2 behind `assets.<domain>`, `WEB_BACKEND_PLAN.md` Phase 1 (#39).
8. **Klecks fit is assumed from its README** (MIT, embed mode, layers, pressure, brushes, filters).
   Undo memory and layer export are unconfirmed; the Phase 3 spike decides go/no-go. (#32)
9. **Codec v3 refuses older builds.** Closed testers must update before web-made books open on
   the phone. (#31)
10. **Three painters, one human check.** Tier 3 grows a web column; six Playwright goldens cover
    the rest. (#42)
11. **Image provider unchosen.** Quality on paper sketches decides the provider, and the
    provider's terms decide retention. (#34, #44)

## Corrections made to the prototype

Bugs and gaps found while porting, all fixed in the core rather than carried over:

- **Undo covered only strokes.** Placing, moving, resizing, deleting a part, wiping all
  strokes, changing the background and editing text were all unrecoverable. Now uniform
  via `DocumentStore` snapshots.
- **Stroke width was a fixed pixel count** (`brush * 3.2` against a 322px page). At 300dpi
  that prints a hairline where the child drew a crayon line. Now a fraction of page width.
- **Every `pointermove` sample was retained.** RDP simplification at stroke commit; matters
  doubly against Firestore's 1MiB document ceiling.
- **Text hit-testing estimated width as `length × size`,** which is badly wrong for mixed
  kana and Latin. Now measured.
- **Portrait pages (258×338) overflowed** the available 332px. Size-derived layout fixes it.
- **`ぜんぶ けす` had no confirmation and no undo.** Undo now covers it; hold-to-confirm still
  to add in the UI.
- Three CSS `radial-gradient` masks (ring, crescent, arc) have no CoreGraphics or Skia
  equivalent. Converted to even-odd fills, with the ratios derived from the gradient's
  `farthest-corner` default rather than eyeballed.

## Kotlin/Native → Swift interop, learned the hard way

Building the iOS side surfaced four things that would have quietly rotted had Android come
first. All four are fixed in the core rather than worked around in Swift.

**Inline value classes erase inconsistently.** `Argb` is `value class Argb(Int)`, and that
is *good* — it crosses as `int32_t`, so a colour costs no allocation. But:

| Kotlin | Obj-C header | Swift sees |
|---|---|---|
| `Argb` | `int32_t` | `Int32` ✅ |
| `Argb?` | `id _Nullable` | `Any?` ✗ |
| `List<Argb>` | `NSArray<id>` | `[Any]` ✗ |
| `value class BookId(String)` | `id` | `Any` ✗ |

So: ID types became **data classes**; nullable colours became **flags** (`hasHairline`,
`erase` — which say what is meant anyway); and `Organic` gained indexed accessor
*functions* (`crayon(index:)`) because a function's return type erases correctly where a
generic's element type does not.

**`PersistentList` is a runtime trap.** The header declares it as `NSArray` (that is how
Kotlin `List` bridges), but an `NSArray` converts to a plain `List`, not a `PersistentList`
— so calling the primary constructor from Swift throws a cast exception at *runtime*, with
a header that compiled fine. `Book.of(...)` and `Page.of(...)` exist solely to convert
explicitly. The deeper conclusion is below.

**Third-party types leak into the public API.** `Instant` from kotlinx-datetime appeared in
every `Book` call site even as an `implementation` dependency. Replaced with epoch
milliseconds, which Firestore wants anyway; kotlinx-datetime is now gone entirely.

**PDF pages are measured in points, not dots.** Building an export scene at 300dpi and
writing it into a PDF would produce a 21-inch page. PDF is a vector format, so the scene is
built at **72dpi** — the page is then its true physical size, and vector shapes, crayon
strokes and text are resolution-independent in the output. Only raster parts have a fixed
resolution, and a 1024px master inside a ~370pt box is ≈700dpi. Rasterising at 300dpi
instead would make the *strokes* worse, not better.

### Consequent design conclusion: mutation stays in Kotlin

Because Swift cannot safely construct `Page`/`Book` values, the editor must not mutate the
document from Swift at all. The next piece of the core is an intent-level controller:

```kotlin
class EditorController(store: DocumentStore) {
    fun addPart(partId: PartId); fun moveSelected(xPct: Float, yPct: Float)
    fun resizeSelected(up: Boolean); fun rotateSelected(); fun deleteSelected()
    fun beginStroke(...); fun appendStroke(...); fun endStroke()
    fun undo(); fun redo()
}
```

This was going to be optional. It is now structural — and it is better, because editor
*semantics* get written and tested once instead of twice.

## Rendering, learned the hard way

**`NSString.draw` paints into UIKit's *current* context, not the one you hold.** SwiftUI's
`Canvas.withCGContext` hands the painter a context without making it current, so on screen
every glyph went nowhere — while the painter tests stayed green, because
`UIGraphicsImageRenderer` *does* make its context current. The painter now pushes the context
it is given around the call, and `testTextDrawsIntoAContextUIKitDidNotMakeCurrent` paints into
a bare bitmap context so the two paths cannot diverge again. Corollary: a green render test
proves the export path, not the screen — look at the simulator.

**A CGFont-loaded face wins over a registered subset of the same name.** The complete Zen Maru
Gothic downloaded as まるまる renders kanji the bundled UI subset does not carry, because
`CTFontCreateWithGraphicsFont` bypasses the name registry. Verified on the simulator with 森 in
a `ROUNDED` text item.

## Built, and verified running

| Area | State |
|---|---|
| Shared core | model, catalog, scene graph, `EditorController`, codec (v2), i18n — **105 tests** |
| iOS painter | CoreGraphics, structural twin of the Compose one — **9 tests** |
| Compose painter | compiles + renders on JVM, so the core has two consumers already |
| Screens | shelf, templates, 2a editor (はる/かく/もじ + こども/おとな, 14 crayons, 6 faces, z-order, long-press page reorder), two-page read with 3D fold + おやすみ + family voice, done, かぞくに おくる, guest |
| iPad | portrait make with the bottom rail and floating text card; landscape two-page spread; rotate card |
| Fonts | ZMG subset 14.4MB → **176KB**; Yomogi complete 3.9MB; total **4.1MB** |
| Export | 2048px PNG + 300dpi PDF via the share sheet |
| Persistence | JSON per book in `Documents` (iOS device backup covers it) |
| Read-aloud | AVSpeechSynthesizer, voice from the book's `contentLocale` |
| i18n | ja + en, ~330 shipped strings, English fallback for all other devices |
| Web | shelf, composer (`/app/:id`: frames desk with pan/zoom and scratch items, autosave, lease, remote replacement, illustration library, PNG upload, face picker) and reader (`/read/:id`, `/g/:token`) over the Kotlin/JS core; sliced woff2 fonts — 15 harness/desk/painter tests, 5 emulator scenarios (`make web-sync-test`), Lighthouse byte budgets (`make web-budget`), GitHub Actions workflow |
| Backend | Firestore rules (incl. `workspaces`), asset presign/finalize/signed read, guest links, cleanup, budget guard, `localBlob` — 19 emulator tests (`make rules-test`); nothing provisioned or deployed |
| Sync | `BookRepository` + `SyncEngine` on iOS and web: local rows authoritative, revision guard, page-level merge in Kotlin, soft lease; two native clients (`make sync-test`) and two browsers converge |

Screens are reachable for screenshots via launch args: `make shots`, or
`-startScreen editor -mode draw`.

## Open

- **Watermark copy** 「ぺたぺた で つくったよ」is a placeholder pending the final name.
- **Page-turn sound assets** (2–3 randomised variants) not yet sourced.
- **Illustrator not yet briefed.** Critical path for launch and for store screenshots.
- **Harvesting testers' books as launch templates.** Today a `Template` is seeds only (part, x, y,
  size, prompt) — it cannot carry strokes or text. Decide seeds-only distiller vs. full-page
  templates before closed testing; either way strip `PageReply` and review every `TextItem`,
  and keep every `BookCodec` version decodable.
- **おやすみ interval** is 7s on the phone spec and 9s on the tablet spec; the app uses 7s on both.
- **Confirm the iPhone 13 stalls are gone** with the Release framework and the tile/thumbnail
  caching (#28). If not, the next suspect is `Canvas.withCGContext` per stroke point — profile
  before touching the painter.
- **Web studio and backend**: Phases 0–2 of `WEB_BACKEND_PLAN.md` are implemented locally and
  tested against the emulators, including the frames desk, the scratch document, sliced fonts and
  Lighthouse budgets in CI; provisioning (Firebase projects, providers, App Check, R2, the assets
  domain, budget alerts, Pages) is the owner's next step, then Phase 3 (Klecks spike, AI, Stripe).
  Desk niceties still open: marquee/multi-select, dragging a placed part back onto the desk, a
  remembered view per book. Template harvesting above can now become a web feature (Phase 5).
