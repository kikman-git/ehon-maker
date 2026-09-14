# The `.ehon` document, written by hand or by a model

A book is one JSON document. It carries its pages, its words and, since format 4, its own
pictures as SVG. Nothing outside the file is needed to open it, and everything in it stays
editable in the app: a picture is a part the child moves, a caption is a text item the parent
retypes. This is the contract a language model follows when asked to write or change a book
(decision #55 in `DECISIONS.md`).

Validate with `cd web && pnpm ehon-check path/to/book.ehon.json` (after `make web-core`). It
prints errors that stop the book opening and warnings about things that will look wrong.

## Envelope

```json
{ "version": 4, "book": { … } }
```

The app refuses a higher version and reads 1 to 4. Always write 4.

## Book

| Field | Value |
|---|---|
| `id` | `{ "value": "any-string" }`. The shelf assigns its own when it copies a template, so any stable string is fine |
| `title` | Display title |
| `shape` | `"SQUARE"`, `"LANDSCAPE"` (3:2) or `"PORTRAIT"` (3:4). Fixed for the life of the book |
| `contentLocale` | `"ja-JP"` gives a furigana field and Japanese read-aloud; `"en"` otherwise |
| `updatedAtEpochMs` | Milliseconds; `0` is fine for a template |
| `art` | Object of pictures keyed by name: `{ "bear": { "svg": "<svg …>", "name": "こぐま" } }` |
| `pages` | Array, at least one |

Omit `binding`; `LEFT` is the default and right for horizontal Japanese.

## Page

```json
{ "id": "p1", "background": "#f9f4ed", "items": [ … ] }
```

`id` must be unique inside the book and contain no `/`. `background` is a hex string (the app also
accepts its own packed integer). Omit `strokes`, `promptKey` and `reply`; they are the child's.

## Items

Items paint in array order: put the backdrop first, then the pieces, then the words.
Positions are percent of the page and name the item's **centre**.

**A picture** (`type: "part"`):

```json
{ "type": "part", "id": { "value": "p1-bear" }, "x": 31, "y": 62,
  "partId": { "value": "art:bear" }, "sizePct": 22 }
```

- `partId` is `art:<key>` for a picture in this book's `art`, or one of the 56 built-in shapes such
  as `いきもの:ねこ` or `しぜん:き` (the categories are かたち, いきもの, うみと そら, しぜん, まほう).
- `sizePct` is the width as percent of the page width. Omit `heightPct` for a square box; give it
  as percent of the page **height** when the picture's viewBox is not square. A full-bleed
  backdrop is `x: 50, y: 50, sizePct: 100, heightPct: 100`.
- `rotationDeg` is optional.

**Words** (`type: "text"`):

```json
{ "type": "text", "id": { "value": "p1-t1" }, "x": 50, "y": 84.5,
  "text": "しんしん、ゆきが ふる。", "font": "maru", "sizePct": 5 }
```

- One text item is **one line**; a line break renders as a space. Stack two items at
  `y: 84.5` and `y: 91.5` for a two-line caption in the paper band.
- `sizePct` is one of `5`, `6.5`, `8.5`. At `5`, about sixteen full-width characters fit across the
  page; the checker warns when a line is wider than the page.
- `font` is `yomogi` (handwriting), `maru` (rounded), `kiwi`, `pop`, `marker` or `futo`.
- `colorIndex` 0 to 4 picks ink, terracotta, sage, red or violet. `ruby` is the optional furigana
  for the whole string.

Item ids must be unique across the book. The app never reuses one it has seen.

## Art

Each `art` value is a small SVG document. Draw in a `viewBox` of your choosing; the app maps the
viewBox onto the part's box, so a sprite drawn in `0 0 100 100` and placed with `sizePct: 20`
is a fifth of the page wide. Leave a margin inside the viewBox so a rotated piece is not clipped.

Supported:

- `svg`, `g`, `defs`, `style`; `path`, `rect` (with `rx`/`ry`), `circle`, `ellipse`, `line`,
  `polyline`, `polygon`
- `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `fill-rule`, `opacity`,
  `fill-opacity`, `stroke-opacity`, `transform` (`translate`, `scale`, `rotate`, `skewX`,
  `skewY`, `matrix`), `class`, `style="…"` and `<style>.name{…}</style>` rules
- colours as `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`, `rgba()`, `hsl()`, CSS names, `none`,
  `currentColor`
- every path command, including arcs, absolute and relative

Skipped, and named in a checker warning: `text`, `image`, `use`, `clipPath`, `mask`, `filter`,
`pattern`, `symbol`. A `linearGradient` or `radialGradient` paints as the flat average of its
stops; write flat colours to control the result. Malformed markup makes the whole book refuse to
open, which the checker reports with the reason.

Keep the total of all `svg` strings under 64,000 characters; the book's metadata syncs as one
100 KB document. Collapse whitespace and drop editor metadata.

Two kinds of piece make an editable page:

- **Backdrop**: the scene with no characters, filling the viewBox, the lower fifth fading to
  the paper colour `#f9f4ed` so captions sit on paper. Placed first at 100 percent.
- **Sprite**: one character or prop, empty background, centred with margin in a square viewBox.
  Each is placed as its own part so it can be moved, resized, rotated, layered or deleted, and
  it appears in the studio's material list as「この えほんの え」for any page.

The house palette (Organic): paper `#f9f4ed`, ivory `#f5ead8`, sage `#7a8a5e`, terracotta
`#c67139`, brown `#8c491a`, ink `#2e2b25`, one bright red `#c8553d`. Flat shapes, rounded forms,
dot eyes read well at thumbnail size and at 300 dpi alike.

## A complete small book

```json
{
  "version": 4,
  "book": {
    "id": { "value": "example" },
    "title": "あかい まる",
    "shape": "SQUARE",
    "contentLocale": "ja-JP",
    "updatedAtEpochMs": 0,
    "art": {
      "sun": { "name": "たいよう",
               "svg": "<svg viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"36\" fill=\"#e8b04b\"/><g stroke=\"#e8b04b\" stroke-width=\"6\" stroke-linecap=\"round\"><path d=\"M50 4v12M50 84v12M4 50h12M84 50h12\"/></g></svg>" }
    },
    "pages": [
      { "id": "p1", "background": "#f0fae1", "items": [
        { "type": "part", "id": { "value": "p1-sun" }, "x": 72, "y": 24, "partId": { "value": "art:sun" }, "sizePct": 26 },
        { "type": "part", "id": { "value": "p1-cat" }, "x": 40, "y": 62, "partId": { "value": "いきもの:ねこ" }, "sizePct": 30 },
        { "type": "text", "id": { "value": "p1-t1" }, "x": 50, "y": 88, "text": "おはよう、ねこさん。", "font": "maru", "sizePct": 5 }
      ] }
    ]
  }
}
```

## Changing a book

To edit an existing book, read its JSON, change only what was asked, and return the whole
document at version 4 with every id kept. Retype a caption by changing `text`; move a piece by
changing `x` and `y`; recolour or redraw a picture by changing its `svg`; add a page by
appending to `pages` with a fresh `id`. Do not renumber existing ids, reorder pages unless asked,
or drop `strokes` and `reply` fields you find, which are the family's own additions.

The shared core also accepts editing **intents** for live sessions
(`shared/src/commonMain/kotlin/app/ehon/engine/EditorIntent.kt`); a document is the right form
for creating or reworking a whole book, intents for small changes to an open one.

## How a story is bound

A story template follows the way a Japanese picture book is made (decision #56, from the author's
hand-drawn storyboard). Page ids name the role:

| Page id | Role |
|---|---|
| `cover` | 表紙: the title and one picture, ideally from the favourite spread |
| `title` | 扉: the title again, small. It keeps the spreads below paired in the app's 見開き view, which pairs pages strictly by index |
| `p1`, `p2`, … | The storyboard's pages in order. Odd pages carry the picture, even pages the words, so each `p1`/`p2`, `p3`/`p4` pair is one spread. A spread that is all picture carries only the words drawn inside its frames, a label or a line of dialogue; narration written in the storyboard's margin is the reader's script and stays off the page, kept in the template's README |
| `back` | 裏表紙: the colophon as three text lines, 発行 date, さく author, え illustrator |

Words are one text item per line at `sizePct` 5, stacked 7 to 7.5 percent apart, in `yomogi`.
A two-page scene is drawn as a left and a right backdrop so the horizon continues across the
gutter. Every piece's root sets the shared ink stroke and width, so shapes name only what differs;
the generator drops each file's `<title>` and `xmlns` at assembly, so the sources stay readable
while the embedded art stays inside the budget. A character standing at the page edge is placed at `x: 0` and cropped by the page.
`shared/templates/love-letter/` is the worked example: cover, title page, eleven spreads, back cover.

## Templates published to the backend

The story templates on the shelf are documents written this way, kept as editable sources in
`shared/templates/<story>/`: a `story.json` that is the book with each `art` entry pointing at a
`file`, and the SVG pieces in `art/`. The Gradle task `assembleTemplates` writes the assembled
`.ehon.json` files and an `index.json` to `shared/build/templates/`, which `pnpm ehon-check` and the
JVM template tests read; `make templates-upload` publishes them to the assets bucket, where the
Worker serves `templates/index.json` (cached five minutes) and `templates/<id>/<sha256[0:12]>.ehon.json`
(immutable). Both clients fetch the index at runtime and keep what they fetched, so a story is
corrected or added without shipping an app (decision #60); development builds read the assembled
copy instead, served by the Vite dev server and bundled into a Debug iOS build (decision #61). The index is

```json
{ "version": 1, "templates": [ { "id": "doc-love-letter", "order": 0, "title": "きみへの ことばを さがして",
  "description": { "ja": "…", "en": "…" }, "shape": "PORTRAIT", "pageCount": 25, "format": 4,
  "bytes": 94307, "sha256": "e67a…", "url": "doc-love-letter/e67aee4b90d5.ehon.json" } ] }
```

`format` is the codec version the document is written in; a client skips entries newer than it
reads. To add a story, add a folder; to change a picture or a caption, edit the file, assemble and
upload. Ten stories are available: `love-letter/` (the author's storyboard) and four originals
bound the same way, `leaf-umbrella/`, `sunflower/`, `summer-festival/` and `snow-rabbit/`, each a
cover, a title page, eight spreads and a back cover with a README that lists the spreads and keeps
the off-page narration. Five further originals — `midnight-whale/`, `clockwork-orchard/`,
`unlived-library/`, `shadow-name/` and `star-garden/` — match Love Letter's 25 pages, with eleven
spreads including two panoramic illustrations. Their themes include estrangement, grief,
unlived possibilities, identity and legacy. `unlived-library/` is an English picture book:
its title, story, artwork names and colophon are English, and `contentLocale: "en"` selects
English read-aloud. The other nine books use Japanese. Each folder documents its compositions
and preserves its off-page narration.

A two-page picture on a dark sky writes its frame words in `colorIndex` 1;
ink on navy does not read.
