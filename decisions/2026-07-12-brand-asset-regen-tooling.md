# Brand-asset regeneration — hybrid resvg-frame + Gemini-mascot via inference.sh

- **Date:** 2026-07-12
- **Status:** Accepted — pilot completed (see Pilot outcome + FINAL DECISION below: keep the original mascot)
- **Deciders:** Lucas Santana
- **Method:** `/research-and-decide` — CLI-verified capability probe + web-doc research + artifact-only `decision-critic` (returned NEEDS_REVISION → decision revised to hybrid)

## Context

The README hero `assets/lucky-social-preview.png` (1280×640 baked raster) is off-brand: a
neon-glow cat mascot with **gold/orange** stripes + eyes, plus overlaid text chips
("Lucky", "TypeScript", "React", "849+ Tests", "4 Packages") where some accents render gold.
Brand palette is Discord **Blurple `#5865f2`** + **Neon Pink `#ec4899`** (gold explicitly
removed — `packages/frontend/branding/BRANDING_GUIDE.md`). No source pipeline composes this
PNG (repo grep: referenced only as a static file in `README.md` + `docs/TOP_GG_SUBMISSION.md`).

Scope corrections established during research (do NOT route these through AI):

- **Production `og-image.png`** (served to web) is a SEPARATE asset, already code-generated at
  build time via **resvg** from SVG in `packages/frontend/scripts/prerender-seo.ts` — clean,
  brand-colored, no gold. Out of scope.
- **`assets/lucky-logo.svg`** is off-brand **purple** (`#7c3aed`/`#8b5cf6`/`#a78bfa`/`#c4b5fd`)
  → fix by deterministic fill-swap, not AI. Separate cleanup.
- **`assets/outline-layer-{all,mid,gold}.svg`** are orphan design exports, referenced nowhere
  → ignore (YAGNI).
- **`--color-lucky-gold-*`** CSS vars (`index.css:130-132`) are legacy compat aliases already
  holding pink values, 0 live refs, slated for the planned migration-cleanup PR → leave as-is.

So the only asset that genuinely needs a raster generator is the hero mascot.

## Decision

**Hybrid, not pure-AI** (this is the critic's decision-flipping correction):

1. **Deterministic frame, AI-free.** Rebuild the hero's frame — background grid, layout, and
   text chips — by **reusing the proven resvg SVG→PNG pipeline** already in
   `prerender-seo.ts`. Text rendered from SVG = crisp, exact brand colors, **zero regen
   drift**. AI never touches rendered text (dissolves the maskless-regen text-mangling risk on
   short strings like "4 Packages").
2. **AI only for the neon-cat mascot raster** — the one element that cannot be clean SVG
   (soft neon bloom + gradients). Model: **`google/gemini-2-5-flash-image`** primary
   (mascot has no text → Pro's text-rendering edge is moot; Flash is cheaper), escalate to
   **`google/gemini-3-pro-image-preview`** (NanoBanana Pro) only if Flash quality is
   insufficient. Both accept `images: ["<local path>"]` (CLI auto-uploads — verified) +
   natural-language edit prompt.
3. **Two mascot variants** (keep-gold vs strip-to-blurple/pink) for operator/Maria to compare,
   with cross-variant **consistency via reference-image** (feed variant-1 as `images[]` to
   generate variant-2) — **NOT** a trained LoRA (LoRA training is overkill for two images).

**Rejected candidates:** Grok (weak/unreliable text — but text is now SVG-side, so moot
anyway); FLUX-Dev-LoRA (LoRA training overkill + text quality undocumented); Seedream/Reve
(strong but Gemini dominates on instruction-edit + reference consistency). **Rejected
approaches:** pure-AI whole-hero regen (maskless → text drift); full SVG rebuild of the mascot
(neon-glow raster art does not translate to clean vector).

## Consequences

- **Positive:** text is deterministic + brand-exact; AI cost bounded to the mascot; no LoRA
  training infra; reversible per-call (all models same CLI, pay-per-image, no lock-in).
- **Negative / risk:** reference-image mascot consistency is **UNVERIFIED** — it is the single
  load-bearing claim (critic's strongest objection). Must be pilot-tested before scaling.
- **Neutral:** the neon cat becomes the documented primary mascot (currently undocumented).

## Delivery channel (updated 2026-07-12)

inference.sh CLI hit `insufficient balance` (zero credits). Rather than fund it, the operator
has a **Gemini Pro (Advanced) subscription** which includes **Gemini 3 Pro Image / "Nano
Banana Pro"** — the _same model_ as `google/gemini-3-pro-image-preview`. So the mascot
generation runs via the **Gemini web app driven by Claude-in-Chrome**, at no incremental cost.
The inference.sh CLI (`images: ["<local path>"]` auto-upload, verified) remains the
**scriptable fallback** once credits are added — preferred if the work ever needs to be
batched/reproducible rather than one-off.

## Pilot outcome (2026-07-12) — KEEP EXISTING MASCOT

Pilot ran via Gemini web (Nano Banana Pro). **Technical result: PASS** — two consistent
variants generated (gold-accent A; blurple-accent B), in-thread edit held pose/composition
exactly (Gemini reported "Confirming Color Consistency"). So the critic's load-bearing
consistency risk is **resolved: reference/in-thread consistency works.**

**Aesthetic result: REJECT (operator).** Both regens read "too AI-ish" vs the original hero
cat, which "feels more welcoming." Root cause: from-scratch regen launders out the original's
asymmetry/hand-drawn character (the source of its warmth) into a generic uniform neon-sign
look. This fires the **"pilot output worse than existing → keep existing"** trigger.

**Decision: keep the original mascot as-is; do NOT replace it via AI regen.** The gold in the
mascot contributes warmth the operator values — treat it as intentional, not drift. Any future
palette tweak to the mascot must be an EDIT of the original raster (preserve its exact
character), never a from-scratch regen — and even that is not currently wanted. AI image-gen
via Gemini is a validated capability for OTHER assets (fresh graphics with no beloved
predecessor), just not for re-deriving this mascot.

## Iteration 2 (2026-07-12) — img2img RECOVERS the warmth

Operator chose to keep iterating (better prompt + explore other skills) rather than abandon.
Root cause of "too AI-ish" pinned by cropping the original: warmth = **simplicity + solid
dark fill + chunky roundness + minimal detail** (sticker/kawaii), which from-scratch text
regen launders into busy symmetric line-art. **Fix = img2img from the original crop** (not
text-to-image): feeding the real cat as a reference preserved its exact cozy character while
cleaning it up. Result accepted as the right direction.

**Working method (Gemini web via Claude-in-Chrome, no paid CLI):**

- Reference upload into the Gemini composer = **same-machine clipboard paste**:
  `osascript … set the clipboard to (read POSIX file … as «class PNGf»)` then focus composer
    - `cmd+v`. CRITICAL: the browser being driven and the machine running `osascript` must be
      the SAME host — pasting the Mac clipboard into a REMOTE (Windows) Chrome types a literal "v"
      (different clipboard). Use `list_connected_browsers` → `select_browser` to pin the local Mac
      (`isLocal:true`) first.
- `file_upload` MCP tool is BROKEN (rejects host paths, wants a `files` content param not in
  its schema) — do not use; clipboard paste is the workaround.
- Download-back is blocked: Brave prompts a native "Save As" dialog (unautomatable), JS
  cross-origin fetch of the `googleusercontent` blob is CORS-blocked, curl 403s (needs
  cookies). Operator downloads from their own browser, or fund inference.sh for scriptable
  local-file img2img.
- Prompt levers that kill the "AI-ish" feel: "SOLID dark-filled", "chunky/round", "minimal
  detail, no busy line-work", "sticker/emote", keep exact reference.

Skills installed to inform brand prompt craft: `anthropics/skills@brand-guidelines`,
`inference-sh/skills@logo-design-guide`.

## FINAL DECISION (2026-07-12) — KEEP THE ORIGINAL MASCOT

After a `/debate` (5 lenses) and testing ALL three production paths, the operator chose to
**keep the original mascot untouched.** Evidence trail (each shown to the operator, each
rejected):

1. **Text-to-image regen** (Nano Banana) → "too AI-ish" (busy line-art, generic).
2. **img2img from the original** → preserved warmth but "too rounded, weird" (over-rounded blob).
3. **Hand-authored vector SVG** (rendered via resvg — the production pipeline; neon-glow
   filter DID survive resvg, so the vector path is technically viable) → "straight up ass":
   thin strokes, weak glow, stiff geometric proportions vs the original's thick plump richly-
   glowing warmth. Confirmed the debate's DESIGN-CRAFT prediction: vector-DIY hits a quality
   ceiling for warm organic neon character.

**Conclusion:** the original mascot is genuinely strong and none of AI-regen / img2img /
vector-DIY beat it. Stop mascot work. If a definitive polished mascot is ever wanted, the
reliable path is a **human illustrator** (debate plan B), not another generation attempt.
**Redirect visual-identity effort to higher-ROI, taste-safe gaps:** the off-brand PURPLE
`lucky-logo.svg` (deterministic recolor to Blurple/Pink) and missing product/dashboard
screenshots in the README.

## Logo close-out (2026-07-12) — RASTER SUFFICIENT, vector DEFERRED

Second `/debate` (5 lenses) on "how to get a crisp scalable cat logo": **unanimous — ship
the raster package, defer vector.** The raster (resampled from the 375px crop, gold kept)
covers every use case for an 11-guild Discord bot (web logo, favicon, avatar, embeds). No
print/large-format/merch need has been articulated, so crisp-vector ROI is contingent on a
requirement that does not exist yet. Tracing the neon glow yields muddy geometry
(pre-threshold mitigation = manual tuning = same fidelity ceiling the hand-vector hit).

**Deferred vector fallbacks (only if a print/merch need materializes):** (a) bounded ~30-min
image-to-svg trace of the line geometry + re-glow via SVG feGaussianBlur (render via resvg),
show operator; (b) if that is muddy/stiff → commission a human illustrator. Vector/illustrator
skills on skills.sh for that day: `shhac/skills@image-to-svg` (trace), `rknall/…@svg-logo-designer`,
`sfkislev/flue@illustrator`.

**Visual-identity thread CLOSED for now:** mascot = keep original; logo = the raster cat
package (delivered, operator wires when ready); vector = deferred. Higher-ROI identity gap
still open if wanted later: README product/dashboard screenshots.

## Revisit when

- **Pilot fails** (mascot inconsistent, wrong hue, or artifacts) → flip the mascot to manual
  edit or keep the existing cat; do not iterate AI blindly.
- **Gemini iteration exceeds 3 rounds** → stop, keep existing mascot or escalate; the cost has
  overrun the SVG-alternative amortization point.
- **A clean standalone mascot source** later exists (SVG/high-res raster) → reference-image
  quality improves; re-pilot.
- Text ever needs to go INTO an AI-generated asset → re-evaluate model text-rendering (Gemini
  ~94% short-text, Reve typography engine) rather than defaulting to SVG.
