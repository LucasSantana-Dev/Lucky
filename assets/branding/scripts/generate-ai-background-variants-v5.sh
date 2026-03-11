#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BRANDING_DIR="$ROOT_DIR/assets/branding"
OUT_A="$BRANDING_DIR/lucky-verified-ai-bg-v5a.png"
OUT_B="$BRANDING_DIR/lucky-verified-ai-bg-v5b.png"
STATUS_FILE="$BRANDING_DIR/lucky-verified-ai-status-v5.md"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lucky-ai-v5-XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

if ! command -v infsh >/dev/null 2>&1; then
  cat > "$STATUS_FILE" <<STATUS
# AI Background Status (v5)

- Date: $(date '+%Y-%m-%d %H:%M:%S %z')
- Status: blocked
- Reason: \
`infsh` CLI is not available.
STATUS
  exit 1
fi

run_variant() {
  local variant="$1"
  local prompt="$2"
  local output="$3"
  local result_json="$TMP_DIR/${variant}.json"
  local result_log="$TMP_DIR/${variant}.log"

  set +e
  infsh app run falai/flux-2-klein-lora \
    --input "{\"prompt\":\"${prompt}\",\"width\":1200,\"height\":675,\"num_images\":1,\"output_format\":\"png\",\"model_size\":\"4b\",\"guidance_scale\":4,\"num_inference_steps\":24}" \
    --save "$result_json" \
    --json > "$result_log" 2>&1
  local exit_code=$?
  set -e

  if [[ $exit_code -ne 0 ]] || rg -qi 'insufficient balance|add credits|failed to submit task' "$result_log"; then
    return 1
  fi

  local image_url
  image_url="$(jq -r '.. | strings | select(test("^https?://"))' "$result_json" | rg -m1 '\.(png|jpg|jpeg|webp)($|\?)' || true)"

  if [[ -z "$image_url" ]]; then
    return 1
  fi

  curl -L -sS "$image_url" -o "$output"
  magick "$output" -resize 1200x675^ -gravity center -extent 1200x675 "$output"
}

PROMPT_A='premium editorial dark plum gradient mesh, subtle atmospheric grain, restrained neon violet highlights, clean asymmetric composition space for large headline on left, no text, no logos, no characters, no clutter'
PROMPT_B='luxury dark purple editorial background, soft mesh light bloom, subtle pink and blue accent zones, negative space for typography, no text, no logos, no icons, no noise'

if run_variant a "$PROMPT_A" "$OUT_A" && run_variant b "$PROMPT_B" "$OUT_B"; then
  cat > "$STATUS_FILE" <<STATUS
# AI Background Status (v5)

- Date: $(date '+%Y-%m-%d %H:%M:%S %z')
- Status: ready
- Variants:
  - $OUT_A
  - $OUT_B
STATUS
  identify "$OUT_A" "$OUT_B"
  exit 0
fi

cat > "$STATUS_FILE" <<STATUS
# AI Background Status (v5)

- Date: $(date '+%Y-%m-%d %H:%M:%S %z')
- Status: blocked
- Reason: \
Inference task could not run (likely insufficient balance or provider submission failure).
- Fallback: \
Use deterministic mesh backgrounds from \`generate-verified-banner-v5.sh\`.
STATUS

exit 2
