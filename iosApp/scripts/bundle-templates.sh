#!/bin/bash
# Copies the story templates Gradle assembled into shared/build/templates (build-shared-framework.sh
# adds :shared:assembleTemplates to a Debug build) into the app bundle as templates/, so the
# templates screen reads them without the assets Worker (decision #61). A Release build carries
# none and fetches the published index at launch (decision #60).
set -euo pipefail

if [[ "${CONFIGURATION:-Debug}" == "Release" ]]; then
  exit 0
fi

if [[ -n "${SRCROOT:-}" ]]; then
  REPO_ROOT="$(cd "$SRCROOT/.." && pwd)"
else
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
SOURCE="$REPO_ROOT/shared/build/templates"
DEST="${TARGET_BUILD_DIR:?}/${UNLOCALIZED_RESOURCES_FOLDER_PATH:?}/templates"

if [[ ! -f "$SOURCE/index.json" ]]; then
  echo "warning: $SOURCE has no index.json (run ./gradlew :shared:assembleTemplates); the app will fetch the published templates instead" >&2
  rm -rf "$DEST"
  exit 0
fi

mkdir -p "$DEST"
rsync -a --delete --include='*.json' --exclude='*' "$SOURCE/" "$DEST/"
echo "bundled $(find "$DEST" -name '*.ehon.json' | wc -l | tr -d ' ') story templates -> $DEST"
