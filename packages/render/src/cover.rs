//! Cover art validation. A rejected cover is dropped, never fatal.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;

/// Decoded size cap per cover (ADR point 5).
pub const MAX_COVER_BYTES: usize = 64 * 1024;
const MAX_SIDE: usize = 1024;
const MAX_PIXELS: usize = 1_048_576;

/// Validates a base64 cover and returns a `data:` URL with the right mime, or
/// `None` when it must be dropped. Only PNG and JPEG pass (magic bytes); the
/// dimensions come from the header, the image is never decoded here.
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
    Some(format!("data:{mime};base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_header(w: u32, h: u32) -> Vec<u8> {
        let mut b = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
        b.extend_from_slice(b"IHDR");
        b.extend_from_slice(&w.to_be_bytes());
        b.extend_from_slice(&h.to_be_bytes());
        b.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0]);
        b
    }

    fn b64(bytes: &[u8]) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    #[test]
    fn accepts_png_and_emits_png_data_url() {
        let c = b64(&png_header(300, 300));
        assert_eq!(data_url(&c), Some(format!("data:image/png;base64,{c}")));
    }

    #[test]
    fn accepts_jpeg_and_emits_jpeg_data_url() {
        // Minimal JPEG: SOI, SOF0 (8-bit, 300x200), EOI.
        let jpeg = [
            0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 200, 1, 44, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
            0xff, 0xd9,
        ];
        let c = b64(&jpeg);
        assert_eq!(data_url(&c), Some(format!("data:image/jpeg;base64,{c}")));
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
        let mut big = png_header(300, 300);
        big.resize(MAX_COVER_BYTES + 1, 0);
        assert_eq!(data_url(&b64(&big)), None);
        let mut ok = png_header(300, 300);
        ok.resize(MAX_COVER_BYTES, 0);
        assert!(data_url(&b64(&ok)).is_some());
    }

    #[test]
    fn rejects_dimensions_over_1024_per_side() {
        assert_eq!(data_url(&b64(&png_header(1025, 10))), None);
        assert_eq!(data_url(&b64(&png_header(10, 1025))), None);
        assert!(data_url(&b64(&png_header(1024, 1024))).is_some());
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
