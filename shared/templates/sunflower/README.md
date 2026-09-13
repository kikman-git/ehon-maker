# おおきく なあれ（Grow Big!）

An original story about growing something, bound like `love-letter/` (decision #56): 表紙, 扉,
eight spreads with the picture on the left and the words on the right, 裏表紙 with the colophon.

Hinata plants a sunflower seed in spring and waters it every day. Every picture page is a
cross-section: the garden above the grass line, the earth below it, where Mogu the mole lives.
The root grows down into his burrow, spreads into a roof over his naps, and on the night of the
storm, while Hinata watches from her window, Mogu holds the roots with all his might. In the
morning the flower opens, the two meet for the first time, they share the seeds in autumn, and next
spring they plant a whole row together.

| Pages | Composition |
| --- | --- |
| 表紙 | The favourite picture: the open sunflower, Hinata looking up, Mogu peeking out of his molehill |
| 扉 | Title page with a sprout and a seed |
| 1–2 | Spring: Hinata kneels and drops the seed into a hole; below, Mogu asleep under a leaf blanket in his burrow (shelf, acorn, lantern) |
| 3–4 | Watering: the arc of water lands on the first two leaves; a root pokes through the burrow ceiling and Mogu looks up at it |
| 5–6 | Early summer: a knee-high plant with a ladybug; the roots spread and Mogu naps among them |
| 7–8 | Summer: taller than Hinata and the fence, a closed bud, a bee; Mogu watches the big root |
| 9–10 | The storm at night: dark clouds, rain, wind lines, the stem bent over, a leaf torn off, Hinata at the lit window; below, Mogu on tiptoe hugging the roots, sweating |
| 11–12 | Morning: the flower open and enormous, Hinata amazed, Mogu's head popping out of the ground beside the stem |
| 13–14 | Autumn: the head bows heavy with seeds, sparrows peck, Hinata holds a bowl of seeds and Mogu his one seed |
| 15–16 | Next spring: a row of sprouts, a jar of seeds, Hinata planting again, Mogu digging at the far end |
| 裏表紙 | Colophon: 発行, さく, え, with a seed |

## Drawing notes

Same ink and fills as the other stories. The grass line is fixed at 62.5 percent of the page: the
`soil` piece sits at y 78.75 so its top edge lands there, everything above ground stands on that
line, and the underground pieces (burrow, roots, mole) live between it and the page bottom. The
sunflower comes in five stages (sprout, small plant, tall plant with a bud, open flower, bowed
autumn head) plus the storm-bent stem, all sharing one heart-shaped leaf drawn once and reused
through `transform`. Hinata has four poses (kneeling side view, watering side view, front view
with arms up, front view holding the bowl) plus the window; Mogu five (asleep, looking up, holding
the roots, peeking from a molehill, sitting with a seed). The sun, cloud, sparrow and heavy rain
pieces are the same drawings as in `leaf-umbrella/`.

Build with `make web-core`; the assembled document is `shared/build/templates/doc-sunflower.ehon.json`,
checked with `cd web && pnpm ehon-check ../shared/build/templates/doc-sunflower.ehon.json` and published with `make templates-upload`.
