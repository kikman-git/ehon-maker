#!/bin/bash
# Builds the bundled font set (decision #10).
#
#   Zen Maru Gothic  UI chrome only -> subset to the glyphs shipped strings actually use.
#                    You own every one of them, so this is safe and enormous: ~14MB -> ~1MB.
#   Yomogi           book body text -> shipped COMPLETE. A child types arbitrary text into
#                    it, and a subset body font would fall back mid-sentence, switching from
#                    handwriting to gothic inside a word. Worse than large.
#   Caprasimo        logo only, Latin, already tiny.
#
# Sources are the upstream Google Fonts releases, kept in tools/fonts-src/ and not committed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/tools/fonts-src"
OUT="$REPO_ROOT/iosApp/Ehon/Fonts"
TEXT="$REPO_ROOT/shared/build/shipped-text.txt"

command -v pyftsubset >/dev/null || {
  echo "error: pyftsubset not found. Install with: python3 -m pip install fonttools brotli" >&2
  exit 1
}
[[ -f "$TEXT" ]] || {
  echo "error: $TEXT missing. Run ./gradlew :shared:dumpShippedText first." >&2
  exit 1
}

mkdir -p "$OUT"

subset() {
  local file="$1"
  pyftsubset "$SRC/$file" \
    --text-file="$TEXT" \
    --output-file="$OUT/$file" \
    --layout-features='kern,liga,vert,vrt2,palt,halt' \
    --no-hinting --desubroutinize \
    --name-IDs='*' --name-legacy --name-languages='*'
  printf "  %-32s %6s -> %6s\n" "$file" \
    "$(du -h "$SRC/$file" | cut -f1)" "$(du -h "$OUT/$file" | cut -f1)"
}

echo "subsetting UI font to shipped strings:"
for weight in Regular Medium Bold Black; do
  subset "ZenMaruGothic-$weight.ttf"
done

echo "copying complete body + display faces:"
for whole in Yomogi-Regular.ttf Caprasimo-Regular.ttf; do
  cp "$SRC/$whole" "$OUT/$whole"
  printf "  %-32s %6s (complete)\n" "$whole" "$(du -h "$OUT/$whole" | cut -f1)"
done

echo
echo "verifying glyph coverage:"
python3 - "$OUT" "$TEXT" <<'PY'
import sys, glob, os
from fontTools.ttLib import TTFont

out_dir, text_file = sys.argv[1], sys.argv[2]
needed = set(open(text_file, encoding="utf-8").read()) - set("\n")

failed = False
for path in sorted(glob.glob(os.path.join(out_dir, "ZenMaruGothic-*.ttf"))):
    font = TTFont(path, lazy=True)
    have = set()
    for table in font["cmap"].tables:
        have |= {chr(cp) for cp in table.cmap}
    missing = sorted(needed - have)
    font.close()
    name = os.path.basename(path)
    if missing:
        failed = True
        print(f"  FAIL {name}: {len(missing)} glyphs missing -> {''.join(missing[:40])}")
    else:
        print(f"  ok   {name}: all {len(needed)} shipped glyphs present")

if failed:
    # This is the failure mode that ships silently: a forgotten re-run after adding a
    # string leaves tofu in the UI, and nothing else in the build notices.
    print("\nerror: the UI font is missing glyphs the app can render.", file=sys.stderr)
    sys.exit(1)
PY

echo
echo "bundled total: $(du -sh "$OUT" | cut -f1)"
