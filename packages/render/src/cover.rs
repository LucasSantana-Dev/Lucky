//! Cover art validation. A rejected cover is dropped, never fatal.

use std::io::Cursor;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

/// Decoded size cap per cover (ADR point 5).
pub const MAX_COVER_BYTES: usize = 64 * 1024;
const MAX_SIDE: usize = 1024;
const MAX_PIXELS: usize = 1_048_576;
/// Allocation budget for the trial decode (1024x1024 RGBA at 8 bits).
const MAX_DECODED_BYTES: usize = 4 * 1024 * 1024;

/// Validates a base64 cover and returns a `data:` URL with the right mime, or
/// `None` when it must be dropped. Only PNG and JPEG pass (magic bytes). The
/// header dimensions are checked first, then the image is fully decoded under
/// an allocation limit, so truncated or malformed files are dropped here
/// instead of failing (or being silently skipped) inside the renderer.
pub fn data_url(b64: &str) -> Option<String> {
    // Reject on the encoded length first so a huge string is never decoded.
    if b64.is_empty() || b64.len() > MAX_COVER_BYTES.div_ceil(3) * 4 {
        return None;
    }
    let bytes = STANDARD.decode(b64).ok()?;
    if bytes.len() > MAX_COVER_BYTES {
        return None;
    }
    let mime = if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        "image/png"
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else {
        return None;
    };
    let size = imagesize::blob_size(&bytes).ok()?;
    let (w, h) = (size.width, size.height);
    if w == 0 || h == 0 || w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS {
        return None;
    }
    let decodes = if mime == "image/png" {
        decode_png(&bytes)
    } else {
        decode_jpeg(&bytes)
    };
    decodes.then(|| format!("data:{mime};base64,{b64}"))
}

fn decode_png(bytes: &[u8]) -> bool {
    let mut decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: MAX_DECODED_BYTES,
        },
    );
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let Ok(mut reader) = decoder.read_info() else {
        return false;
    };
    match reader.output_buffer_size() {
        Some(n) if n <= MAX_DECODED_BYTES => {
            let mut buf = vec![0; n];
            reader.next_frame(&mut buf).is_ok()
        }
        _ => false,
    }
}

fn decode_jpeg(bytes: &[u8]) -> bool {
    let options = zune_core::options::DecoderOptions::default()
        .set_max_width(MAX_SIDE)
        .set_max_height(MAX_SIDE)
        .set_strict_mode(true);
    let mut decoder = zune_jpeg::JpegDecoder::new_with_options(
        zune_core::bytestream::ZCursor::new(bytes),
        options,
    );
    decoder.decode().is_ok_and(|px| px.len() <= MAX_DECODED_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Header-only PNG: valid signature and IHDR, no pixel data.
    fn png_header(w: u32, h: u32) -> Vec<u8> {
        let mut b = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
        b.extend_from_slice(b"IHDR");
        b.extend_from_slice(&w.to_be_bytes());
        b.extend_from_slice(&h.to_be_bytes());
        b.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
        b
    }

    /// A real, fully valid solid-color PNG.
    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut out = Vec::new();
        let mut enc = png::Encoder::new(&mut out, w, h);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().unwrap();
        writer
            .write_image_data(&vec![120; (w * h * 3) as usize])
            .unwrap();
        writer.finish().unwrap();
        out
    }

    /// A real, fully valid solid-color JPEG.
    fn jpeg(w: u16, h: u16) -> Vec<u8> {
        let mut out = Vec::new();
        jpeg_encoder::Encoder::new(&mut out, 80)
            .encode(
                &vec![120; w as usize * h as usize * 3],
                w,
                h,
                jpeg_encoder::ColorType::Rgb,
            )
            .unwrap();
        out
    }

    fn b64(bytes: &[u8]) -> String {
        STANDARD.encode(bytes)
    }

    #[test]
    fn accepts_png_and_emits_png_data_url() {
        let c = b64(&png(300, 300));
        assert_eq!(data_url(&c), Some(format!("data:image/png;base64,{c}")));
    }

    #[test]
    fn accepts_jpeg_and_emits_jpeg_data_url() {
        let c = b64(&jpeg(300, 200));
        assert_eq!(data_url(&c), Some(format!("data:image/jpeg;base64,{c}")));
    }

    #[test]
    fn rejects_png_with_only_a_header() {
        assert_eq!(data_url(&b64(&png_header(300, 300))), None);
    }

    #[test]
    fn rejects_truncated_png() {
        let full = png(300, 300);
        assert!(data_url(&b64(&full)).is_some());
        assert_eq!(data_url(&b64(&full[..full.len() / 2])), None);
    }

    #[test]
    fn rejects_jpeg_without_scan_data_and_truncated_jpeg() {
        let full = jpeg(300, 200);
        assert!(data_url(&b64(&full)).is_some());
        // Cut right after the start-of-frame header: dimensions, no scan.
        let sof = full.windows(2).position(|w| w == [0xff, 0xc0]).unwrap();
        assert_eq!(data_url(&b64(&full[..sof + 19])), None);
        assert_eq!(data_url(&b64(&full[..full.len() / 2])), None);
    }

    #[test]
    fn rejects_invalid_base64() {
        assert_eq!(data_url("not base64 !!"), None);
        assert_eq!(data_url("\"/><script>"), None);
        assert_eq!(data_url(""), None);
    }

    #[test]
    fn rejects_unknown_magic_bytes() {
        assert_eq!(data_url(&b64(b"GIF89a-not-allowed-here-0000")), None);
        assert_eq!(
            data_url(&b64(b"<svg xmlns='http://www.w3.org/2000/svg'/>")),
            None
        );
    }

    #[test]
    fn rejects_decoded_size_over_64_kb() {
        // Trailing bytes after IEND keep the image valid, so only the size
        // cap decides.
        let mut big = png(64, 64);
        big.resize(MAX_COVER_BYTES + 1, 0);
        assert_eq!(data_url(&b64(&big)), None);
        let mut ok = png(64, 64);
        ok.resize(MAX_COVER_BYTES, 0);
        assert!(data_url(&b64(&ok)).is_some());
    }

    #[test]
    fn rejects_dimensions_over_1024_per_side() {
        assert_eq!(data_url(&b64(&png_header(1025, 10))), None);
        assert_eq!(data_url(&b64(&png_header(10, 1025))), None);
        assert!(data_url(&b64(&png(1024, 1024))).is_some());
    }

    #[test]
    fn rejects_zero_dimensions_and_truncated_headers() {
        assert_eq!(data_url(&b64(&png_header(0, 0))), None);
        assert_eq!(data_url(&b64(&png_header(5, 5)[..12])), None);
    }

    #[test]
    fn rejects_oversized_encoded_string_before_decoding() {
        let huge = "A".repeat(MAX_COVER_BYTES * 2);
        assert_eq!(data_url(&huge), None);
    }
}
