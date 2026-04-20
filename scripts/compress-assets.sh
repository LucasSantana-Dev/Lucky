#!/usr/bin/env bash
set -euo pipefail

# Compress all PNG / SVG assets under a target directory and emit
# .webp siblings for PNG/JPG sources. Lossless by default.
#
# Usage: scripts/compress-assets.sh [ASSET_DIR]
#   ASSET_DIR defaults to "assets" relative to the repo root.
#
# Pipeline:
#   PNG  -> oxipng -o max --strip safe --alpha (lossless)
#   SVG  -> svgo --multipass
#   JPG  -> mozjpeg/jpegoptim fallback via ImageMagick -strip -quality 85
#   *    -> also emit .webp via cwebp -q 85 -m 6 -mt
#
# Skips: .DS_Store, already-compressed .webp, animated .gif (kept as-is).

ASSET_DIR="${1:-assets}"
if [[ ! -d "$ASSET_DIR" ]]; then
  echo "error: '$ASSET_DIR' is not a directory" >&2
  exit 1
fi

have() { command -v "$1" >/dev/null 2>&1; }
for bin in oxipng svgo cwebp magick; do
  have "$bin" || { echo "error: missing '$bin' — brew install oxipng svgo webp imagemagick" >&2; exit 1; }
done

PNG_BEFORE=0; PNG_AFTER=0; PNG_COUNT=0
SVG_BEFORE=0; SVG_AFTER=0; SVG_COUNT=0
JPG_BEFORE=0; JPG_AFTER=0; JPG_COUNT=0
WEBP_COUNT=0; WEBP_TOTAL=0

bytes() { wc -c <"$1" | tr -d ' '; }

echo "▶ scanning $ASSET_DIR"

while IFS= read -r -d '' file; do
  case "$(basename "$file")" in .DS_Store) rm -f "$file"; continue;; esac

  ext="${file##*.}"
  lc_ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"

  case "$lc_ext" in
    png)
      before=$(bytes "$file")
      oxipng -o max --strip safe --alpha --quiet "$file" || true
      after=$(bytes "$file")
      PNG_BEFORE=$((PNG_BEFORE + before))
      PNG_AFTER=$((PNG_AFTER + after))
      PNG_COUNT=$((PNG_COUNT + 1))
      printf '  png  %6d → %6d bytes  %s\n' "$before" "$after" "$file"

      webp="${file%.*}.webp"
      cwebp -quiet -q 85 -m 6 -mt "$file" -o "$webp"
      wsize=$(bytes "$webp")
      WEBP_COUNT=$((WEBP_COUNT + 1))
      WEBP_TOTAL=$((WEBP_TOTAL + wsize))
      ;;

    svg)
      before=$(bytes "$file")
      svgo --multipass --quiet "$file" >/dev/null 2>&1 || svgo --multipass "$file" >/dev/null
      after=$(bytes "$file")
      SVG_BEFORE=$((SVG_BEFORE + before))
      SVG_AFTER=$((SVG_AFTER + after))
      SVG_COUNT=$((SVG_COUNT + 1))
      printf '  svg  %6d → %6d bytes  %s\n' "$before" "$after" "$file"
      ;;

    jpg|jpeg)
      before=$(bytes "$file")
      tmp="${file}.tmp.jpg"
      magick "$file" -strip -interlace Plane -sampling-factor 4:2:0 -quality 85 "$tmp"
      if [[ $(bytes "$tmp") -lt "$before" ]]; then mv "$tmp" "$file"; else rm -f "$tmp"; fi
      after=$(bytes "$file")
      JPG_BEFORE=$((JPG_BEFORE + before))
      JPG_AFTER=$((JPG_AFTER + after))
      JPG_COUNT=$((JPG_COUNT + 1))
      printf '  jpg  %6d → %6d bytes  %s\n' "$before" "$after" "$file"

      webp="${file%.*}.webp"
      cwebp -quiet -q 85 -m 6 -mt "$file" -o "$webp"
      wsize=$(bytes "$webp")
      WEBP_COUNT=$((WEBP_COUNT + 1))
      WEBP_TOTAL=$((WEBP_TOTAL + wsize))
      ;;

    webp|gif|pbm)
      : # keep as-is
      ;;
  esac
done < <(find "$ASSET_DIR" -type f -print0)

echo
echo "── summary ──"
printf 'PNG : %2d files  %7d → %7d bytes  (−%d)\n' "$PNG_COUNT" "$PNG_BEFORE" "$PNG_AFTER" "$((PNG_BEFORE - PNG_AFTER))"
printf 'SVG : %2d files  %7d → %7d bytes  (−%d)\n' "$SVG_COUNT" "$SVG_BEFORE" "$SVG_AFTER" "$((SVG_BEFORE - SVG_AFTER))"
printf 'JPG : %2d files  %7d → %7d bytes  (−%d)\n' "$JPG_COUNT" "$JPG_BEFORE" "$JPG_AFTER" "$((JPG_BEFORE - JPG_AFTER))"
printf 'WEBP: %2d files  %7d bytes (new)\n' "$WEBP_COUNT" "$WEBP_TOTAL"
