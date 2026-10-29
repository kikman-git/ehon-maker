#!/bin/bash
set -euo pipefail
REPO_ROOT="$(cd "${SRCROOT:?}/.." && pwd)"
SOURCE="$REPO_ROOT/shared/build/materials-bundle"
DEST="${TARGET_BUILD_DIR:?}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}/materials"
test -f "$SOURCE/index.json" || { echo 'error: Run pnpm --dir backend materials before building.' >&2; exit 1; }
mkdir -p "$DEST"
rsync -a --delete "$SOURCE/" "$DEST/"
