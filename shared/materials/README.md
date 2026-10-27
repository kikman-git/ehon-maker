# Painterly storybook 素材

For multi-session work, start with [SESSION_PLAN.md](SESSION_PLAN.md) and [HANDOFF.md](HANDOFF.md). The full target is 500 distinct illustrations. The user requires a commit and push at each milestone.

The library now contains 146 AI-generated raster illustrations across ten categories (29.2% of 500). Bird, butterfly, fish, octopus, turtle and penguin each have all 10 poses. The visual direction is loose, playful gouache with broad brushwork, simple expressive faces and soft volume. The earlier naturalistic drafts are not part of this library.

`masters/` contains the selected original transparent PNGs from the built-in image generation tool. `generation.json` records the exact prompts, the user's master prompt, the less-realistic refinement, character families, pose labels, bilingual names, search tags and reference relationships. `catalog.json` and `StorybookMaterials.kt` are generated from those sources.

From the repository root, run:

```sh
pnpm --dir backend materials
make web-core
pnpm --dir web build
```

The packaging step validates real alpha, preserves proportions, adds transparent placement margins, and writes 1536px PNG masters plus 1024px and 256px WebP derivatives. Every packaged master is addressed by its SHA-256. Assets are staged into `shared/build/materials/` and `web/public/materials/`. Web builds include these files and load them without Firebase. Native builds package the same files in both Debug and Release; the normal asset loader checks the bundle before cloud storage. User-uploaded illustrations keep their existing Firestore/R2 path.

To expand the collection:

1. Use the master prompt **and** the art-direction refinement from `generation.json`, with `masters/bird.png` as the visual reference. For a character variation, reference that character's master instead.
2. Generate one isolated subject per image with actual transparent alpha. Reject realistic microdetail, glossy eyes, clipped limbs, incorrect anatomy, halos, flat vector shapes and opaque backgrounds.
3. Inspect the image over both light and colored backgrounds. Add the selected PNG to `masters/` and add metadata and the exact prompt to `generation.json`. Use a new stable ID for each pose and preserve its `characterId`.
4. Run the packaging command, rebuild the shared core, and verify browsing, placement, save/reopen and rendering. Commit source images, metadata and generated catalog code together. Never draw replacement artwork with procedural code.

The 56-item procedural starter catalog has been removed. The ten original animal IDs and tree/cloud IDs resolve to the new paintings. Other retired IDs remain in saved document data but no longer resolve to the old icons. Web and native editors show a notice and a replacement picker for these instances. Replacing an instance preserves its position, size, rotation, drawing edits and layer order, and is undoable. Embedded artwork and personal uploads belong to their documents/accounts and are not rewritten by this catalog migration.

This is a bundled catalog release. Publishing the updated web app or native build is required to make it available to existing installations; no live database rewrite is needed.
