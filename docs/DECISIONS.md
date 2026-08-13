# ぺたぺた — decision record

Working name **ぺたぺた** (Petapeta). Needs checking against the App Store, Play,
J-PlatPat (商標) and a domain before it's real.

Source of truth for the design: Claude Design project `82f73dac`, files
`Ehon Maker.dc.html` / `EhonApp.dc.html` / `EhonPart.dc.html`. Decoded copies live in
`.design-ref/` for reference; they are not built.

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
  design/          Argb (+ OKLCH→sRGB), Organic tokens, 9 crayons
  model/           Book, Page, Item, Stroke, PageShape, Binding
  catalog/         PartDef, 10 shape primitives, 56 parts
  scene/           SceneNode, SceneBuilder, RenderTarget, TextMeasurer
  engine/          DocumentStore (undo), StrokeSimplify, HitTest
  template/        5 templates, each declaring its own page shape

iosApp/            SwiftUI + a CoreGraphics painter          ← phase 1
painter-compose/   Compose DrawScope painter, JVM-tested     ← phase 1
androidApp/        Compose screens                           ← phase 2
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
| 6 | **Read mode = drag-driven 3D fold** + paper material + sound + haptic | Same `rotationY` math on both platforms; no shaders. Curl was #8 of 8 on what creates book-feel |
| 7 | **Editor model 1a モードきりかえ** (はる / かく / もじ) | Tools and canvas never overlap — the safety property that matters for a 4-year-old's finger. Costs canvas size |
| 8 | **Commission ~28 parts**, one illustrator, one style bible; later waves ship as app updates | Bounds cost and schedule; no CDN, no backend for content |
| 9 | **Group ruby**, manual entry, 0.5em centred | The prototype's `<ruby>` is group ruby, not mono ruby — so it's two text runs, not a text engine. Sidesteps CoreText-vs-Android asymmetry entirely |
| 10 | **Fonts: Zen Maru Gothic subset to shipped strings; Yomogi complete** ≈ 4.7MB | You own every glyph the UI font renders; you own none of the body font's. Identical metrics on both platforms is a *correctness* requirement for ruby |
| 11 | **Paywall deferred to v1.1.** Seam preserved: `watermark: Boolean` | v1 ships free and complete. Watermark is a scene node, never a composited bitmap |
| 12 | **One surface, gated actions.** `bigTargets` → 「ボタンを 大きく」 | No kid/parent mode split. Adult copy stays adult — a child ignores text they can't read |
| 13 | **Firebase** — Firestore + Auth | Chosen over per-platform cloud for cross-device and cross-platform |
| 14 | **Firestore *is* the store**, page-per-document, GitLive behind own `BookRepository` | Deletes the local DB, sync worker, retry/backoff and conflict resolution — the four hardest modules. Page-per-doc because a 20-page book approaches the 1MiB cap |
| 15 | **Anonymous auth on launch; link prompt at できあがり** + `.ehon` archive | No sign-in wall in front of a child. Anonymous-only would die with the device, so the prompt lands where a parent actually cares |
| 16 | **All three page shapes**, fixed at creation | Percent-coordinates mean re-shaping distorts a composition |
| 17 | **Templates declare their own shape**; blank template offers the picker | Seed positions are hand-tuned per template, so authoring once at the template's own shape costs nothing. Three shapes for free |
| 18 | **ja + en**; en is the fallback for all non-JA devices | Yomogi has Latin but no Hangul, so Korean/zh-Hant would need new body fonts. わかちがき needs a children's-copy pass, not a translator |
| 19 | **Three-tier render testing**: ~40 scene goldens, 6 pixel goldens, human cross-check per release | Tier 1 is nearly free because layout is pure data. That's decision #1's dividend |
| 20 | **Name: onomatopoeia direction.** ぺたぺた, ぺたぐる as backup | A three-year-old can say it and ask for it by name. Names the primary verb (はる). ASO bought back in the subtitle |
| 21 | **iOS complete → App Store → then Android**, with the Compose painter built and JVM-tested in phase 1 | Real feedback months earlier, without letting the shared core quietly become iOS-shaped |
| 22 | **First-party usage counters to Firestore**, one write per session | Decision #8 stakes a ¥150k wave-2 commission on knowing which parts get used. No third-party analytics SDK |

## Deliberately not in v1

- Paywall / IAP (#11) — seam is in place
- Print-on-demand ordering (#4) — reuses the same PDF renderer
- iPad / tablet layout (#5) — the layout is already size-derived
- Landscape-authored templates beyond t2 (#17)
- Korean, zh-Hant (#18) — blocked on body-font licensing, not translation
- Part recolouring — permanently unavailable once art is raster (#3)

## Known residual risks

1. **Unlinked anonymous accounts are as exposed as local-only storage.** Mitigated by the
   `.ehon` archive and the prompt's timing, not solved. (#15)
2. **GitLive's Firebase wrapper is community-maintained.** `BookRepository` is the hedge;
   swapping to hand-rolled `expect`/`actual` should be contained to one file. (#14)
3. **Style drift between art waves** is the specific failure mode of #8. The written style
   bible is the only defence, and wave 2 is months after wave 1.
4. **The font subset build step can ship tofu silently.** A CI test asserting every
   shipped string's glyphs exist in the subset is not optional. (#10)
5. **Cross-platform painter drift** is only caught automatically within a platform. Tier 3
   is a human looking at two screenshots. (#19)

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

## Built, and verified running

| Area | State |
|---|---|
| Shared core | model, catalog, scene graph, `EditorController`, codec, i18n — **80 tests** |
| iOS painter | CoreGraphics, structural twin of the Compose one — **8 tests** |
| Compose painter | compiles + renders on JVM, so the core has two consumers already |
| Screens | shelf, templates, 1a editor (はる/かく/もじ), read with 3D fold, done |
| Fonts | ZMG subset 14.4MB → **176KB**; Yomogi complete 3.9MB; total **4.1MB** |
| Export | 2048px PNG + 300dpi PDF via the share sheet |
| Persistence | JSON per book in `Documents` (iOS device backup covers it) |
| Read-aloud | AVSpeechSynthesizer, voice from the book's `contentLocale` |
| i18n | ja + en, ~330 shipped strings, English fallback for all other devices |

Screens are reachable for screenshots via launch args: `make shots`, or
`-startScreen editor -mode draw`.

## Open

- **Watermark copy** 「ぺたぺた で つくったよ」is a placeholder pending the final name.
- **Page-turn sound assets** (2–3 randomised variants) not yet sourced.
- **Illustrator not yet briefed.** Critical path for launch and for store screenshots.
