# 夜をわたる 郵便くじら / The Midnight Post Whale

After a quarrel with her sister, Nagi cannot finish an apology. A whale with a mailbox
on its back takes her across a sea of unsent words. She learns to make a specific
apology without asking forgiveness to arrive on her own schedule. The book ends with
an unanswered invitation and the small act of opening a window.

An original Japanese picture book for older readers as well as families. Bound to the
Love Letter reference: **25 portrait pages**, a cover and title page, eleven spreads, and
a back cover. Horizontal Japanese reads left to right. Ordinary spreads put the picture
on the left and editable Yomogi words on the right; two uninterrupted illustration
spreads give the story room to breathe. Every character and prop is a separate SVG part.

| Draft pages | Composition |
| --- | --- |
| 表紙 | Title above a scene taken from the book; the picture and each title line remain editable. |
| 扉 | Quiet title page with the book's emblem; preserves the picture-left, words-right pairing. |
| 1–2 | Nagi at the harbor desk; an unfinished letter and pen lie separately on the wood. |
| 3–4 | A post whale draws up alongside the lit pier; Nagi reaches toward the mailbox. |
| 5–6 | Nagi boards by a rope ladder, carrying the letter; the answer is left with its recipient. |
| 7–8 | Bottles containing unsaid words drift at different distances below the listening whale. |
| 9–10 | A sea of open doors; light falls like long paths over the water. Nagi and the whale pass beneath them. |
| 11–12 | An intimate pause on the whale; its eye closes while Nagi finds words without advice. |
| 13–14 | A close-up aboard the listening whale shows Nagi rewriting the apology before returning home. |
| 15–16 | Nagi releases the letter boat and lets the tide carry it; the boat is a movable part. |
| 17–18 | A long, quiet dawn with the whale at left, a distant lighthouse at right, and the letter boat ahead. |
| 19–20 | Nagi stands on the pier in morning colors; the waiting continues without a promised reunion. |
| 21–22 | Two chairs and two cups, one person: an invitation remains possible while Nagi lives the present. |
| 裏表紙 | Emblem and editable 発行, さく, え fields for the person making this copy. |

## Narration outside the picture

These passages are the reader's script for the two full illustration spreads. They are
kept here, out of the artwork, following Love Letter's storyboard convention.

- **9–10:** 海の向こうに、扉がいくつも立っていた。閉まった扉も、少し開いた扉もあった。ナギは、開けてほしいと願うことと、こじ開けることの違いを考えた。
- **17–18:** 帰りの海は、行きよりも広く見えた。手紙はもう、ナギの手の中にはなかった。空が明るくなるまで、くじらと波の音を聞いていた。

## Illustration and editing notes

Indigo sea, faded teal, coral sealing wax and lantern gold distinguish this nocturnal voyage. Flat colour, fine rounded ink contours, expressive poses, and deliberate paper
space keep the illustrations readable from shelf thumbnail to printed spread. Backgrounds
contain architecture or landscape; people, creatures, keepsakes and foreground plants
remain independently movable. Paired panoramic backgrounds share one 1200 × 800 scene,
split at the gutter into matching 600 × 800 pieces. No raster images, gradients, filters,
SVG text, external references or unsupported SVG elements are needed by either painter.

The final silence is intentional: reconciliation is not owed, and hope can coexist with daily life. All story lines are complete; only the colophon intentionally contains blanks.
To rewrite the story, edit the real text items. To rearrange a scene, select its pieces or
place them again from **素材 → この えほんの え**. `story.json` and `art/*.svg` are the sources.

Build with `make web-core`, then validate with
`cd web && pnpm ehon-check ../shared/build/templates/doc-midnight-whale.ehon.json`.
Preview at `/app?template=doc-midnight-whale`. The shared catalog discovers this folder
automatically; publish the assembled documents and index with `make templates-upload`.
