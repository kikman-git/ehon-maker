# 素材 library handoff

Updated: 2026-10-26. Repository: `/Users/Phat/Personal/ehon-maker`.

## Current state

- **22 accepted PNGs / 500 target; 478 remaining.** No additional images were generated in the planning session.
- Animals: 13 images across the requested 10 species. Bird, turtle and penguin have 2 poses each; the other 7 species have 1 each.
- Each of the other nine categories has 1 image: tree, child, lantern, bus, apple, cottage, cloud, forest scene, pumpkin.
- All originals are in `masters/`. Exact prompts, references and metadata are in `generation.json`. `catalog.json` and shared `StorybookMaterials.kt` are generated outputs.
- Style is the user's latest direction: less realistic, more painterly picture book. Keep the saved art-direction refinement. Reference `masters/bird.png` for the world style and the corresponding saved character master for variants.
- The catalog is currently bundled. Remote catalog expansion and on-demand delivery are planned, not implemented.
- Old procedural catalog artwork has been removed. Twelve legacy IDs resolve to new paintings. Other retired instances have a visible replacement picker in web/native editors, preserving geometry, drawing edits and undo.
- Web PNG export now loads full-resolution masters and reports failed image loads.

## Next session

**E01 — delivery and progress infrastructure**, as defined in `SESSION_PLAN.md`. Complete that package only, update this handoff, then commit and push. Artwork S01 follows E01 and adds the bird's 8 remaining variations for 30 total assets.

Before generating, inspect existing bird and flying-bird artwork and explicitly map the flying image to the airborne/jumping slot. Keep their IDs stable. Do not regenerate existing approved poses merely to rename them.

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
