# 影の なまえ / A Shadow of One’s Own

Rei has become accustomed to saying yes. One morning the shadow refuses to follow,
experiments with unfamiliar shapes, and asks to be called Sumi. Rei’s fear of being
abandoned becomes an honest conversation. Their evening dance and next morning’s
small boundary let companionship include two independent wills.

An original Japanese picture book for older readers as well as families. Bound to the
Love Letter reference: **25 portrait pages**, a cover and title page, eleven spreads, and
a back cover. Horizontal Japanese reads left to right. Ordinary spreads put the picture
on the left and editable Yomogi words on the right; two uninterrupted illustration
spreads give the story room to breathe. Every character and prop is a separate SVG part.

| Draft pages | Composition |
| --- | --- |
| 表紙 | Title above a scene taken from the book; the picture and each title line remain editable. |
| 扉 | Quiet title page with the book's emblem; preserves the picture-left, words-right pairing. |
| 1–2 | Rei crosses a sunlit square carrying work; the long violet shadow follows the same path. |
| 3–4 | Rei is halfway up the stairs; the shadow sits at the bottom, refusing its usual route. |
| 5–6 | The shadow speaks on a broad plaster wall below moving laundry; Rei listens from the page edge. |
| 7–8 | The shadow tries bird, deer and freely stretched forms under the laundry line. |
| 9–10 | A wide plaster theater lets three independently movable shadow forms occupy the wall, while Rei watches at left. |
| 11–12 | On a quiet rooftop, the two make room for uncertainty rather than promising never to separate. |
| 13–14 | The shadow chooses the name Sumi; a loose ribbon on the floor echoes a relationship being untied. |
| 15–16 | Inside a chalk circle Rei tries a purposeless dance; Sumi prepares a different movement. |
| 17–18 | Rei and Sumi dance on opposite pages inside one continuous chalk ellipse; neither figure copies the other. |
| 19–20 | At the same staircase, Rei sets a modest boundary. The two now occupy different steps by choice. |
| 21–22 | They walk beside one another in the original square, with different silhouettes and a shared question. |
| 裏表紙 | Emblem and editable 発行, さく, え fields for the person making this copy. |

## Narration outside the picture

These passages are the reader's script for the two full illustration spreads. They are
kept here, out of the artwork, following Love Letter's storyboard convention.

- **9–10:** 影は壁いっぱいに踊った。鳥の形がほどけると、次の形が生まれた。レイは拍手しかけて、手を止めた。上手かどうかを決めるのは、自分ではない気がした。
- **17–18:** 夕日が二人を長くした。レイが跳ねるとき、スミはゆっくり回った。同じ時間の中に、違う動きがあった。円は、どちらもはみ出せるほど大きかった。

## Illustration and editing notes

Terracotta walls, chalk cream, blue-green clothing and violet shadows create a sunlit paper-theater world. Flat colour, fine rounded ink contours, expressive poses, and deliberate paper
space keep the illustrations readable from shelf thumbnail to printed spread. Backgrounds
contain architecture or landscape; people, creatures, keepsakes and foreground plants
remain independently movable. Paired panoramic backgrounds share one 1200 × 800 scene,
split at the gutter into matching 600 × 800 pieces. No raster images, gradients, filters,
SVG text, external references or unsupported SVG elements are needed by either painter.

Sumi remains a separate movable character at the ending; independence is part of the relationship, not a problem to cure. All story lines are complete; only the colophon intentionally contains blanks.
To rewrite the story, edit the real text items. To rearrange a scene, select its pieces or
place them again from **素材 → この えほんの え**. `story.json` and `art/*.svg` are the sources.

Build with `make web-core`, then validate with
`cd web && pnpm ehon-check ../shared/build/templates/doc-shadow-name.ehon.json`.
Preview at `/app?template=doc-shadow-name`. The shared catalog discovers this folder
automatically; publish the assembled documents and index with `make templates-upload`.
