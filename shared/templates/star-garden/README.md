# 星を植える 庭 / The Garden of Falling Stars

An elderly deer gardener wishes to leave his name in the sky. A fallen star seems
to offer that chance, but the seed resists his timetable and blooms as an ordinary
white flower. Its dew reflects the night for a wandering moth. Sharing its seeds
gives the gardener a different relation to what may outlast him.

An original Japanese picture book for older readers as well as families. Bound to the
Love Letter reference: **25 portrait pages**, a cover and title page, eleven spreads, and
a back cover. Horizontal Japanese reads left to right. Ordinary spreads put the picture
on the left and editable Yomogi words on the right; two uninterrupted illustration
spreads give the story room to breathe. Every character and prop is a separate SVG part.

| Draft pages | Composition |
| --- | --- |
| 表紙 | Title above a scene taken from the book; the picture and each title line remain editable. |
| 扉 | Quiet title page with the book's emblem; preserves the picture-left, words-right pairing. |
| 1–2 | The antlered gardener studies a constellation chart at his desk; a blank label waits nearby. |
| 3–4 | He kneels beside a fallen star, lit by a separate brass lantern. |
| 5–6 | The seed goes into the garden bed; a blank name label marks the spot, with an empty pot and trowel nearby. |
| 7–8 | Rain falls on the weathered marker and bare bed, with an empty pot and watering can nearby. |
| 9–10 | A cross-section follows tiny seed lights and branching roots beneath one continuous soil horizon. |
| 11–12 | The gardener removes the weathered label; the seed remains planted despite his disappointment. |
| 13–14 | Dimming the lantern for a moth reveals a small shoot at the edge of the soil. |
| 15–16 | An intimate close-up gives the ordinary white flower more space than the gardener who expected a golden star. |
| 17–18 | Moonlight catches the dew on a field of white flowers, making a low constellation across both pages. |
| 19–20 | The gardener shares seeds with a hedgehog neighbor instead of claiming the flower’s name. |
| 21–22 | The gardener leaves the gate open. A dim lantern, petals and an ordinary flower hold the final page. |
| 裏表紙 | Emblem and editable 発行, さく, え fields for the person making this copy. |

## Narration outside the picture

These passages are the reader's script for the two full illustration spreads. They are
kept here, out of the artwork, following Love Letter's storyboard convention.

- **9–10:** 土の下の時間は、庭師の暦では測れなかった。見えないところで、細いものが少しずつ伸びていた。それを庭師は、まだ知らなかった。
- **17–18:** 季節がもうひとつめぐり、白い花がふえた。夜になると、花びらの露が空を映した。ひとつひとつは小さく、庭師の名前もなかった。それでも、庭を渡る蛾には、帰り道の明るさがあった。

## Illustration and editing notes

Lichen green, blue dusk, old clay, seed gold and soft white petals make this a botanical night world. Flat colour, fine rounded ink contours, expressive poses, and deliberate paper
space keep the illustrations readable from shelf thumbnail to printed spread. Backgrounds
contain architecture or landscape; people, creatures, keepsakes and foreground plants
remain independently movable. Paired panoramic backgrounds share one 1200 × 800 scene,
split at the gutter into matching 600 × 800 pieces. No raster images, gradients, filters,
SVG text, external references or unsupported SVG elements are needed by either painter.

The flower is allowed to differ from the gardener’s wish; the ending leaves an open gate, not a named monument. All story lines are complete; only the colophon intentionally contains blanks.
To rewrite the story, edit the real text items. To rearrange a scene, select its pieces or
place them again from **素材 → この えほんの え**. `story.json` and `art/*.svg` are the sources.

Build with `make web-core`, then validate with
`cd web && pnpm ehon-check ../shared/build/templates/doc-star-garden.ehon.json`.
Preview at `/app?template=doc-star-garden`. The shared catalog discovers this folder
automatically; publish the assembled documents and index with `make templates-upload`.
