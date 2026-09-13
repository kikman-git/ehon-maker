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
| 15–16 | 15, 16 | Jupiter across both pages: a round pufferfish with two large eyes, small fish, rising bubbles and curling seaweed / the bear kneeling with the red hyacinth held low, with a worried expression, MARS in the corner |
| 17–18 | 17, 18 | Venus across both pages: staggered rows of partly buried carrots with tall leaves, the rabbit's ears and crown appearing between them / the bear in profile in his I LOVE Carrot cap, holding a watering can, Jupiter in the corner |
| 19–20 | 19, 20 | The rabbit and the bear sit large on either side of the gutter, eating their carrot halves, with a flower on the rabbit's ear and the bear's cap. Venus, the crescent moon and stars sit above them; narration stays off the artwork |
| 21–22 | 21, 22 | The rabbit's ears peeking up, the red tulip and the confession itself. The storyboard's rule: the last page carries your own words, so these two lines are the ones to retype or hand-write |
| 裏表紙 | back cover | Colophon: 発行 date, さく author, え illustrator, as the storyboard prescribes |

The sources are `story.json` and the SVG pieces in `art/`; the original photographs are not
bundled. Build with `make web-core`; the assembled, portable document is
`shared/build/templates/doc-love-letter.ehon.json`, checked with
`cd web && pnpm ehon-check ../shared/build/templates/doc-love-letter.ehon.json`, and published with
`make templates-upload` (decision #60).

The table uses **draft page numbers**. The template's index includes the cover and title page,
so **template pages 15–22 are draft pages 13–20** (`p13`–`p20` in `story.json`). These four
spreads were redrawn from scratch from the author's photographs, without using the previous
template illustrations as drawing references:

| Template index | Draft pages | Photograph |
| --- | --- | --- |
| 15–16 | 13–14 | `IMG_7342.jpeg` |
| 17–18 | 15–16 | `IMG_7343.jpeg` |
| 19–20 | 17–18 | `IMG_7344.jpeg` |
| 21–22 | 19–20 | `IMG_7345.jpeg` |

The photos guide the scenes, poses, lettering and composition. The sharing rabbit takes a softer
storybook style, with a rounded face, bright eyes, pink inner ears, small paws and a fluffy tail.
The flat colours are an interpretation of the pencil drawings. Each encounter has its own steep planet
horizon, and the rocket, curved travel arrow and previous planet occupy the open sky at right.

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
narration for those spreads, and the narration previously placed above the sharing scene
(19–20), is kept below so the artwork follows the photographed pages. The
book is left-bound because its Japanese runs horizontally, as in the sketches.

## Narration (off the page)

The reader's script for spreads 13–20. The encounter narration stays in the margins of the
storyboard; the sharing scene's existing narration is preserved here. 花言葉: a red rose is
一目惚れ, a red hyacinth 嫉妬, a red tulip 真実の愛・愛の告白.

- 13–14: かせいで、うつくしい ねこに であいました。くまは、はなを さしだして、「○○○○」 ねこは いいました。「ごめん。わたしは じぶんしか あいせないの。」 むねが、ちくり。くまは うつむいて、かせいを あとに しました。
- 15–16: もくせいで、まんまるな ふぐと なかよく なりました。「○○○○」 さかなたちも、ともだちに。すると、ふぐは ぷくっと、「わたしより たのしいなら でていって。」 むねが、ちくちく。くまは なきながら、もくせいを あとに しました。
- 17–18: きんせいで、くまは にんじんを そだてました。あるひ、はたけから ぴょん。ぴょん。うさぎが かおを だしました。「ごちそう。ぼくの ごちそう！」 ふたりは、にっこり。うさぎは いちばん おおきな にんじんを、すぽん！ くまに さしだしました。
- 19–20: 「おいしいね。ひとりで たべるより、ふたりで たべるほうが おいしいね」 にんじんを はんぶんに。ぽきん。ふたりで、むしゃむしゃ。ぽりぽり。くまの むねが、ぽっと あたたかく なりました。そして、くまは いいました。

Drawing conventions, so new pieces match: brown ink outlines (`#6c5849`, 1.2–1.8 wide in a
200-ish viewBox), flat warm fills (bear `#cea473`, cream `#fff0d9`, blue `#8db6c3`, coral
`#dc9688`, leaf `#96ae80`), dot eyes, rounded forms. A character that stands at a page edge, like
the teammate on page 1, is placed at `x: 0` so the page crops it. Backdrops for a two-page scene
come as a left and a right piece (`mars-left`, `mars-right`, `venus-left`, `garden-left`, …) so the
horizon continues across the gutter; on the encounter spreads it falls from the upper left, as in
the sketches, and the planet's name is a text item rotated to lean along it. `corner-*` is the planet
the bear came from, seen from afar in the right page's top corner, with its name rotated inside.
The redrawn pieces for draft pages 13–20 use brown ink `#69584d` at width 1.8, with finer lines
for facial details. Their larger viewBoxes retain the photographed proportions. The cap's
I LOVE Carrot lettering is drawn with paths so it renders in both shared painters. The new
`encounter-star`, `journey-rocket`, planted carrots and watering pieces are separate assets;
flowers and eaten carrot halves are drawn into the characters' hands.
