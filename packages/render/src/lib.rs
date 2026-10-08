//! Weekly recap card renderer (decisions/2026-10-07-lucky-render-rust-sidecar.md).

pub mod cover;
pub mod health;
pub mod metrics;
pub mod server;

use std::sync::Arc;

use resvg::{tiny_skia, usvg};
use schemars::JsonSchema;
use serde::Deserialize;
use unicode_normalization::UnicodeNormalization;
use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

pub const WIDTH: u32 = 1200;
pub const HEIGHT: u32 = 1440;

/// Mirrors `RecapPayload` in packages/shared/src/services/weeklyRecap.ts.
#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecapPayload {
    /// Must equal 1.
    #[schemars(extend("const" = 1))]
    pub schema_version: u32,
    pub guild_id: String,
    pub from: String,
    pub to: String,
    #[schemars(range(max = 4_294_967_295u32))]
    pub plays: u32,
    #[schemars(range(max = 4_294_967_295u32))]
    pub skips: u32,
    #[schemars(range(max = 4_294_967_295u32))]
    pub autoplay_plays: u32,
    #[schemars(range(max = 18_446_744_073_709_551_615u64))]
    pub listened_seconds: u64,
    /// Only the first 25 are used.
    pub top_tracks: Vec<TopTrack>,
    pub top_artists: Vec<TopArtist>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TopTrack {
    pub title: String,
    pub author: String,
    #[schemars(range(max = 4_294_967_295u32))]
    pub plays: u32,
    /// Optional standard base64 PNG or JPEG: at most 64 KB decoded and
    /// 1024x1024 pixels. An invalid cover is dropped, the card still renders.
    #[serde(default)]
    pub cover: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct TopArtist {
    pub name: String,
    #[schemars(range(max = 4_294_967_295u32))]
    pub plays: u32,
}

/// Most tracks the card can show (a 5x5 grid).
pub const MAX_TRACKS: usize = 25;

#[derive(Debug)]
pub enum RenderError {
    Svg(usvg::Error),
    Pixmap,
    Encode(String),
}

/// Families the card needs; a missing one silently falls back to a wrong face.
const REQUIRED_FAMILIES: [&str; 7] = [
    "Manrope",
    "Dela Gothic One",
    "Noto Sans SC",
    "Noto Sans Arabic",
    "Noto Sans Hebrew",
    "Noto Emoji",
    "Noto Sans",
];

/// Loads the bundled fonts once; the database is shared by every render.
/// Fails when the directory holds no usable face, so a bad image dies at boot.
pub fn font_db(font_dir: &std::path::Path) -> Result<Arc<usvg::fontdb::Database>, String> {
    let mut db = usvg::fontdb::Database::new();
    let entries = std::fs::read_dir(font_dir)
        .map_err(|e| format!("cannot read font dir {}: {e}", font_dir.display()))?;
    let mut paths: Vec<_> = entries.filter_map(|e| e.ok().map(|e| e.path())).collect();
    // usvg picks a glyph fallback from the first loaded face that has the
    // character. Dela Gothic One carries kana and kanji but is far heavier
    // than Manrope, so it loads last and the Noto faces win the fallback.
    paths.sort_by_key(|p| {
        (
            p.file_name().is_some_and(|n| n == "DelaGothicOne.ttf"),
            p.clone(),
        )
    });
    for path in paths {
        if path.extension().is_some_and(|x| x == "ttf") {
            let data = std::fs::read(&path)
                .map_err(|e| format!("cannot read font {}: {e}", path.display()))?;
            db.load_font_data(data);
        }
    }
    if db.is_empty() {
        return Err(format!("no font faces in {}", font_dir.display()));
    }
    let missing: Vec<&str> = REQUIRED_FAMILIES
        .iter()
        .copied()
        .filter(|want| {
            !db.faces()
                .any(|f| f.families.iter().any(|(name, _)| name == want))
        })
        .collect();
    if !missing.is_empty() {
        return Err(format!(
            "missing font families in {}: {}",
            font_dir.display(),
            missing.join(", ")
        ));
    }
    db.set_sans_serif_family("Manrope");
    Ok(Arc::new(db))
}

/// JPEG at quality 90: the collage is mostly photos, where PNG costs about
/// 70% of the render time and five times the bytes.
pub fn render_jpeg(
    recap: &RecapPayload,
    fontdb: Arc<usvg::fontdb::Database>,
) -> Result<Rendered, RenderError> {
    let (pixmap, covers_dropped) = rasterize(recap, fontdb)?;
    // The card is fully opaque, so premultiplied RGBA equals straight RGBA.
    let mut out = Vec::new();
    jpeg_encoder::Encoder::new(&mut out, 90)
        .encode(
            pixmap.data(),
            WIDTH as u16,
            HEIGHT as u16,
            jpeg_encoder::ColorType::Rgba,
        )
        .map_err(|e| RenderError::Encode(e.to_string()))?;
    Ok(Rendered {
        jpeg: out,
        covers_dropped,
    })
}

pub struct Rendered {
    pub jpeg: Vec<u8>,
    /// Covers rejected by validation; their tiles show the placeholder.
    pub covers_dropped: usize,
}

fn rasterize(
    recap: &RecapPayload,
    fontdb: Arc<usvg::fontdb::Database>,
) -> Result<(tiny_skia::Pixmap, usize), RenderError> {
    let (svg, dropped) = build_svg_counted(recap);
    let opt = usvg::Options {
        fontdb,
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_str(&svg, &opt).map_err(RenderError::Svg)?;
    let mut pixmap = tiny_skia::Pixmap::new(WIDTH, HEIGHT).ok_or(RenderError::Pixmap)?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    Ok((pixmap, dropped))
}

/// Raw text to a safe, bounded slot value. Order matters: sanitize and
/// truncate the raw string, escape last, so an entity is never split.
/// The value is wrapped in a first-strong isolate (FSI ... PDI) so an RTL
/// name cannot flip the direction of the numbers around it.
pub fn slot(raw: &str, max_width: usize) -> String {
    format!(
        "\u{2068}{}\u{2069}",
        escape(&truncate(&sanitize(raw), max_width))
    )
}

/// Raw characters read per slot; the rest is cut before any normalization so
/// a hostile string cannot make later stages do unbounded work.
const MAX_RAW_CHARS: usize = 512;

pub fn sanitize(raw: &str) -> String {
    raw.chars()
        .take(MAX_RAW_CHARS)
        .nfc()
        .filter_map(|c| match c {
            '\t' | '\n' | '\r' => Some(' '),
            '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' => None,
            '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' => None,
            '\u{fffe}' | '\u{ffff}' => None,
            // Zero-width format characters (ZWJ U+200D stays for emoji).
            '\u{200b}' | '\u{200c}' | '\u{200e}' | '\u{200f}' => None,
            '\u{61c}' | '\u{34f}' => None,
            '\u{2060}'..='\u{2064}' | '\u{feff}' => None,
            c => Some(c),
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Cuts on a grapheme boundary so a slot never exceeds `max_width` columns
/// (wide CJK counts 2). Adds an ellipsis when it cuts.
pub fn truncate(text: &str, max_width: usize) -> String {
    // Bound by grapheme count too: zero-width graphemes still cost shaping.
    let fits = text.graphemes(true).take(max_width + 1).count() <= max_width;
    if fits && text.width() <= max_width {
        return text.to_string();
    }
    let mut out = String::new();
    let mut used = 0;
    for g in text.graphemes(true) {
        let w = g.width().max(1);
        if used + w > max_width.saturating_sub(1) {
            break;
        }
        used += w;
        out.push_str(g);
    }
    out.push('…');
    out
}

pub fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

// Brand type (DESIGN.md): the LUCKY wordmark is vector paths, never a font;
// Dela Gothic One for eyebrows, numbers, katakana and the URL; Manrope for
// running text. Noto covers the scripts the brand fonts lack.
const FALLBACK: &str = "Noto Sans SC, Noto Sans Arabic, Noto Sans Hebrew, Noto Emoji, Noto Sans";
const PURPLE: &str = "#52387B";
const INK: &str = "#211D2E";
const VERMILION: &str = "#B83A24";
const GOLD: &str = "#C9922E";
const CREAM: &str = "#F3E6CB";
/// The one stroke weight of the card.
const LINE: usize = 4;
const MARGIN: usize = 40;
const HEADER: usize = 256;
/// LUCKY wordmark paths (branding/source/wordmark.svg, 2180x540 viewBox).
const WORDMARK: &str = include_str!("../assets/wordmark-paths.frag");
/// App icon (cat head in an Edo purple disc), pre-downscaled to 160 px.
const ICON_PNG: &[u8] = include_bytes!("../assets/lucky-icon-160.png");

fn icon_data_url() -> &'static str {
    use base64::Engine;
    static URL: std::sync::LazyLock<String> = std::sync::LazyLock::new(|| {
        format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(ICON_PNG)
        )
    });
    &URL
}

/// Rounded share of autoplay plays; u64 so no u32 input can overflow.
fn autoplay_percent(autoplay: u32, plays: u32) -> u64 {
    (u64::from(autoplay) * 100 + u64::from(plays) / 2)
        .checked_div(u64::from(plays))
        .unwrap_or(0)
}

/// Tapmusic-style collage: retro print header with the week's numbers, then
/// the top tracks' covers in the largest full square grid the week fills (5x5
/// down to one tile), each in a single ink frame.
pub fn build_svg(r: &RecapPayload) -> String {
    build_svg_counted(r).0
}

/// Like [`build_svg`], also returning how many drawn covers were rejected.
pub fn build_svg_counted(r: &RecapPayload) -> (String, usize) {
    let mut dropped = 0;
    let hours = r.listened_seconds / 3600;
    let minutes = (r.listened_seconds % 3600) / 60;
    let autoplay = autoplay_percent(r.autoplay_plays, r.plays);
    let w = WIDTH as usize;
    let right = w - MARGIN;
    let icon = icon_data_url();

    let mut s = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" font-family="Manrope, {FALLBACK}">
<rect width="100%" height="100%" fill="{CREAM}"/>
<image x="{MARGIN}" y="30" width="150" height="150" href="{icon}"/>
<text x="224" y="52" font-family="Dela Gothic One" font-size="20" letter-spacing="2" fill="{VERMILION}">WEEKLY RECAP</text>
<text x="{right}" y="52" font-size="22" font-weight="600" text-anchor="end" fill="{INK}">{}</text>
<g transform="translate(224,64) scale(0.11)">{WORDMARK}</g>
<text x="226" y="156" font-family="Dela Gothic One" font-size="26" letter-spacing="3" fill="{PURPLE}">ラッキー</text>
"##,
        slot(&format!("{} → {}", date(&r.from), date(&r.to)), 40),
    );

    let stats = [
        (r.plays.to_string(), format!("PLAYS · {} SKIPPED", r.skips)),
        (format!("{hours}H {minutes}M"), "LISTENED".to_string()),
        (format!("{autoplay}%"), "AUTOPLAY".to_string()),
    ];
    for ((value, label), x) in stats.iter().zip([224, 520, 850]) {
        s.push_str(&format!(
            r##"<text x="{x}" y="198" font-family="Dela Gothic One" font-size="36" fill="{INK}">{}</text><text x="{x}" y="222" font-size="15" font-weight="600" letter-spacing="1" fill="{INK}">{}</text>
"##,
            slot(value, 10),
            slot(label, 24)
        ));
    }
    s.push_str(&format!(
        r##"<rect x="{MARGIN}" y="{}" width="{}" height="{LINE}" fill="{INK}"/>
"##,
        HEADER - 18 - LINE / 2,
        w - 2 * MARGIN
    ));

    let n = r.top_tracks.len().min(MAX_TRACKS);
    let side = (1..=5).rev().find(|k| n >= k * k).unwrap_or(1);
    let tile = (w - 2 * MARGIN) / side;
    let gx = (w - tile * side) / 2;
    let (title_px, author_px) = ((tile / 11).min(52), (tile / 15).min(34));
    let rank_r = (tile / 9).min(56);
    let pad = (tile / 40).max(8);
    let band = pad * 3 + title_px + author_px;
    let avail = (tile - 2 * pad) as f32;
    let title_w = (avail / (title_px as f32 * 0.6)) as usize;
    // The play count sits right-aligned on the author line; keep room for it.
    let author_w = ((avail - author_px as f32 * 3.0) / (author_px as f32 * 0.56)) as usize;
    for (i, t) in r.top_tracks.iter().take(side * side).enumerate() {
        let x = gx + (i % side) * tile;
        let y = HEADER + (i / side) * tile;
        let cover = t.cover.as_deref().and_then(|c| {
            let url = cover::data_url(c);
            dropped += usize::from(url.is_none());
            url
        });
        match cover {
            Some(url) => s.push_str(&format!(
                r#"<image x="{x}" y="{y}" width="{tile}" height="{tile}" preserveAspectRatio="xMidYMid slice" href="{url}"/>"#
            )),
            None => s.push_str(&format!(
                r##"<rect x="{x}" y="{y}" width="{tile}" height="{tile}" fill="{CREAM}"/><circle class="sun" cx="{}" cy="{}" r="{}" fill="{PURPLE}"/>"##,
                x + tile / 2,
                y + (tile - band) / 2,
                tile / 10
            )),
        }
        let band_y = y + tile - band;
        let rank = i + 1;
        let rank_px = if rank >= 10 {
            rank_r * 4 / 5
        } else {
            rank_r * 11 / 10
        };
        let (cx, cy) = (x + pad + rank_r, y + pad + rank_r);
        s.push_str(&format!(
            r##"
<rect x="{x}" y="{band_y}" width="{tile}" height="{band}" fill="{CREAM}"/><rect x="{x}" y="{band_y}" width="{tile}" height="{LINE}" fill="{INK}"/>
<circle cx="{cx}" cy="{cy}" r="{rank_r}" fill="{PURPLE}" stroke="{INK}" stroke-width="{LINE}"/><text x="{cx}" y="{}" font-family="Dela Gothic One" font-size="{rank_px}" text-anchor="middle" fill="{CREAM}">{rank}</text>
<text x="{}" y="{}" font-size="{title_px}" font-weight="600" fill="{INK}">{}</text>
<text x="{}" y="{}" font-size="{author_px}" font-weight="600" fill="{INK}">{}</text><text x="{}" y="{}" font-size="{author_px}" font-weight="600" text-anchor="end" fill="{INK}">×{}</text>
<rect x="{x}" y="{y}" width="{tile}" height="{tile}" fill="none" stroke="{INK}" stroke-width="{LINE}"/>
"##,
            cy + rank_px * 35 / 100,
            x + pad, band_y + pad + title_px - title_px / 8, slot(&t.title, title_w),
            x + pad, band_y + 2 * pad + title_px + author_px - author_px / 5, slot(&t.author, author_w),
            x + tile - pad, band_y + 2 * pad + title_px + author_px - author_px / 5, t.plays,
        ));
    }
    let foot_y = HEADER + tile * side + (HEIGHT as usize - HEADER - tile * side) / 2;
    s.push_str(&format!(
        r##"<circle cx="{}" cy="{}" r="9" fill="{GOLD}" stroke="{INK}" stroke-width="{LINE}"/><text x="{}" y="{}" font-family="Dela Gothic One" font-size="28" text-anchor="middle" fill="{PURPLE}">lucky.lucassantana.tech</text><circle cx="{}" cy="{}" r="9" fill="{GOLD}" stroke="{INK}" stroke-width="{LINE}"/>
</svg>"##,
        w / 2 - 270, foot_y,
        w / 2, foot_y + 10,
        w / 2 + 270, foot_y,
    ));
    (s, dropped)
}

fn date(iso: &str) -> &str {
    iso.get(..10).unwrap_or(iso)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_before_escaping_and_never_splits_an_entity() {
        let raw = format!("{}&", "a".repeat(9));
        // Truncating the escaped "&amp;" at width 10 would split it.
        assert_eq!(slot(&raw, 10), "\u{2068}aaaaaaaaa&amp;\u{2069}");
        assert_eq!(
            slot(&format!("{}&b", "a".repeat(9)), 10),
            "\u{2068}aaaaaaaaa…\u{2069}"
        );
    }

    #[test]
    fn drops_controls_and_bidi_overrides_and_flattens_newlines() {
        assert_eq!(sanitize("a\u{0}b\u{202e}c\nd\u{2066}e"), "abc de");
    }

    #[test]
    fn cjk_counts_double_width() {
        assert_eq!(truncate("日本語の曲名", 7), "日本語…");
    }

    #[test]
    fn font_db_requires_every_brand_and_fallback_family() {
        let fonts = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fonts");
        let dir = std::env::temp_dir().join("lucky-render-one-font");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::copy(fonts.join("Manrope.ttf"), dir.join("Manrope.ttf")).unwrap();
        let err = font_db(&dir).unwrap_err();
        assert!(
            err.contains("Dela Gothic One") && err.contains("Noto Emoji"),
            "{err}"
        );
        assert!(font_db(&fonts).is_ok());
    }

    #[test]
    fn strips_arabic_letter_mark_and_combining_grapheme_joiner() {
        assert_eq!(sanitize("a\u{61c}b\u{34f}c"), "abc");
    }

    #[test]
    fn autoplay_percent_does_not_overflow() {
        assert_eq!(autoplay_percent(u32::MAX, u32::MAX), 100);
        assert_eq!(autoplay_percent(52, 87), 60);
        assert_eq!(autoplay_percent(5, 0), 0);
    }

    #[test]
    fn every_family_in_the_fallback_chain_is_required() {
        for family in FALLBACK.split(", ") {
            assert!(REQUIRED_FAMILIES.contains(&family), "{family}");
        }
    }

    #[test]
    fn strips_zero_width_format_chars_but_keeps_zwj() {
        assert_eq!(
            sanitize("a\u{200b}b\u{200c}c\u{200e}d\u{200f}e\u{2060}f\u{2064}g\u{feff}h"),
            "abcdefgh"
        );
        assert_eq!(sanitize("👩\u{200d}💻"), "👩\u{200d}💻");
    }

    #[test]
    fn sanitize_caps_raw_input_before_normalizing() {
        let long = format!("a{}", "\u{200b}".repeat(200_000));
        assert_eq!(sanitize(&long), "a");
        let marks = format!("a{}", "\u{301}".repeat(200_000));
        assert!(sanitize(&marks).chars().count() <= 512);
    }

    #[test]
    fn truncate_bounds_by_grapheme_count_even_when_width_is_zero() {
        // U+200D joined with nothing has width 0 and does not split graphemes.
        let text = "a\u{200d}".repeat(100);
        assert!(truncate(&text, 10).graphemes(true).count() <= 10);
        let long = "a".repeat(100);
        assert_eq!(truncate(&long, 10).chars().count(), 10);
    }

    fn payload_with_covers(covers: Vec<Option<String>>) -> RecapPayload {
        RecapPayload {
            schema_version: 1,
            guild_id: "g".into(),
            from: "2026-10-04T00:00:00Z".into(),
            to: "2026-10-11T00:00:00Z".into(),
            plays: 3,
            skips: 0,
            autoplay_plays: 0,
            listened_seconds: 60,
            top_artists: vec![],
            top_tracks: covers
                .into_iter()
                .map(|cover| TopTrack {
                    title: "t".into(),
                    author: "a".into(),
                    plays: 1,
                    cover,
                })
                .collect(),
        }
    }

    fn png_cover() -> String {
        use base64::Engine;
        let mut out = Vec::new();
        let mut enc = png::Encoder::new(&mut out, 4, 4);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[90; 48]).unwrap();
        w.finish().unwrap();
        base64::engine::general_purpose::STANDARD.encode(out)
    }

    #[test]
    fn invalid_cover_falls_back_to_placeholder_and_is_counted() {
        let r = payload_with_covers(vec![Some(png_cover()), Some("bad!".into()), None, None]);
        let (svg, dropped) = build_svg_counted(&r);
        assert_eq!(dropped, 1);
        assert!(svg.contains("data:image/png;base64,"));
        // The brand icon plus the one valid cover.
        assert_eq!(svg.matches("<image ").count(), 2);
        assert_eq!(svg.matches("class=\"sun\"").count(), 3);
    }

    #[test]
    fn only_the_tiles_drawn_are_inspected() {
        // 26 tracks fill a 5x5 grid; the 26th cover is never touched.
        let mut covers = vec![None; 25];
        covers.push(Some("bad!".into()));
        assert_eq!(build_svg_counted(&payload_with_covers(covers)).1, 0);
    }

    #[test]
    fn font_db_fails_on_an_empty_dir() {
        let dir = std::env::temp_dir().join("lucky-render-no-fonts");
        std::fs::create_dir_all(&dir).unwrap();
        assert!(font_db(&dir).is_err());
    }

    #[test]
    fn rejects_unknown_fields() {
        let json = r#"{"schemaVersion":1,"guildId":"g","from":"","to":"","plays":0,"skips":0,"autoplayPlays":0,"listenedSeconds":0,"topTracks":[],"topArtists":[],"playedBy":"u"}"#;
        assert!(serde_json::from_str::<RecapPayload>(json).is_err());
    }
}
