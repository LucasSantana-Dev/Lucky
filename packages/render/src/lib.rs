//! Weekly recap card renderer (decisions/2026-10-07-lucky-render-rust-sidecar.md).

use std::sync::Arc;

use resvg::{tiny_skia, usvg};
use serde::Deserialize;
use unicode_normalization::UnicodeNormalization;
use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

pub const WIDTH: u32 = 1200;
pub const HEIGHT: u32 = 630;

/// Mirrors `RecapPayload` in packages/shared/src/services/weeklyRecap.ts.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecapPayload {
    pub schema_version: u32,
    pub guild_id: String,
    pub from: String,
    pub to: String,
    pub plays: u32,
    pub skips: u32,
    pub autoplay_plays: u32,
    pub listened_seconds: u64,
    pub top_tracks: Vec<TopTrack>,
    pub top_artists: Vec<TopArtist>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TopTrack {
    pub title: String,
    pub author: String,
    pub plays: u32,
    /// Base64 JPEG or PNG, at most 256 KB encoded.
    #[serde(default)]
    pub cover: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TopArtist {
    pub name: String,
    pub plays: u32,
}

#[derive(Debug)]
pub enum RenderError {
    Svg(usvg::Error),
    Pixmap,
    Encode(String),
}

/// Loads the bundled fonts once; the database is shared by every render.
pub fn font_db(font_dir: &std::path::Path) -> Arc<usvg::fontdb::Database> {
    let mut db = usvg::fontdb::Database::new();
    let entries = std::fs::read_dir(font_dir).expect("font dir");
    for path in entries.filter_map(|e| e.ok().map(|e| e.path())) {
        if path.extension().is_some_and(|x| x == "ttf") {
            db.load_font_data(std::fs::read(&path).expect("font file"));
        }
    }
    db.set_sans_serif_family("Noto Sans");
    Arc::new(db)
}

pub fn render_png(
    recap: &RecapPayload,
    fontdb: Arc<usvg::fontdb::Database>,
) -> Result<Vec<u8>, RenderError> {
    rasterize(recap, fontdb)?
        .encode_png()
        .map_err(|e| RenderError::Encode(e.to_string()))
}

/// JPEG at quality 90: the collage is mostly photos, where PNG costs about
/// 70% of the render time and five times the bytes.
pub fn render_jpeg(
    recap: &RecapPayload,
    fontdb: Arc<usvg::fontdb::Database>,
) -> Result<Vec<u8>, RenderError> {
    let pixmap = rasterize(recap, fontdb)?;
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
    Ok(out)
}

fn rasterize(
    recap: &RecapPayload,
    fontdb: Arc<usvg::fontdb::Database>,
) -> Result<tiny_skia::Pixmap, RenderError> {
    let svg = build_svg(recap);
    let opt = usvg::Options {
        fontdb,
        ..usvg::Options::default()
    };
    let tree = usvg::Tree::from_str(&svg, &opt).map_err(RenderError::Svg)?;
    let mut pixmap = tiny_skia::Pixmap::new(WIDTH, HEIGHT).ok_or(RenderError::Pixmap)?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    Ok(pixmap)
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

pub fn sanitize(raw: &str) -> String {
    raw.nfc()
        .filter_map(|c| match c {
            '\t' | '\n' | '\r' => Some(' '),
            '\u{0}'..='\u{1f}' | '\u{7f}'..='\u{9f}' => None,
            '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' => None,
            '\u{fffe}' | '\u{ffff}' => None,
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
    if text.width() <= max_width {
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

const FONT: &str = "Noto Sans, Noto Sans SC, Noto Sans Arabic, Noto Sans Hebrew, Noto Emoji";

const GRID: usize = 630;
const GOLD: &str = "#f5c542";
const MUTED: &str = "#b9a8d9";

/// Tapmusic-style collage: covers of the top tracks on the left (3x3, 2x2 or
/// one tile, by how many tracks the week had), the numbers on the right.
pub fn build_svg(r: &RecapPayload) -> String {
    let hours = r.listened_seconds / 3600;
    let minutes = (r.listened_seconds % 3600) / 60;
    let autoplay = (r.autoplay_plays * 100 + r.plays / 2)
        .checked_div(r.plays)
        .unwrap_or(0);

    let mut s = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" font-family="{FONT}">
<defs>
<linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1030"/><stop offset="1" stop-color="#110a1f"/></linearGradient>
<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></linearGradient>
<linearGradient id="empty" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b1f66"/><stop offset="1" stop-color="#1a0f2e"/></linearGradient>
</defs>
<rect width="100%" height="100%" fill="url(#panel)"/>
"##
    );

    let n = r.top_tracks.len();
    let side = if n >= 9 {
        3
    } else if n >= 4 {
        2
    } else {
        1
    };
    let tile = GRID / side;
    let (title_w, author_w, title_px, author_px) = match side {
        3 => (17, 22, 18, 14),
        2 => (24, 30, 24, 17),
        _ => (40, 48, 34, 22),
    };
    for (i, t) in r.top_tracks.iter().take(side * side).enumerate() {
        let x = (i % side) * tile;
        let y = (i / side) * tile;
        match t.cover.as_deref().filter(|c| is_base64_image(c)) {
            Some(b64) => s.push_str(&format!(
                r#"<image x="{x}" y="{y}" width="{tile}" height="{tile}" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,{b64}"/>"#
            )),
            None => s.push_str(&format!(
                r##"<rect x="{x}" y="{y}" width="{tile}" height="{tile}" fill="url(#empty)"/><text x="{}" y="{}" font-size="{}" text-anchor="middle" fill="{GOLD}" fill-opacity="0.5">🎵</text>"##,
                x + tile / 2,
                y + tile / 2,
                tile / 4
            )),
        }
        s.push_str(&format!(
            r##"
<rect x="{x}" y="{y}" width="{tile}" height="{tile}" fill="url(#scrim)"/>
<text x="{}" y="{}" font-size="{}" font-weight="700" fill="#000" fill-opacity="0.55">{}</text><text x="{}" y="{}" font-size="{}" font-weight="700" fill="{GOLD}">{}</text>
<text x="{}" y="{}" font-size="{title_px}" font-weight="700" fill="#fff">{}</text>
<text x="{}" y="{}" font-size="{author_px}" fill="#e6dcf5">{}<tspan font-family="Noto Sans"> · ×{}</tspan></text>
"##,
            x + 13, y + 33, title_px + 2, i + 1,
            x + 12, y + 32, title_px + 2, i + 1,
            x + 12, y + tile - 16 - author_px - 6, slot(&t.title, title_w),
            x + 12, y + tile - 16, slot(&t.author, author_w), t.plays,
        ));
    }

    let px = GRID + 48;
    s.push_str(&format!(
        r##"<text x="{px}" y="78" font-size="20" font-weight="700" letter-spacing="6" fill="{GOLD}">LUCKY</text>
<text x="{px}" y="134" font-size="50" font-weight="700" fill="#fff">Weekly recap</text>
<text x="{px}" y="172" font-size="21" fill="{MUTED}">{}</text>
"##,
        slot(&format!("{} → {}", date(&r.from), date(&r.to)), 40)
    ));

    let stats = [
        (r.plays.to_string(), format!("plays · {} skipped", r.skips)),
        (format!("{hours}h {minutes}m"), "listened".to_string()),
        (format!("{autoplay}%"), "autoplay".to_string()),
    ];
    for ((value, label), dx) in stats.iter().zip([0, 160, 352]) {
        let x = px + dx;
        s.push_str(&format!(
            r##"<text x="{x}" y="258" font-size="40" font-weight="700" fill="#fff">{}</text><text x="{x}" y="286" font-size="16" fill="{MUTED}">{}</text>
"##,
            slot(value, 10),
            slot(label, 20)
        ));
    }

    s.push_str(&format!(
        r##"<rect x="{px}" y="322" width="474" height="1" fill="#fff" fill-opacity="0.12"/>
<text x="{px}" y="368" font-size="18" font-weight="700" letter-spacing="3" fill="{GOLD}">TOP ARTISTS</text>
"##
    ));
    for (i, a) in r.top_artists.iter().take(5).enumerate() {
        let y = 412 + i * 44;
        s.push_str(&format!(
            r##"<text x="{px}" y="{y}" font-size="22" fill="{MUTED}">{}</text><text x="{}" y="{y}" font-size="24" font-weight="700" fill="#fff">{}</text><text x="{}" y="{y}" font-size="20" text-anchor="end" fill="{MUTED}">×{}</text>
"##,
            i + 1,
            px + 32,
            slot(&a.name, 28),
            px + 474,
            a.plays
        ));
    }
    s.push_str("</svg>");
    s
}

/// Cover art arrives base64-encoded from the bot; anything else is dropped so
/// it cannot break out of the href attribute.
fn is_base64_image(b64: &str) -> bool {
    b64.len() <= MAX_COVER_B64
        && !b64.is_empty()
        && b64
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))
}

/// 256 KB encoded, as base64.
const MAX_COVER_B64: usize = 256 * 1024 * 4 / 3 + 4;

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
    fn rejects_unknown_fields() {
        let json = r#"{"schemaVersion":1,"guildId":"g","from":"","to":"","plays":0,"skips":0,"autoplayPlays":0,"listenedSeconds":0,"topTracks":[],"topArtists":[],"playedBy":"u"}"#;
        assert!(serde_json::from_str::<RecapPayload>(json).is_err());
    }
}
