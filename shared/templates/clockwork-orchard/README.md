# きのうを直す 時計店 / The Clockmaker’s Unfinished Hour

Ena, an elderly clockmaker, stops the town after the death of her partner Ren.
Preserving the last afternoon also suspends a swallow, a seed and a loaf of bread.
The mechanical orchard makes this stillness visible. Ena winds the town forward
while choosing to keep Ren’s pocket watch at its last meaningful hour.

An original Japanese picture book for older readers as well as families. Bound to the
Love Letter reference: **25 portrait pages**, a cover and title page, eleven spreads, and
a back cover. Horizontal Japanese reads left to right. Ordinary spreads put the picture
on the left and editable Yomogi words on the right; two uninterrupted illustration
spreads give the story room to breathe. Every character and prop is a separate SVG part.

| Draft pages | Composition |
| --- | --- |
| 表紙 | Title above a scene taken from the book; the picture and each title line remain editable. |
| 扉 | Quiet title page with the book's emblem; preserves the picture-left, words-right pairing. |
| 1–2 | Ena holds Ren’s pocket watch beneath two stopped clocks in her carefully furnished workshop. |
| 3–4 | The empty chair and last teacup receive the afternoon light; Ena stays at the edge of the room. |
| 5–6 | A swallow is suspended outside the arched window, above the bird-shaped clock on the sill. |
| 7–8 | A still life of a seed pot, unrisen dough and tea makes the stopped hour tangible. |
| 9–10 | A suspended orchard whose brass leaves and clock fruits share one horizon across the gutter. |
| 11–12 | Ena lifts a winding key from the orchard; a loose gear and brass leaves frame the gesture. |
| 13–14 | The same chair and cup return; this time the remembered voice belongs to an ordinary shared morning. |
| 15–16 | Ena winds the wall clock with a tear still visible; Ren’s watch remains on the workbench. |
| 17–18 | The orchard stirs: different clock hands, rising swallows and loosened brass leaves replace the frozen arrangement. |
| 19–20 | Work resumes slowly. The swallow clock is being repaired while a new shoot appears on the windowsill. |
| 21–22 | Ena carries the stopped keepsake into a moving world; the bench, dandelion and swallow leave room for a future. |
| 裏表紙 | Emblem and editable 発行, さく, え fields for the person making this copy. |

## Narration outside the picture

These passages are the reader's script for the two full illustration spreads. They are
kept here, out of the artwork, following Love Letter's storyboard convention.

- **9–10:** 町の奥には、時計の果樹園があった。どの枝も同じ一分を抱えたまま、重く垂れていた。エナは、自分の息だけが先へ進もうとするのを聞いた。
- **17–18:** 風が、枝を通りぬけた。時計は少しずつ違う音で鳴りだした。つばめの影が地面を渡り、エナの袖も、ようやく揺れた。

## Illustration and editing notes

Patinated green, tarnished brass, honey-colored wood and silver hair make a tactile, autumnal world. Flat colour, fine rounded ink contours, expressive poses, and deliberate paper
space keep the illustrations readable from shelf thumbnail to printed spread. Backgrounds
contain architecture or landscape; people, creatures, keepsakes and foreground plants
remain independently movable. Paired panoramic backgrounds share one 1200 × 800 scene,
split at the gutter into matching 600 × 800 pieces. No raster images, gradients, filters,
SVG text, external references or unsupported SVG elements are needed by either painter.

Grief does not end when the clock restarts. The keepsake remains stopped and the repair work remains slow. All story lines are complete; only the colophon intentionally contains blanks.
To rewrite the story, edit the real text items. To rearrange a scene, select its pieces or
place them again from **素材 → この えほんの え**. `story.json` and `art/*.svg` are the sources.

Build with `make web-core`, then validate with
`cd web && pnpm ehon-check ../shared/build/templates/doc-clockwork-orchard.ehon.json`.
Preview at `/app?template=doc-clockwork-orchard`. The shared catalog discovers this folder
automatically; publish the assembled documents and index with `make templates-upload`.
