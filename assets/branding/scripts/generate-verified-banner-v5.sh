#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BRANDING_DIR="$ROOT_DIR/assets/branding"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lucky-v5-XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

FONT_HEAD="/System/Library/Fonts/HelveticaNeue.ttc"
FONT_SUB="/System/Library/Fonts/Supplemental/GillSans.ttc"
FONT_CHIP="/System/Library/Fonts/HelveticaNeue.ttc"
MARK_SRC="$BRANDING_DIR/lucky-mark-neon.png"
WORDMARK_SRC="$BRANDING_DIR/lucky-wordmark-neon.png"
AI_BG_A="$BRANDING_DIR/lucky-verified-ai-bg-v5a.png"
AI_BG_B="$BRANDING_DIR/lucky-verified-ai-bg-v5b.png"
OUT_A="$BRANDING_DIR/lucky-verified-banner-v5a.png"
OUT_B="$BRANDING_DIR/lucky-verified-banner-v5b.png"
OUT_WINNER="$BRANDING_DIR/lucky-verified-banner-v5.png"

if [[ ! -f "$FONT_HEAD" || ! -f "$FONT_SUB" || ! -f "$FONT_CHIP" ]]; then
  echo "Required system fonts not found." >&2
  exit 1
fi

if [[ ! -f "$MARK_SRC" || ! -f "$WORDMARK_SRC" ]]; then
  echo "Canonical branding assets are missing." >&2
  exit 1
fi

render_text() {
  local text="$1"
  local start_size="$2"
  local max_width="$3"
  local font="$4"
  local fill="$5"
  local weight="$6"
  local out="$7"
  local size="$start_size"

  while true; do
    magick -background none \
      -font "$font" \
      -fill "$fill" \
      -weight "$weight" \
      -pointsize "$size" \
      label:"$text" \
      "$out"

    magick "$out" -trim +repage "$out"

    local width
    width="$(identify -format '%w' "$out")"

    if [[ "$width" -le "$max_width" || "$size" -le 40 ]]; then
      break
    fi

    size=$((size - 2))
  done
}

create_deterministic_background() {
  local variant="$1"
  local out="$2"

  if [[ "$variant" == "a" ]]; then
    magick -size 1200x675 canvas:'#0B0018' \
      \( -size 1200x675 radial-gradient:'rgba(178,81,255,0.34)-rgba(11,0,24,0)' \) \
      -gravity northwest -geometry -120-170 -compose screen -composite \
      \( -size 1200x675 radial-gradient:'rgba(255,88,228,0.18)-rgba(11,0,24,0)' \) \
      -gravity southeast -geometry +80+70 -compose screen -composite \
      \( -size 1200x675 radial-gradient:'rgba(255,198,110,0.09)-rgba(11,0,24,0)' \) \
      -gravity east -geometry +90-120 -compose screen -composite \
      -fill 'rgba(178,81,255,0.13)' \
      -draw 'polygon 0,532 1200,342 1200,402 0,592' \
      "$out"
  else
    magick -size 1200x675 canvas:'#120127' \
      \( -size 1200x675 radial-gradient:'rgba(178,81,255,0.30)-rgba(11,0,24,0)' \) \
      -gravity northeast -geometry +190-160 -compose screen -composite \
      \( -size 1200x675 radial-gradient:'rgba(255,88,228,0.16)-rgba(11,0,24,0)' \) \
      -gravity southwest -geometry -120+180 -compose screen -composite \
      \( -size 1200x675 radial-gradient:'rgba(255,198,110,0.08)-rgba(11,0,24,0)' \) \
      -gravity west -geometry -180-70 -compose screen -composite \
      -fill 'rgba(255,88,228,0.10)' \
      -draw 'polygon 0,412 1200,258 1200,318 0,472' \
      "$out"
  fi

  magick "$out" -attenuate 0.035 +noise Multiplicative "$out"
}

create_background() {
  local variant="$1"
  local out="$2"
  local ai_source="$AI_BG_A"

  if [[ "$variant" == "b" ]]; then
    ai_source="$AI_BG_B"
  fi

  if [[ -f "$ai_source" ]]; then
    magick "$ai_source" -resize 1200x675^ -gravity center -extent 1200x675 "$out"
    magick "$out" -attenuate 0.018 +noise Multiplicative "$out"
    return
  fi

  create_deterministic_background "$variant" "$out"
}

compose_variant() {
  local variant="$1"
  local out="$2"
  local base="$TMP_DIR/base-${variant}.png"
  local line1="$TMP_DIR/line1-${variant}.png"
  local line2="$TMP_DIR/line2-${variant}.png"
  local mark_main="$TMP_DIR/mark-main-${variant}.png"
  local wordmark="$TMP_DIR/wordmark-${variant}.png"
  local chip_text="$TMP_DIR/chip-text-${variant}.png"
  local chip_icon="$TMP_DIR/chip-icon-${variant}.png"
  local discord_logo="$TMP_DIR/discord-logo-${variant}.png"

  create_background "$variant" "$base"
  render_text 'Lucky is now a' 70 510 "$FONT_SUB" '#D9C8F3' 500 "$line1"
  render_text 'Verified Discord Bot' 92 720 "$FONT_HEAD" '#FBF8FF' 700 "$line2"
  render_text 'Verified' 34 150 "$FONT_CHIP" '#FBF8FF' 700 "$chip_text"

  magick "$MARK_SRC" -resize 82x82 "$mark_main"
  magick "$WORDMARK_SRC" -resize x98 "$wordmark"
  magick -size 22x22 canvas:none \
    -fill '#5865F2' -stroke none \
    -draw 'roundrectangle 2,6 20,17 6,6' \
    -draw 'polygon 7,17 9,17 8,20' \
    -draw 'polygon 13,17 15,17 14,20' \
    -fill '#FBF8FF' \
    -draw 'circle 8,12 8,10.6' \
    -draw 'circle 14,12 14,10.6' \
    -stroke '#FBF8FF' -strokewidth 1.3 -fill none \
    -draw 'arc 7,10 15,16 210,332' \
    "$discord_logo"

  magick -size 14x14 canvas:none \
    -fill '#5865F2' -stroke none -draw 'circle 7,7 7,1' \
    -stroke '#FBF8FF' -strokewidth 2 -fill none \
    -draw 'line 3,7 6,10' \
    -draw 'line 6,10 11,4' \
    "$chip_icon"

  local line1_h line2_h line1_x line2_x line1_y line2_y chip_x chip_y chip_x2 chip_y2 accent_x
  line1_h="$(identify -format '%h' "$line1")"
  line2_h="$(identify -format '%h' "$line2")"

  if [[ "$variant" == "a" ]]; then
    line1_x=198
    line2_x=198
    line1_y=286
    line2_y=$((line1_y + line1_h + 22))
    chip_x=780
    chip_y=112
    chip_x2=1034
    chip_y2=162
    accent_x=170
  else
    line1_x=204
    line2_x=204
    line1_y=274
    line2_y=$((line1_y + line1_h + 24))
    chip_x=760
    chip_y=124
    chip_x2=1016
    chip_y2=174
    accent_x=176
  fi

  magick "$base" \
    \( "$mark_main" \) -geometry +136+92 -compose over -composite \
    \( "$wordmark" \) -geometry +248+88 -compose over -composite \
    -fill 'rgba(255,198,110,0.56)' -stroke none \
    -draw "roundrectangle ${accent_x},280 $((accent_x + 4)),532 2,2" \
    -fill 'rgba(17,10,35,0.88)' -stroke 'rgba(120,146,255,0.56)' -strokewidth 2 \
    -draw "roundrectangle ${chip_x},${chip_y} ${chip_x2},${chip_y2} 20,20" \
    \( "$discord_logo" \) -geometry +$((chip_x + 18))+$((chip_y + 14)) -compose over -composite \
    \( "$chip_text" \) -geometry +$((chip_x + 50))+$((chip_y + 12)) -compose over -composite \
    \( "$chip_icon" \) -geometry +$((chip_x + 220))+$((chip_y + 18)) -compose over -composite \
    \( "$line1" \) -geometry +${line1_x}+${line1_y} -compose over -composite \
    \( "$line2" \) -geometry +${line2_x}+${line2_y} -compose over -composite \
    "$out"

  magick "$out" -depth 8 -strip "$out"
}

compose_variant a "$OUT_A"
compose_variant b "$OUT_B"
cp "$OUT_B" "$OUT_WINNER"

identify "$OUT_A" "$OUT_B" "$OUT_WINNER"
echo "Generated: $OUT_A"
echo "Generated: $OUT_B"
echo "Winner: $OUT_WINNER"
