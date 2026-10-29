# 素材 library handoff

Updated: 2026-10-29. Repository: `/Users/Phat/Personal/ehon-maker`.

## Current state

- **178 accepted PNGs / 500 target; 322 remaining.** Food P07 integrated.
- Animals: 64 images across the requested 10 species. Bird, butterfly, fish, octopus, turtle and penguin each have 10 poses; the other 4 species have 1 each.
- Nature has 21 images. People has 14 illustrations across 7 characters. Objects has 21 images; vehicles has 11. Food has 17 images. Background elements have 8 images. Buildings / places has 8 images. Seasonal has 10 images. Scenes has 4 scenes.
- All originals are in `masters/`. Exact prompts, references and metadata are in `generation.json`. `catalog.json` and shared `StorybookMaterials.kt` are generated outputs.
- Style is the user's latest direction: less realistic, more painterly picture book. Keep the saved art-direction refinement. Reference `masters/bird.png` for the world style and the corresponding saved character master for variants.
- The committed foundation uses bundled delivery. Local E01 delivery changes are unfinished and uncommitted; no remote publication or deployment has occurred.
- Old procedural catalog artwork has been removed. Twelve legacy IDs resolve to new paintings. Other retired instances have a visible replacement picker in web/native editors, preserving geometry, drawing edits and undo.
- Web PNG export now loads full-resolution masters and reports failed image loads.

## Next session

**Budget priority override (2026-10-28):** user has 17% weekly allowance remaining. Prioritize distinct reusable subjects over extra animal poses. User subsequently authorized P02 (chair, table, bed, watering can), now integrated. P03 added grass, mushrooms, reeds and lily pad. P04 added bread, rice ball, soup and sandwich. User now requests continuous work until stopped. S21 objects are complete. S17 nature is complete. S24 food is complete. Next priority: establish single cat, dog, rabbit and bear characters before extra poses. Animal variations including S16 are deferred. No whale output was accepted.

P01 adds grandmother/waving, grandfather/standing, toddler/sitting and child-wheelchair/sitting. These count toward S19 and S30, not as extra quota: skip these existing poses when returning to those sessions. Original cumulative targets in the plan assume the original order.

The user explicitly requested image assets and stopped unsolicited engineering work. E01 is deferred; preserve its uncommitted changes and do not resume code fixes unless requested.

## P07 food milestone — 178 assets

- Cream/dark review, alpha/hash validation, shared-core build and app insertion/reload/export checks passed.

- croissant, pancakes, noodles and curry added using compact built-in imagegen prompts and bird style reference. Completes S24 together with P04.

## P06 nature milestone — 174 assets

- Cream/dark review, alpha/hash validation, shared-core build and app insertion/reload/export checks passed.

- berry-bush, acorn, pinecone, fallen-leaves, wildflower-patch and cattails added. Exact compact built-in prompts recorded. Completes S17 together with P03.

## P05 everyday props milestone — 168 assets

- Cream/dark review, alpha/hash validation, shared-core build and app insertion/reload/export checks passed.

- teapot, flowerpot, clock, mailbox, bucket and hand-drum added. Exact built-in imagegen prompts and bird reference recorded. Completes S21 together with P02.

## P04 priority meals milestone — 162 assets

- Cream/dark review, alpha/hash validation, shared-core build and app insertion/reload/export checks passed.

- bread-loaf, rice-ball, soup and sandwich generated with compact built-in imagegen prompts and bird style reference. These count toward S24; skip when resuming it.

## P03 priority nature milestone — 158 assets

- grassy-tuft, mushroom-cluster, reeds and lily-pad added with built-in imagegen and bird style reference. Exact compact prompts in generation.json.
- Cream/dark review, alpha/hash validation, shared-core build and app browsing, four insertions, reload persistence and PNG export passed.
- These four count toward S17; skip them when resuming that session.

## P02 priority props milestone — 154 assets

- Chair, table, bed and watering-can added using built-in imagegen with bird style reference; exact compact prompts in generation.json. Watering can regenerated for framing.
- Cream/dark review, alpha/hash validation, shared-core build and app browsing, four insertions, reload persistence and PNG export passed.
- These four assets count toward S21; skip them when resuming that session.

## P01 priority people milestone — 150 assets

- Four new characters saved in masters; compact built-in imagegen prompts recorded in generation.json, child used as style reference.
- Cream/dark review, alpha/hash validation, shared-core build and app browsing, four insertions, reload persistence and PNG export passed.
- Budget-limited checkpoint; S19/S30 remain partial and S16 deferred.

## S15 artwork milestone — 146 assets

- Three scenes: woodland-picnic, pondside-garden, vegetable-garden. Built-in imagegen; exact prompts in generation.json. Garden edge framing corrected with a compact reference edit.
- Light/dark visual review, source/hash validation, shared-core build and app browsing, three insertions, reload persistence and PNG export passed.
- Commit and push this artwork milestone; preserve deferred engineering and Love Letter work.

## S14 artwork milestone — 143 assets

- Nine octopus PNGs: crawling, settled, buoyant-leap, sleeping, smiling, surprised, waving, looking-left, looking-right. Saved octopus reference, built-in imagegen. Eight arms checked in every pose; missing arms corrected in crawling, settled and left view; right-view framing corrected.
- Existing smiling pose label preserved and mapped to resting-upright; new octopus-smiling uses joyful-smiling pose. Exact prompts/corrections in manifest.
- Cream/dark review, source/hash validation, core build and app insertion/reload/export checks passed. No known artwork issues.
- Commit: `feat(materials): S14 complete octopus variations (143/500)`. Push and verify origin/master.

## S13 artwork milestone — 134 assets

- Nine seasonal PNGs: snowman, decorated-fir, wrapped-present, easter-eggs, sakura-garland, koinobori, tanabata-bamboo, festival-fan, autumn-wreath. Bird style reference, built-in imagegen. Exact prompts and garland resolution correction saved.
- Reviewed on cream/dark backgrounds. Source/hash validation, shared-core build and app insertion/reload/export checks passed. No known artwork issues.
- Commit: `feat(materials): S13 seasonal illustrations (134/500)`. Push and verify origin/master.

## S12 artwork milestone — 125 assets

- Nine fish poses: hovering, resting-low, leaping, sleeping, smiling, surprised, fin-greeting, looking-left, looking-right. Saved fish identity reference, built-in imagegen; exact prompts in manifest. Existing swimming maps to cruising. Left-facing tail framing corrected.
- Reviewed on cream/dark backgrounds. Source/hash validation passed; shared-core compilation and app insertion/reload/export checks logged locally. No known artwork issues.
- Commit: `feat(materials): S12 complete fish variations (125/500)`. Push and verify origin/master.

## S11 artwork milestone — 116 assets

- Seven new buildings: school, library, bakery, bookshop, post-office, hospital, train-station. Built-in imagegen with bird style reference; exact prompts saved. Station regenerated to avoid clipped roof tips.
- Reviewed on cream/dark backgrounds. Packaging and source/hash validation passed. Shared-core build and app insertion/reload/export check recorded in local S11 logs.
- Commit: `feat(materials): S11 village buildings (116/500)`. Push and verify origin/master.
- User now requests continuous image work until session limit, compact prompts and minimal token use; engineering stays deferred.

## S10 artwork milestone — 109 assets

- Complete: nine new butterfly PNGs: butterfly-fluttering, butterfly-wings-folded, butterfly-taking-flight, butterfly-resting, butterfly-cheerful-flutter, butterfly-startled, butterfly-wing-greeting, butterfly-facing-left, butterfly-facing-right.
- Built-in image generator using the existing peach/lavender butterfly identity and painting-style reference. Exact prompts saved in `generation.json`.
- Existing `butterfly` keeps its `wings-open` pose and stable ID; `poseEquivalent` records perched/resting-open-wing (standing slot). The nine new species-specific poses fill walking, sitting, jumping, sleeping, smiling, surprised, waving, looking-left and looking-right respectively.
- Reviewed all ten on cream and dark blue backgrounds: consistent identity, full silhouettes, distinct poses and clean alpha. No known unresolved artwork issues.
- Packaging and source/hash/pose validation passed for all 109 assets. App check passed: 46 animal tiles, nine new insertions, reload persistence and PNG export. All ten butterfly search results and thumbnails checked. Shared Kotlin/JS and web production builds passed.
- Local review previews: `build/butterfly-review-fffaf0.png`, `build/butterfly-review-405d67.png`; exported app image: `build/s10-editor-export.png` (ignored).
- Deferred E01 packager only stages starter images locally; full generated derivatives were copied into ignored `web/public/materials/a` for app verification. No E01 source changes included.
- Commit: `feat(materials): S10 complete butterfly variations (109/500)`. Verify push against origin/master before reporting completion.
- Next: S11. Preserve E01 and Love Letter changes outside artwork commits.

## S09 artwork milestone — 100 assets

- Seven new background elements: sun, moon, rainbow, star-cluster, rolling-hills, mountain-range, winding-path. Built-in image generator using the bird painting-style reference. Exact prompts and framing corrections are recorded in `generation.json`.
- Rejected mountain/path attempts with external haze; regenerated clean transparent cutouts. Corrected the sun framing and rainbow/hills source dimensions. All accepted sources meet the alpha and minimum-resolution checks.
- Reviewed on light/dark backgrounds; packaging and source/hash validation passed for all 100 assets.
- App check passed: eight background tiles, seven new insertions, reload persistence and PNG export.
- Commit: `feat(materials): S09 background illustrations (100/500)`. Push to origin/master and verify remote HEAD before reporting completion.
- No S10 generation started. Next session begins with nine butterfly variants. Keep E01 and Love Letter changes outside artwork commits.

## S08 artwork milestone

- Eight new fruit illustrations: banana, strawberry, orange, pear, grapes, watermelon, cherries, peach. Built-in generator with apple style reference; exact prompts and banana transparency correction recorded.
- Reviewed on light/dark backgrounds; packaging and source/hash validation passed for 93.
- App check passed: nine food tiles, eight new insertions, reload persistence and PNG export.
- Commit: `feat(materials): S08 fruit illustrations (93/500)`. Verify remote in Git.

## S07 artwork milestone

- Ten new vehicle illustrations: car, bicycle, tricycle, train, tram, fire-engine, ambulance, tractor, sailboat, hot-air-balloon. Built-in image generator with bus painting-style reference; exact prompts and tractor framing correction recorded.
- Reviewed on light/dark backgrounds; packaging and source/hash validation passed for 85.
- App check passed: eleven vehicle tiles, ten new insertions, reload persistence and PNG export.
- Commit: `feat(materials): S07 vehicle illustrations (85/500)`. Verify remote in Git.

## S06 artwork milestone

- Ten new transparent story props: open-book, closed-book, backpack, basket, umbrella, teddy-bear, kite, ball, crayon-box, treasure-chest. Built-in generator using bird painting-style reference; exact prompts and open-book framing correction recorded.
- Reviewed on light/dark backgrounds; packaging and source/hash validation passed for 75.
- App check passed: eleven object tiles, ten new insertions, reload persistence and PNG export.
- Commit: `feat(materials): S06 story props (75/500)`. Verify remote in Git.

## S05 artwork milestone

- Eight new penguin poses complete its ten-image set. Existing standing/waving IDs unchanged. Built-in generator with saved penguin identity; exact prompts and smiling framing correction in manifest.
- Reviewed on light/dark backgrounds; source/hash/pose validation passed for 65 assets. App browsing, eight insertions, reload persistence and PNG export passed.
- Commit: `feat(materials): S05 complete penguin variations (65/500)`. Verify upstream in Git.

## S04 artwork milestone

- Nine new people PNGs: original child standing/walking/sitting; curly-haired child standing/walking/sitting/waving; child with glasses standing/walking.
- Built-in generator; original child as style reference, saved new identities used for their variants. Exact prompts and seated-child framing correction recorded.
- Reviewed on cream/dark backgrounds; packaging and source/hash validation passed for 57. App browsing, nine insertions, reload persistence and PNG export passed.
- Commit: `feat(materials): S04 children character poses (57/500)`. Verify remote in Git.

## S03 artwork milestone

- Added eight turtle PNGs: standing, sitting, jumping, smiling, surprised, waving, looking-left, looking-right. Existing walking and sleeping IDs preserved.
- Built-in image generator with `turtle` identity reference; exact prompts and waving anatomy correction in `generation.json`. Removed an extra leg before accepting waving.
- Reviewed all ten poses on cream/dark backgrounds. Source, pose and hash validation passed for 48 assets; app browsing, insertion, reload persistence and PNG export passed for eight new poses.
- Commit: `feat(materials): S03 complete turtle variations (48/500)`. Check remote against Git.

## S02 artwork milestone

- Ten accepted PNGs: `cherry-tree`, `pine-tree`, `palm-tree`, `apple-tree`, `sapling`, `sunflower`, `tulips`, `daisies`, `rose-bush`, `fern`. Built-in image generator; bird style reference; exact prompts and sunflower framing correction in `generation.json`.
- Reviewed on cream and dark blue backgrounds; corrected clipped sunflower framing. Packaging and source/hash validation passed for 40 assets.
- User explicitly requested continuous artwork work across milestones; proceed without another confirmation. Engineering remains deferred.
- App smoke check passed: eleven nature tiles, ten new assets inserted, persisted after reload and exported to PNG.
- Commit: `feat(materials): S02 nature illustrations (40/500)`. Remote delivery is verified against Git.

## S01 artwork milestone

- Complete bird set: added `bird-walking`, `bird-sitting`, `bird-sleeping`, `bird-smiling`, `bird-surprised`, `bird-waving`, `bird-looking-left`, `bird-looking-right`.
- All eight use `bird` as the identity/style reference and the built-in image generator. Exact prompts are saved in `generation.json`.
- Existing `bird-flying` fills the jumping/airborne slot; its stable ID and flying pose label remain unchanged, with equivalence recorded in source metadata.
- Reviewed all ten bird images on cream and dark blue backgrounds for consistent identity, full silhouettes and alpha edges. No unresolved artwork issues; no mirrored or recolored copies counted.
- Packaging and source/hash/pose validation passed for all 30 assets. Review previews: `build/bird-review-fffaf0.png` and `build/bird-review-405d67.png` (ignored).
- App smoke check passed: ten searchable birds, all eight new poses inserted and persisted after reload, and 2048px PNG export.
- Artwork commit: `feat(materials): S01 complete bird variations (30/500)`. Verify delivery from Git history and upstream; exclude all E01 and Love Letter changes.

## Verified foundation

- Shared JVM tests, JS Node tests and production Kotlin/JS compilation passed.
- Web production build passed; existing bundle-size warning remains.
- Four material browser tests passed: browsing/search/save/reopen; category filtering; retired-instance replacement and undo; full-resolution PNG export and failure handling. Earlier targeted editor/painter/clipboard/drawing checks also passed.
- Native simulator build and all 13 `ScenePainterTests` passed after the migration picker changes.
- The 22 paintings were reviewed together and inside the web editor. Masters have real alpha and packaged transparent borders.
- Current local logs: `build/materials-final-shared.log`, `build/materials-final-web.log`, `build/materials-final-browser.log`, `build/materials-final-ios.log`. Build files are ignored and may not exist in another checkout.
- Local review images: `shared/build/materials/contact-sheet.png`, `shared/build/materials/studio-review.png`. These are previews, not additional library assets.

Useful commands from repository root:

```sh
pnpm --dir backend materials
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :shared:jvmTest :shared:jsNodeTest :shared:jsBrowserProductionLibraryDistribution
node tools/stage-web-core.mjs
pnpm --dir web build
pnpm --dir web exec playwright test tests/materials.spec.ts --reporter=line
xcodegen generate --spec iosApp/project.yml
xcodebuild -project iosApp/Ehon.xcodeproj -scheme Ehon -sdk iphonesimulator CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:EhonTests/ScenePainterTests test
```

Use appropriate installed Java/simulator versions on other machines. Run relevant checks rather than repeating the entire suite for every artwork-only batch.

## Git and delivery

- Intended remote: `origin`, `git@github.com:kikman-git/ehon-maker.git`; current branch: `master`.
- User explicitly requested **commit and push on every milestone**. This authorization persists across sessions. A completed artwork batch or engineering checkpoint is a milestone; partial work gets a clearly labeled partial checkpoint.
- M00 is the verified foundation plus this session plan. Use `git log` and the remote branch to determine the actual commit/push state; do not infer successful delivery from this file alone.
- No web/native release deployment has been performed for this rebuild. A Git push does not establish deployment.
- Preserve the unrelated, pre-existing modifications under `shared/templates/love-letter/`, including `art/lonely-grass.svg`. They are excluded from the material milestone commit.
- Do not force-push, include unrelated changes, or commit videos/GIF recordings.

## Replace this section after every session

Record:

1. Session ID and whether complete or partial.
2. Actual accepted total and category/character counts.
3. Accepted asset IDs, references used and any pose equivalents.
4. Exact unfinished subjects/poses and known quality issues.
5. Checks performed and their results.
6. Next pending session or partial batch.
7. Commit message and push outcome, or the remaining push blocker. Git history supplies the current commit hash without self-referential documentation edits.
