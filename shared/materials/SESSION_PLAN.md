# 素材 library: multi-session task list

## Scope and session size

**Current: 143 saved illustrations. Target: 500. Remaining: 357.**

Plan for **54 artwork sessions**, normally 7–10 accepted illustrations per session, plus **3 dedicated engineering/review sessions**. Complex scene sessions contain only 3 illustrations. These are work packages, not a promise that every package fits one conversation: retries or context limits may split a package into `Sxx-a` and `Sxx-b`. Never reduce quality to meet the batch count.

The earlier suggestion of 20–30 assets per batch is superseded by this smaller session plan. Each completed session is a milestone and must be **committed and pushed**, as explicitly requested by the user. The major collection milestones are 100 after S09, 250 after S27, and 500 after S54. S01 is complete: eight new bird paintings.

## Start here in every new session

1. Read this file, `HANDOFF.md`, `README.md`, and the master prompt/refinement in `generation.json`. Read the imagegen skill before generating.
2. Inspect `git status`, branch/upstream, and recent milestone commits. Preserve unrelated work. Use the latest handoff to resume a partial batch before starting another.
3. Count the actual entries in `generation.json` and inspect their saved PNGs. Only accepted, saved, integrated artwork counts. Planned entries stay here, not in the runtime manifest.
4. Complete each session package, review it, update the handoff and checklist, and commit/push. S14 is complete at 143 assets. Resume S15 next.

## Art and variation rules

Use the **less-realistic painterly picture-book** direction: broad gouache brushwork, soft watercolor texture, small expressive ink eyes, simplified organic anatomy and warm color. No photographic rendering, glossy 3D detail, flat icons, SVG drawings or emoji.

For each new character, establish one identity image, inspect it, and use it as the reference for all subsequent poses. Use `masters/bird.png` as the overall style reference. Existing characters must retain their existing identities and IDs.

Animal slots: standing, walking, sitting, jumping, sleeping, smiling, surprised, waving, looking left, looking right. Express emotions with a distinct full-body gesture/composition rather than duplicating the neutral pose. All images must show the entire subject. For species where a slot is unnatural, record a named equivalent before generating:

- Bird's existing flying pose occupies its jumping/airborne slot.
- Butterfly: perched, fluttering, wings folded, taking flight, resting, cheerful flutter, startled, wing greeting, facing left, facing right. Existing wings-open artwork occupies perched/resting-open-wing slot; inspect and record the exact mapping in the batch handoff.
- Fish and whale: hovering, cruising, resting low, leaping/breaching, sleeping, smiling, surprised, fin greeting, left, right. Existing swimming artwork occupies cruising.
- Octopus: resting upright, crawling, settled, buoyant leap, sleeping, smiling, surprised, waving an arm, left, right. Always eight arms.
- Crab and ladybug: grounded, walking, settled low, hopping, sleeping, smiling, surprised, raised-claw/foreleg greeting, left, right. Keep the right limb count.

People: 10 consistent characters × 4 poses (standing, walking, sitting, waving), with suitable equivalents such as rolling for a wheelchair user. Existing `child` waving illustration counts as one pose; keep its stable ID. Use varied ages, skin tones and appearances without changing each character between poses.

Scene assets are standalone transparent painted vignettes, with feathered/organic composition boundaries where appropriate, no opaque rectangular backdrop or UI card. They can combine existing character references, but a new scene must be a new illustration.

No mirrored copies, alternate resolutions, recolors, unreviewed outputs or failed generations count toward 500.

The user has explicitly prioritized image assets. Continue S15 next; do not resume engineering changes without a new request. Existing E01 work remains uncommitted.

## Engineering checkpoints

- [x] **M00 — Foundation:** 22 transparent illustrations across all 10 categories; generation metadata and raster catalog; web/native integration; legacy replacement picker; full-resolution web export. Validation recorded in `HANDOFF.md`.
- [ ] **E01 — Deferred at user direction: delivery and progress infrastructure.** Inspect existing database/storage and deployment conventions. Add a versioned curated catalog, on-demand master downloads and offline caching while retaining the bundled starter set. Preserve existing account uploads. Verify new catalog refresh, offline reopening, content-hash integrity and fallback behavior. Add a small progress/validation command to report accepted counts, duplicate IDs, missing masters and character/pose coverage. Keep future remote-only asset metadata available to native builds. Commit and push this engineering milestone. Publishing or deploying is separate from pushing source.
- [ ] **E02 — After S27: 250-asset audit.** Review contact sheets by category and character family; replace style drift or duplicate compositions. Check browse/search performance, thumbnails, full-resolution export, offline use and legacy migration with the larger catalog. Resolve packing/storage issues. Commit and push the audit milestone.
- [ ] **E03 — After S54: 500-asset release audit.** Verify exactly 500 distinct accepted assets, category quotas, 30 animal families with 10 variants each, metadata and master links. Exercise web/native browse, search, insertion, drag/drop where supported, transforms, undo, save/reopen and export. Record remaining issues and delivery status. Commit and push. Do not equate a Git push with a deployed release.

## Artwork sessions

Counts below are **new accepted artwork**, with cumulative totals including the existing 22. Check a row only after its outputs, metadata, review and validation are complete. Record push results in the session response; Git history is the source of commit hashes.

| Done | Session | Category | Exact batch | New PNGs | Total |
| --- | --- | --- | --- | ---: | ---: |
| [x] | S01 | Animals | Bird: finish its 10-variation set | 8 | **30** |
| [x] | S02 | Nature | A: cherry tree, pine tree, palm tree, apple tree, sapling, sunflower, tulips, daisies, rose bush, fern | 10 | **40** |
| [x] | S03 | Animals | Turtle: finish its 10-variation set | 8 | **48** |
| [x] | S04 | People | A: existing child × 3 missing poses; curly-haired child × 4; child with glasses × standing and walking | 9 | **57** |
| [x] | S05 | Animals | Penguin: finish its 10-variation set | 8 | **65** |
| [x] | S06 | Objects | A: open book, closed book, backpack, basket, umbrella, teddy bear, kite, ball, crayon box, treasure chest | 10 | **75** |
| [x] | S07 | Vehicles | A: car, bicycle, tricycle, train, tram, fire engine, ambulance, tractor, sailboat, hot-air balloon | 10 | **85** |
| [x] | S08 | Food | A: banana, strawberry, orange, pear, grapes, watermelon, cherries, peach | 8 | **93** |
| [x] | S09 | Background elements | A: sun, moon, rainbow, star cluster, rolling hills, mountain range, winding path | 7 | **100** |
| [x] | S10 | Animals | Butterfly: finish its 10-variation set | 9 | **109** |
| [x] | S11 | Buildings / Places | A: school, library, bakery, bookshop, post office, hospital, train station | 7 | **116** |
| [x] | S12 | Animals | Fish: finish its 10-variation set | 9 | **125** |
| [x] | S13 | Seasonal / event assets | Snowman, decorated fir, wrapped present, Easter eggs, sakura garland, koinobori, Tanabata bamboo, summer festival fan, autumn wreath | 9 | **134** |
| [x] | S14 | Animals | Octopus: finish its 10-variation set | 9 | **143** |
| [ ] | S15 | Storybook scenes | A: woodland picnic, pondside garden, vegetable garden | 3 | **146** |
| [ ] | S16 | Animals | Whale: finish its 10-variation set | 9 | **155** |
| [ ] | S17 | Nature | B: mushroom cluster, berry bush, acorn, pinecone, fallen leaves, wildflower patch, grassy tuft, reeds, lily pad, cattails | 10 | **165** |
| [ ] | S18 | Animals | Crab: finish its 10-variation set | 9 | **174** |
| [ ] | S19 | People | B: child with glasses × sitting and waving; child using wheelchair × 4; toddler × 4 | 10 | **184** |
| [ ] | S20 | Animals | Ladybug: finish its 10-variation set | 9 | **193** |
| [ ] | S21 | Objects | B: chair, table, bed, teapot, watering can, flowerpot, clock, mailbox, bucket, hand drum | 10 | **203** |
| [ ] | S22 | Animals | Owl: finish its 10-variation set | 9 | **212** |
| [ ] | S23 | Vehicles | B: airplane, helicopter, rocket, submarine, rowboat, scooter, snowplow, garbage truck, delivery van | 9 | **221** |
| [ ] | S24 | Food | B: bread loaf, croissant, pancakes, rice ball, noodles, curry, soup, sandwich | 8 | **229** |
| [ ] | S25 | Background elements | B: rain cloud, snow cloud, pond, stream, waterfall, shoreline, garden fence | 7 | **236** |
| [ ] | S26 | Buildings / Places | B: treehouse, castle, windmill, lighthouse, farm barn, market stall, playground | 7 | **243** |
| [ ] | S27 | Nature | C: boulder, pebbles, tree stump, hollow log, seaweed, coral, seashell | 7 | **250** |
| [ ] | S28 | Animals | Cat: establish identity and generate 10 variations | 10 | **260** |
| [ ] | S29 | Animals | Dog: establish identity and generate 10 variations | 10 | **270** |
| [ ] | S30 | People | C: grandmother × 4; grandfather × 4; teacher × standing and walking | 10 | **280** |
| [ ] | S31 | Animals | Rabbit: establish identity and generate 10 variations | 10 | **290** |
| [ ] | S32 | Animals | Bear: establish identity and generate 10 variations | 10 | **300** |
| [ ] | S33 | Nature | D: bamboo, maple tree, willow tree, snowy fir, lotus, lavender, dandelion | 7 | **307** |
| [ ] | S34 | Animals | Fox: establish identity and generate 10 variations | 10 | **317** |
| [ ] | S35 | Animals | Squirrel: establish identity and generate 10 variations | 10 | **327** |
| [ ] | S36 | Objects | C: paintbrush, palette, binoculars, magnifying glass, compass, suitcase, wheelbarrow, toy blocks, sled | 9 | **336** |
| [ ] | S37 | Animals | Mouse: establish identity and generate 10 variations | 10 | **346** |
| [ ] | S38 | Animals | Hedgehog: establish identity and generate 10 variations | 10 | **356** |
| [ ] | S39 | People | D: teacher × sitting and waving; mail carrier × 4; gardener × 4 | 10 | **357** |
| [ ] | S40 | Animals | Deer: establish identity and generate 10 variations | 10 | **376** |
| [ ] | S41 | Animals | Raccoon: establish identity and generate 10 variations | 10 | **386** |
| [ ] | S42 | Food | C: cupcake, birthday cake, cookies, ice cream, pudding, milk, juice, filled picnic basket | 8 | **394** |
| [ ] | S43 | Animals | Panda: establish identity and generate 10 variations | 10 | **404** |
| [ ] | S44 | Animals | Elephant: establish identity and generate 10 variations | 10 | **414** |
| [ ] | S45 | Storybook scenes | B: undersea reef, snowy sledding hill, night campsite | 3 | **417** |
| [ ] | S46 | Animals | Giraffe: establish identity and generate 10 variations | 10 | **427** |
| [ ] | S47 | Animals | Lion: establish identity and generate 10 variations | 10 | **437** |
| [ ] | S48 | Animals | Monkey: establish identity and generate 10 variations | 10 | **447** |
| [ ] | S49 | Storybook scenes | C: village festival, rainy-day walk, cozy reading nook | 3 | **450** |
| [ ] | S50 | Animals | Horse: establish identity and generate 10 variations | 10 | **460** |
| [ ] | S51 | Animals | Cow: establish identity and generate 10 variations | 10 | **470** |
| [ ] | S52 | Animals | Sheep: establish identity and generate 10 variations | 10 | **480** |
| [ ] | S53 | Animals | Pig: establish identity and generate 10 variations | 10 | **490** |
| [ ] | S54 | Animals | Duck: establish identity and generate 10 variations | 10 | **500** |

## Definition of done for each artwork session

- [ ] Generate actual raster artwork with transparent backgrounds using the saved master prompt and refinement; one subject/variation per file.
- [ ] Inspect each image at useful size over light and colored backgrounds: full silhouette, clean alpha, correct anatomy, distinctive pose, painterly finish and consistent identity. Regenerate failures; do not count them.
- [ ] Save accepted originals persistently in `masters/` and record exact prompts, reference IDs, stable IDs, category, bilingual names, tags, character family and pose in `generation.json`. Record any pose equivalence in metadata/tags and the handoff.
- [ ] Package the artwork and update generated catalog files. Run the progress validator when E01 supplies it. Confirm generated derivatives decode and use the intended saved masters.
- [ ] Smoke-test new assets in the app: browsing/search, insertion, correct proportions, save/reopen and full-resolution export. Run relevant automated checks; full broad regression runs belong at engineering checkpoints or when code changes warrant them.
- [ ] Check off this session, update actual totals and `HANDOFF.md` with accepted IDs, unfinished work and next task. Preserve failed-attempt notes only when useful for avoiding repetition.
- [ ] Review the diff and stage only this milestone's files. Include original PNGs, metadata and generated source catalog together. Never commit credentials, videos/GIF recordings, build output or unrelated work.
- [ ] Commit with a clear milestone message, for example `feat(materials): S01 complete bird variations (30/500)`.
- [ ] Push the current intended branch to its existing upstream. Verify remote HEAD matches the commit. Never force-push to overcome divergence. If push fails, retain the commit, report the exact blocker and leave push completion in the handoff; do not claim delivery succeeded.

If a package must stop early, save and integrate the accepted subset, record remaining exact IDs/poses, commit and push a clearly labeled partial checkpoint. Never check the full package off prematurely.

## Reusable next-session request

> Continue the 素材 library rebuild in `/Users/Phat/Personal/ehon-maker`. Read `shared/materials/SESSION_PLAN.md` and `shared/materials/HANDOFF.md`, then complete the next pending session only. Maintain the less-realistic painterly picture-book style using saved character references. Save and integrate every accepted PNG, update progress and the handoff, run relevant checks, then commit and push the milestone. Preserve unrelated changes.
