# きみへの ことばを さがして（Love letter 絵本）

An adaptation of the author's hand-drawn storyboard, and the reference for how a story template
is structured from now on: a Japanese picture book, bound the way the storyboard is.

| Pages | Storyboard sheet | Composition |
| --- | --- | --- |
| 表紙 | cover | Title, the astronaut bear with a red tulip and a box of hearts. The storyboard's rule: the cover picture comes from your favourite page, plus the title |
| 扉 | — | Title page. Not on the storyboard; it keeps every later spread paired picture-left, words-right in the app's 見開き view |
| 1–2 | 1, 2 | Beach volleyball, two against two: the panda and ファット on this side of the net, a teammate cropped at the left edge behind it / everyday life |
| 3–4 | 3, 4 | The bear sitting with his arms around his knees, a tear on his cheek, under a flower that hangs its head on the slope / moments of loneliness |
| 5–6 | 5, 6 | A question for the flower / something is missing |
| 7–8 | 7, 8 | The talking flower and a heart / the flower describes love |
| 9–10 | 9, 10 | Solar system across both pages / “Where is it?” “In space.” |
| 11–12 | 11, 12 | Bear dressed for space / setting off |
| 13–14 | 13, 14 | Mars across both pages: the horizon falls from the upper left, MARS slanting along it, the cat sitting tall in a wall of flames / the bear kneeling with his head bowed and the red rose held low, the rocket flying off, EARTH in the corner |
| 15–16 | 15, 16 | Jupiter across both pages: the round pufferfish with one huge eye, little fish all round, bubbles and weed / the bear kneeling with the red hyacinth held low, looking at us worried, MARS in the corner |
| 17–18 | 17, 18 | Venus across both pages: a full carrot field, most of each carrot in the earth and extra leaf tufts behind, the rabbit showing only ears and eyes / the bear in profile in his I♥carrot cap, watering can held ahead of him, in tears, Jupiter in the corner |
| 19–20 | 19, 20 | The same garden under the moon: the rabbit and the bear each eat half the carrot, the margin narration set above them. The storyboard marks this spread 固定 (fixed) |
| 21–22 | 21, 22 | The rabbit's ears peeking up, the red tulip and the confession itself. The storyboard's rule: the last page carries your own words, so these two lines are the ones to retype or hand-write |
| 裏表紙 | back cover | Colophon: 発行 date, さく author, え illustrator, as the storyboard prescribes |

The sources are `story.json` and the SVG pieces in `art/`; the original photographs are not
bundled. Build with `make web-core`; the assembled, portable document is
`shared/build/templates/doc-love-letter.ehon.json`, checked with `cd web && pnpm ehon-check`.

Open `/app?template=doc-love-letter`, or choose the book on the template shelf. The web studio
opens illustrated portrait books in **見開き** (facing-page) view with the selection tool active.
Click either page to edit it, or use **1ページ** to work on one page. Each character and prop can
be moved, resized, rotated, layered, deleted and placed again from **素材 → この えほんの え**.
Captions are real text items in the Yomogi handwriting font. The `○○○○` love messages in the
narration are intentional, ready for the author to fill in, as are the names and date on the back
cover.

Pages 1–12 keep the storyboard's picture/text rhythm, including the illustrated solar-system
spread. The three encounters (13–18) are two-page pictures, as drawn: the planet's horizon runs
across the gutter, the left page carries only the storyboard's own words (さいしょに ついたのは and
the planet's name), the right page the bear, the rocket and the planet he came from. The margin
narration for those spreads is the reader's script, not words on the page; it is kept below. The
book is left-bound because its Japanese runs horizontally, as in the sketches.

## Narration (off the page)

The storyboard writes this beside spreads 13–18, for whoever reads the book aloud. 花言葉: a red rose
is 一目惚れ, a red hyacinth 嫉妬, a red tulip 真実の愛・愛の告白.

- 13–14: かせいで、うつくしい ねこに であいました。くまは、はなを さしだして、「○○○○」 ねこは いいました。「ごめん。わたしは じぶんしか あいせないの。」 むねが、ちくり。くまは うつむいて、かせいを あとに しました。
- 15–16: もくせいで、まんまるな ふぐと なかよく なりました。「○○○○」 さかなたちも、ともだちに。すると、ふぐは ぷくっと、「わたしより たのしいなら でていって。」 むねが、ちくちく。くまは なきながら、もくせいを あとに しました。
- 17–18: きんせいで、くまは にんじんを そだてました。あるひ、はたけから ぴょん。ぴょん。うさぎが かおを だしました。「ごちそう。ぼくの ごちそう！」 ふたりは、にっこり。うさぎは いちばん おおきな にんじんを、すぽん！ くまに さしだしました。

Drawing conventions, so new pieces match: brown ink outlines (`#6c5849`, 1.2–1.8 wide in a
200-ish viewBox), flat warm fills (bear `#cea473`, cream `#fff0d9`, blue `#8db6c3`, coral
`#dc9688`, leaf `#96ae80`), dot eyes, rounded forms. A character that stands at a page edge, like
the teammate on page 1, is placed at `x: 0` so the page crops it. Backdrops for a two-page scene
come as a left and a right piece (`mars-left`, `mars-right`, `venus-left`, `garden-left`, …) so the
horizon continues across the gutter; on the encounter spreads it falls from the upper left, as in
the sketches, and the planet's name is a text item rotated to lean along it. `corner-*` is the planet
the bear came from, seen from afar in the right page's top corner, with its name rotated inside.
Each file paints ink `#6c5849` at width 1.7 from its root, so a shape names a stroke only when it
differs.
