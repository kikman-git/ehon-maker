# 素材 library handoff

Updated: 2026-10-26. Repository: `/Users/Phat/Personal/ehon-maker`.

## Current state

- **40 accepted PNGs / 500 target; 460 remaining.** S01 adds eight bird illustrations; S02 adds ten nature paintings.
- Animals: 21 images across the requested 10 species. Bird has 10 poses, turtle and penguin have 2 each; the other 7 species have 1 each.
- Nature has 11 images. Each remaining category has 1: child, lantern, bus, apple, cottage, cloud, forest scene, pumpkin.
- All originals are in `masters/`. Exact prompts, references and metadata are in `generation.json`. `catalog.json` and shared `StorybookMaterials.kt` are generated outputs.
- Style is the user's latest direction: less realistic, more painterly picture book. Keep the saved art-direction refinement. Reference `masters/bird.png` for the world style and the corresponding saved character master for variants.
- The committed foundation uses bundled delivery. Local E01 delivery changes are unfinished and uncommitted; no remote publication or deployment has occurred.
- Old procedural catalog artwork has been removed. Twelve legacy IDs resolve to new paintings. Other retired instances have a visible replacement picker in web/native editors, preserving geometry, drawing edits and undo.
- Web PNG export now loads full-resolution masters and reports failed image loads.

## Next session

**S03 — Turtle:** eight remaining poses: standing, sitting, jumping, smiling, surprised, waving, looking-left, looking-right. Existing walking and sleeping images retain their IDs. Target total: 48.

The user explicitly requested image assets and stopped unsolicited engineering work. E01 is deferred; preserve its uncommitted changes and do not resume code fixes unless requested.

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
