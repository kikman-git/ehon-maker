# はっぱの かさ（The Leaf Umbrella）

An original rainy-season story, bound the way `love-letter/` is (decision #56): 表紙, 扉, eight
spreads with the picture on the left and the words on the right, 裏表紙 with the colophon.

Kero the frog finds a leaf as big as an umbrella. One by one the neighbours squeeze in under it,
mouse, snail, sparrow, until a bear far too big for any leaf stands dripping in the downpour and
asks, very quietly, to come in too. The friends climb onto his head and hold the leaf there: as
long as his head stays dry, he says, he is fine. When the rain stops, they all walk home under the
rainbow.

| Pages | Composition |
| --- | --- |
| 表紙 | The favourite picture: the laughing bear with the whole gang on his head under the leaf, and the title |
| 扉 | Title page, small, with the leaf and a puddle |
| 1–2 | Rain begins; Kero under the big leaf beside the hydrangea / ぽつ、ぽつ、ぽつ |
| 3–4 | The mouse runs in from the left / いれて、いれて！ |
| 5–6 | The snail crawls in from the right, slowly / まって、まって〜 |
| 7–8 | The sparrow dives in soaking wet; the leaf is full / ぎゅうぎゅう |
| 9–10 | A two-page picture: heavy rain, the friends look up from the left page, the enormous wet bear fills the right page. Only the words drawn in the frames are on the page (ざあざあ、ざあざあ / いれて…) |
| 11–12 | The bear sits hugging his knees, front view, a tear on his cheek; the friends think, a light bulb over the frog / しょんぼり |
| 13–14 | Everyone on the bear's head, the frog holding the leaf up, the snail on his paw; the bear laughs / あたまだけ ぬれなければ |
| 15–16 | The rain has stopped: sun, rainbow, the bear walking home with the frog on his head, the mouse peeking over his shoulder, the snail riding the leaf, the sparrow flying alongside / また みんなで はっぱの かさ！ |
| 裏表紙 | Colophon: 発行, さく, え, with the snail |

## Narration (off the page)

The reader's script for the two-page picture on 9–10:

- ざあざあ、ざあざあ。あめが つよく なった。そのとき、おおきな おおきな かげ。「だれ？」 みんなが みあげると、ずぶぬれの くまが たっていた。

## Drawing notes

Brown ink `#69584d` at width 1.8, flat fills, dot eyes and blush like the love-letter pieces. The
frog's raised fist is at viewBox point (208, 72) and the leaf's stem ends at (160, 296), so the
leaf is attached to the frog wherever he stands; the compose step anchors the friends to points on
the bear drawings (head top, shoulder, paw) rather than to guessed page coordinates. The rain is a
full-page layer of streaks placed right after the cloud band, heavier on the storm spread. The
bear is a darker brown (`#b58f68`) than the love-letter bear so the two books do not share a
character.

Build with `make web-core`; the assembled document is `shared/build/templates/doc-leaf-umbrella.ehon.json`,
checked with `cd web && pnpm ehon-check ../shared/build/templates/doc-leaf-umbrella.ehon.json` and published with `make templates-upload`.
