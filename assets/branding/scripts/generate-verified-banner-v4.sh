#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BRANDING_DIR="$ROOT_DIR/assets/branding"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lucky-v4-XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

FONT_BOLD="/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR="/System/Library/Fonts/Supplemental/Arial.ttf"
MARK_SRC="$BRANDING_DIR/lucky-mark-neon.png"
WORDMARK_SRC="$BRANDING_DIR/lucky-wordmark-neon.png"
OUT_A="$BRANDING_DIR/lucky-verified-banner-v4a.png"
OUT_B="$BRANDING_DIR/lucky-verified-banner-v4b.png"
OUT_WINNER="$BRANDING_DIR/lucky-verified-banner-v4.png"

if [[ ! -f "$FONT_BOLD" || ! -f "$FONT_REGULAR" ]]; then
  echo "Required system fonts not found." >&2
  exit 1
fi

if [[ ! -f "$MARK_SRC" || ! -f "$WORDMARK_SRC" ]]; then
  echo "Canonical branding assets are missing." >&2
  exit 1
fi

render_line() {
  local text="$1"
  local start_size="$2"
  local max_width="$3"
  local out="$4"
  local size="$start_size"

  while true; do
    magick -background none \
      -font "$FONT_BOLD" \
      -fill '#FBF8FF' \
      -pointsize "$size" \
      label:"$text" \
      "$out"

    magick "$out" -trim +repage "$out"

    local width
    width="$(identify -format '%w' "$out")"

    if [[ "$width" -le "$max_width" || "$size" -le 44 ]]; then
      break
    fi

    size=$((size - 2))
  done
}

create_background() {
  local variant="$1"
  local out="$2"

  if [[ "$variant" == "a" ]]; then
    magick -size 1200x675 canvas:'#0B0018' \
      \( -size 1200x675 radial-gradient:'rgba(178,81,255,0.45)-rgba(11,0,24,0)' \) \
      -gravity center -compose screen -composite \
      \( -size 1200x675 radial-gradient:'rgba(255,88,228,0.18)-rgba(11,0,24,0)' \) \
      -gravity west -geometry +0+30 -compose screen -composite \
      -fill 'rgba(33,3,59,0.88)' \
      -stroke 'rgba(255,198,110,0.25)' \
      -strokewidth 2 \
      -draw 'roundrectangle 120,68 1080,608 28,28' \
      "$out"
  else
    magick -size 1200x675 canvas:'#120127' \
      \( -size 1200x675 radial-gradient:'rgba(178,81,255,0.38)-rgba(11,0,24,0)' \) \
      -gravity northeast -geometry +40+20 -compose screen -composite \
      \( -size 1200x675 radial-gradient:'rgba(255,88,228,0.15)-rgba(11,0,24,0)' \) \
      -gravity southwest -geometry +0+40 -compose screen -composite \
      -fill 'rgba(33,3,59,0.86)' \
      -stroke 'rgba(255,198,110,0.22)' \
      -strokewidth 2 \
      -draw 'roundrectangle 120,68 1080,608 28,28' \
      "$out"
  fi
}

compose_variant() {
  local variant="$1"
  local out="$2"
  local base="$TMP_DIR/base-${variant}.png"
  local line1="$TMP_DIR/line1-${variant}.png"
  local line2="$TMP_DIR/line2-${variant}.png"
  local mark_main="$TMP_DIR/mark-main-${variant}.png"
  local mark_small="$TMP_DIR/mark-small-${variant}.png"
  local wordmark="$TMP_DIR/wordmark-${variant}.png"
  local badge_text="$TMP_DIR/badge-text-${variant}.png"

  create_background "$variant" "$base"
  render_line 'Lucky is now a' 82 560 "$line1"
  render_line 'Verified Discord Bot' 112 800 "$line2"

  magick "$MARK_SRC" -resize 84x84 "$mark_main"
  magick "$MARK_SRC" -resize 34x34 "$mark_small"
  magick "$WORDMARK_SRC" -resize x104 "$wordmark"
  magick -background none \
    -font "$FONT_BOLD" \
    -fill '#FFC66E' \
    -pointsize 42 \
    label:'VERIFIED' \
    "$badge_text"
  magick "$badge_text" -trim +repage "$badge_text"

  local line1_h line2_h
  line1_h="$(identify -format '%h' "$line1")"
  line2_h="$(identify -format '%h' "$line2")"

  local line1_y line2_y
  if [[ "$variant" == "a" ]]; then
    line1_y=266
    line2_y=$((line1_y + line1_h + 26))
  else
    line1_y=280
    line2_y=$((line1_y + line1_h + 30))
  fi

  magick "$base" \
    \( "$mark_main" \) -geometry +168+102 -compose over -composite \
    \( "$wordmark" \) -geometry +282+95 -compose over -composite \
    -fill 'rgba(18,1,39,0.88)' \
    -stroke 'rgba(255,88,228,0.95)' \
    -strokewidth 2 \
    -draw 'roundrectangle 760,89 1050,145 28,28' \
    \( "$badge_text" \) -geometry +842+102 -compose over -composite \
    \( "$line1" \) -geometry +175+"$line1_y" -compose over -composite \
    \( "$line2" \) -geometry +175+"$line2_y" -compose over -composite \
    \( "$mark_small" \) -geometry +994+540 -compose over -composite \
    "$out"
}

compose_variant a "$OUT_A"
compose_variant b "$OUT_B"
cp "$OUT_B" "$OUT_WINNER"

identify "$OUT_A" "$OUT_B" "$OUT_WINNER"
echo "Generated: $OUT_A"
echo "Generated: $OUT_B"
echo "Winner: $OUT_WINNER"
