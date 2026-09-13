# はじめての なつまつり（First Summer Festival）

An original summer-night story, bound like `love-letter/` (decision #56): 表紙, 扉, eight spreads,
裏表紙 with the colophon. Two of the spreads are two-page pictures.

Kon the fox cub goes to the summer festival alone for the first time, with a single shiny
hundred-yen coin. He chooses goldfish scooping, the paper net tears on the first try, and he sits
on the shrine steps hugging his knees while the drums play in the distance. The goldfish stall's
owner, a tanuki, comes over with a goldfish in a bag: your first festival, isn't it? This one is
on the house. Kon joins the bon dance, watches the fireworks, and on the way home names his
goldfish Hanabi.

| Pages | Composition |
| --- | --- |
| 表紙 | A cream band with the title above the night: fireworks over Kon holding his goldfish bag |
| 扉 | Title page with a lantern and a goldfish |
| 1–2 | Evening under the torii, lanterns strung above, the moon rising; Kon holds up his coin |
| 3–4 | A two-page picture of the stall street: cotton candy and shaved ice on the left page, goldfish scooping and masks on the right, the owner behind his counter, a rabbit in a yukata. Only the stall signs are words on the page |
| 5–6 | Kon reaching over the tank with the torn net, the goldfish leaping free, the owner watching / びりっ！ |
| 7–8 | Kon on the stone steps hugging his knees, front view, a tear on his cheek, the torn net beside him, notes drifting in from the dance |
| 9–10 | The tanuki crouches down to Kon's height and holds out the goldfish bag; Kon looks up |
| 11–12 | A two-page picture of the bon dance: the yagura with its drummer and lanterns straddles the gutter, dancers on both pages. The frame words are the drum's どん どん どどん and あ、それ！ in terracotta so they read on the night sky |
| 13–14 | Three fireworks over Kon and the tanuki, both looking up |
| 15–16 | The way home: Kon from behind with the bag, the torii and the lanterns small and far, the moon / おまえの なまえは、はなび |
| 裏表紙 | Colophon: 発行, さく, え, with a goldfish |

## Narration (off the page)

The reader's script for the two-page pictures:

- 3–4: わたあめ、かきごおり、きんぎょすくい、おめん。ちょうちんの したは、いい におい。コンは きょろきょろ、きょろきょろ。「どれに しようかな。」
- 11–12: どん、どん、どどん。やぐらの まわりで、みんなが おどっている。コンも わに はいった。てを あげて、まわって、ぐるぐる。「あ、それ！」

## Drawing notes

Same ink and flat fills as the other stories. The night is a `night-sky` piece over the top
57 percent of the page and a `path` piece from 52 percent down, so lanterns and fireworks sit on
navy while characters and words stand on cream. Words drawn inside a picture on the night sky use
`colorIndex` 1 (terracotta); ink would vanish. The stall is two pieces, `stall` (back wall,
awning, sign board) and `counter`, so the owner and the goods can stand between them; the four
stalls on 3–4 are the same two pieces placed four times with different goods. Kon has seven
poses; his raised hand is at viewBox point (204, 106), where the torn net is attached with its
handle rotated 180 degrees so its head hangs in the tank. The yagura is one drawing placed at
x 100 on the left page and x 0 on the right page so the gutter splits it.

Build with `make web-core`; the assembled document is `shared/build/templates/doc-summer-festival.ehon.json`,
checked with `cd web && pnpm ehon-check ../shared/build/templates/doc-summer-festival.ehon.json` and published with `make templates-upload`.
