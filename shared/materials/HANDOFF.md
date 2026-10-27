# 素材 library handoff

Updated: 2026-10-27. Repository: `/Users/Phat/Personal/ehon-maker`.

## Current state

- **93 accepted PNGs / 500 target; 407 remaining.** S01 adds eight bird illustrations; S02 adds ten nature paintings.
- Animals: 37 images across the requested 10 species. Bird, turtle and penguin each have 10 poses; the other 7 species have 1 each.
- Nature has 11 images. People has 10 poses across 3 children (4 original, 4 curly-haired, 2 with glasses). Objects and vehicles each have 11 images. Food has 9 images. Each remaining category has 1: cottage, cloud, forest scene, pumpkin.
- All originals are in `masters/`. Exact prompts, references and metadata are in `generation.json`. `catalog.json` and shared `StorybookMaterials.kt` are generated outputs.
- Style is the user's latest direction: less realistic, more painterly picture book. Keep the saved art-direction refinement. Reference `masters/bird.png` for the world style and the corresponding saved character master for variants.
- The committed foundation uses bundled delivery. Local E01 delivery changes are unfinished and uncommitted; no remote publication or deployment has occurred.
- Old procedural catalog artwork has been removed. Twelve legacy IDs resolve to new paintings. Other retired instances have a visible replacement picker in web/native editors, preserving geometry, drawing edits and undo.
- Web PNG export now loads full-resolution masters and reports failed image loads.

## Next session

**S09 — Background elements A:** sun, moon, rainbow, star-cluster, rolling-hills, mountain-range, winding-path. Seven new paintings; target total 100.

The user explicitly requested image assets and stopped unsolicited engineering work. E01 is deferred; preserve its uncommitted changes and do not resume code fixes unless requested.

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
