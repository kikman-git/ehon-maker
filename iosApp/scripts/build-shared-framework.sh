#!/bin/bash
# Builds the shared KMP framework for every architecture Xcode is asking for and stages a
# single fat framework at the stable path FRAMEWORK_SEARCH_PATHS points to.
#
# The stock `embedAndSignAppleFrameworkForXcode` task targets dynamic frameworks; EhonCore
# is static (see shared/build.gradle.kts), so there is nothing to embed or sign and a plain
# link is simpler. But Xcode runs a script phase ONCE for all of ARCHS, so building a
# single-arch framework fails to link whenever ARCHS holds more than one entry — or holds
# one this host does not link (an Intel Mac can report arm64 in ARCHS while linking x86_64).
set -euo pipefail

# Xcode build phases do not inherit a login shell, so JAVA_HOME must be explicit.
if [[ -z "${JAVA_HOME:-}" ]]; then
  for candidate in /usr/local/opt/openjdk@21 /opt/homebrew/opt/openjdk@21 \
                   /usr/local/opt/openjdk /opt/homebrew/opt/openjdk; do
    [[ -x "$candidate/bin/java" ]] && export JAVA_HOME="$candidate" && break
  done
fi
if [[ -z "${JAVA_HOME:-}" ]]; then
  echo "error: no JDK found. Install one with: brew install openjdk@21" >&2
  exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"

SDK="${SDK_NAME:-iphonesimulator}"
# On a simulator build Xcode may list both slices; cover all of them.
ARCH_LIST="${ARCHS:-x86_64 arm64}"

# Debug Kotlin/Native runs several times slower than Release, visibly so on a phone, so a
# device build always gets the optimised framework; simulator Debug keeps the fast link.
# EHON_KN_DEBUG=1 opts out when Kotlin itself needs debugging on a device.
if [[ "${CONFIGURATION:-Debug}" == "Release" || ( "$SDK" == iphoneos* && "${EHON_KN_DEBUG:-0}" != "1" ) ]]; then
  KN_CONFIG=Release; KN_DIR=releaseFramework
else
  KN_CONFIG=Debug;   KN_DIR=debugFramework
fi

# Xcode sets SRCROOT to the directory holding the .xcodeproj; fall back to this file's
# location so the script also works when run by hand.
if [[ -n "${SRCROOT:-}" ]]; then
  REPO_ROOT="$(cd "$SRCROOT/.." && pwd)"
else
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
cd "$REPO_ROOT"

kn_target_for_arch() {
  case "$SDK" in
    iphonesimulator*)
      case "$1" in
        arm64)  echo iosSimulatorArm64 ;;
        x86_64) echo iosX64 ;;
        *) echo "error: unsupported simulator arch '$1'" >&2; return 1 ;;
      esac ;;
    iphoneos*)
      case "$1" in
        arm64) echo iosArm64 ;;
        *) echo "error: unsupported device arch '$1'" >&2; return 1 ;;
      esac ;;
    *) echo "error: unsupported SDK '$SDK'" >&2; return 1 ;;
  esac
}

GRADLE_TASKS=()
SLICE_DIRS=()
for arch in $ARCH_LIST; do
  target="$(kn_target_for_arch "$arch")"
  capitalised="$(echo "${target:0:1}" | tr '[:lower:]' '[:upper:]')${target:1}"
  GRADLE_TASKS+=(":shared:link${KN_CONFIG}Framework${capitalised}")
  SLICE_DIRS+=("$REPO_ROOT/shared/build/bin/$target/$KN_DIR")
done

./gradlew "${GRADLE_TASKS[@]}"

DEST="$REPO_ROOT/shared/build/xcode-frameworks/${CONFIGURATION:-Debug}/$SDK"
mkdir -p "$DEST"

# Take the first slice whole (headers, modulemap, Info.plist), then replace its binary
# with a fat one if more than one architecture was requested.
rsync -a --delete "${SLICE_DIRS[0]}/EhonCore.framework" "$DEST/"

if (( ${#SLICE_DIRS[@]} > 1 )); then
  BINARIES=()
  for dir in "${SLICE_DIRS[@]}"; do BINARIES+=("$dir/EhonCore.framework/EhonCore"); done
  lipo -create "${BINARIES[@]}" -output "$DEST/EhonCore.framework/EhonCore"
fi

echo "staged EhonCore.framework [$ARCH_LIST / $KN_CONFIG] -> $DEST"
lipo -archs "$DEST/EhonCore.framework/EhonCore"
