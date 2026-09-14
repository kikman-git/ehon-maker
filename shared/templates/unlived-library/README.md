# The Library of Unlived Lives / The Library of Unlived Lives

On her fortieth birthday, Mara enters a library containing the lives she did not choose.
The captain’s life has freedom and missed calls; the musician’s life still has fear.
Her own book looks plain until she notices its particular, imperfect acts of living.
She cannot exchange the past, but she can write what happens after tonight. This book
is written entirely in English, with `contentLocale: "en"` for English read-aloud.

An original English picture book for older readers as well as families. Bound to the
Love Letter reference: **25 portrait pages**, a cover and title page, eleven spreads, and
a back cover. English reads left to right. Ordinary spreads put the picture
on the left and editable Yomogi words on the right; two uninterrupted illustration
spreads give the story room to breathe. Every character and prop is a separate SVG part.

| Draft pages | Composition |
| --- | --- |
| 表紙 | Title above a scene taken from the book; the picture and each title line remain editable. |
| 扉 | Quiet title page with the book's emblem; preserves the picture-left, words-right pairing. |
| 1–2 | Mara finds a moss-green arched doorway, its shelves and stone steps inviting a closer look. |
| 3–4 | A barn owl offers an open book across a wood counter; a green lamp lights the exchange. |
| 5–6 | A cream-sailed ship rises from the book into a broad sea; freedom contains an ordinary missed call. |
| 7–8 | A violin stands in the light between wine-colored curtains; the book remains open beneath it. |
| 9–10 | A procession of doors holds a ship, a violin, a plant and an unwritten page; Mara is small among the possibilities. |
| 11–12 | Mara recognizes an unremarkable green book with a stain; the grand shelves make space around her. |
| 13–14 | Her familiar kitchen appears inside the story: chipped mug, a living basil plant, and the plain book. |
| 15–16 | At the desk again, Mara finds a pencil beside her own book; the answer offers possibility without erasing the past. |
| 17–18 | An open book becomes a path through a quiet green landscape; its middle crease continues at the page gutter. |
| 19–20 | Mara leaves carrying her book and a pencil; the door remains open behind her. |
| 21–22 | Back in the actual kitchen, the blank page and pencil join the chipped mug and basil; ordinary life continues. |
| 裏表紙 | Emblem and editable Published, Story, Art fields for the person making this copy. |

## Narration outside the picture

These passages are the reader's script for the two full illustration spreads. They are
kept here, out of the artwork, following Love Letter's storyboard convention.

- **9–10:** There were lives in unfamiliar cities, lives with children, lives alone. In every one, someone waited for something. Mara walked until she stopped trying to count the doors.
- **17–18:** The next page was not a better life waiting to be discovered. It was blank. Mara sat with that for a while. For once, the blankness did not feel like an accusation.

## Illustration and editing notes

Moss green, faded wine, parchment, tarnished gold and broad architectural arches give the library its character. Flat colour, fine rounded ink contours, expressive poses, and deliberate paper
space keep the illustrations readable from shelf thumbnail to printed spread. Backgrounds
contain architecture or landscape; people, creatures, keepsakes and foreground plants
remain independently movable. Paired panoramic backgrounds share one 1200 × 800 scene,
split at the gutter into matching 600 × 800 pieces. No raster images, gradients, filters,
SVG text, external references or unsupported SVG elements are needed by either painter.

The ending values continuity without claiming that every past choice was right or that regret disappears. All story lines are complete; only the colophon intentionally contains blanks.
To rewrite the story, edit the real text items. To rearrange a scene, select its pieces or
place them again from **素材 → この えほんの え**. `story.json` and `art/*.svg` are the sources.

Build with `make web-core`, then validate with
`cd web && pnpm ehon-check ../shared/build/templates/doc-unlived-library.ehon.json`.
Preview at `/app?template=doc-unlived-library`. The shared catalog discovers this folder
automatically; publish the assembled documents and index with `make templates-upload`.
