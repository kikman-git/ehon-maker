# ゆきうさぎの よる（The Snow Rabbit's Night）

An original winter story, bound like `love-letter/` (decision #56): 表紙, 扉, eight spreads with the
picture on the left and the words on the right (one of them a two-page picture), 裏表紙 with the
colophon.

On a snowy morning Sora and his grandmother make a yuki-usagi, the classic Japanese snow rabbit:
a mound of snow with nandina leaves for ears and two red nandina berries for eyes. Sora names it
Yuki and leaves it on the veranda for the night. Under the moon its berry eyes flash, its leaf ears
twitch, and it hops into the garden to play with two wild rabbits, filling the snow with tracks.
It is back on its tray by dawn, a little smaller, and by noon it has melted to a puddle, two red
berries and two leaves. Sora sits hugging his knees; his grandmother promises they will make
another when it snows again, and the berries go on the veranda edge where, that night, the wild
rabbits come to look.

| Pages | Composition |
| --- | --- |
| 表紙 | A cream band with the title above the night: Yuki hopping under the moon between the two wild rabbits, tracks in the snow |
| 扉 | Title page with the snow rabbit |
| 1–2 | Snow falling: Sora crouching in coat and knitted hat, his grandmother kneeling with a nandina branch, the finished Yuki on a red tray between them; the veranda and shoji at left, a snowy tree at right |
| 3–4 | Night: the shoji glow, Yuki on its tray on the veranda edge, the moon, snow falling; the words page carries a small picture of Sora asleep under his quilt |
| 5–6 | Yuki, eyes shining, mid-hop off the veranda into the garden, sparkles in its wake, the empty tray behind |
| 7–8 | A two-page picture of the moonlit garden: Yuki and a wild rabbit on the left page, a rabbit mid-hop and another sitting on the right, tracks everywhere. Frame words ぴょん ぴょん / ぴょーん！ in terracotta |
| 9–10 | Dawn colours over the snow; Yuki landing back on its tray, the wild rabbits at the garden's edge |
| 11–12 | Morning: Sora in his hanten on the veranda, the garden covered in tracks, Yuki on its tray a little smaller |
| 13–14 | Noon: the sun out, Sora sitting on the veranda edge hugging his knees, front view, a tear on his cheek; the tray holds a puddle, two leaves and two berries; his grandmother stands in the garden |
| 15–16 | Evening: Sora and his grandmother on the lit veranda, the berries in a small dish on its edge, the two wild rabbits sitting in the snow looking up at them |
| 裏表紙 | Colophon: 発行, さく, え, with the snow rabbit |

## Narration (off the page)

The reader's script for the two-page picture on 7–8:

- つきの ひかりの なかで、ユキは のうさぎたちに であった。ぴょん、ぴょん、ぴょーん。ゆきの うえに、あしあとが いっぱい。

## Drawing notes

Same ink and flat fills as the other stories. Exterior scenes share one layout: a sky piece over
the top 57 percent (`day-sky`, `night-sky` or `dawn-sky`), `snow-ground` from 52 percent down, and
the `engawa` piece (shoji, plank, step stones) filling the left half so the veranda plank runs at
about 55 to 62 percent, where the tray, the sitting boy and the berry dish rest. `shoji-lit` is the
same shoji grid filled with lamplight, laid exactly over the engawa's panels for the night pages.
The snow rabbit has four states (on the tray, alive and hopping, shrunken, melted remains) built
from one drawing routine, and the wild rabbits two poses. Words drawn on the night sky use
`colorIndex` 1. The snowfall is a full-page layer of white flakes with a pale outline so it also
reads on the day sky.

Build with `make web-core`; the assembled document is `shared/build/templates/doc-snow-rabbit.ehon.json`,
checked with `cd web && pnpm ehon-check ../shared/build/templates/doc-snow-rabbit.ehon.json` and published with `make templates-upload`.
