//! Times parse (incl. image decode), raster and PNG encode separately.
use resvg::{tiny_skia, usvg};
use std::time::Instant;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let recap: lucky_render::RecapPayload =
        serde_json::from_str(&std::fs::read_to_string(&a[1]).unwrap()).unwrap();
    let opt = usvg::Options {
        fontdb: lucky_render::font_db(std::path::Path::new(&a[2])),
        ..Default::default()
    };
    let (mut p, mut r, mut e) = (0.0, 0.0, 0.0);
    for _ in 0..30 {
        let t = Instant::now();
        let tree = usvg::Tree::from_str(&lucky_render::build_svg(&recap), &opt).unwrap();
        p += t.elapsed().as_secs_f64();
        let t = Instant::now();
        let mut px = tiny_skia::Pixmap::new(1200, 630).unwrap();
        resvg::render(&tree, tiny_skia::Transform::default(), &mut px.as_mut());
        r += t.elapsed().as_secs_f64();
        let t = Instant::now();
        let _ = px.encode_png().unwrap();
        e += t.elapsed().as_secs_f64();
    }
    println!(
        "per render: parse {:.1}ms raster {:.1}ms encode {:.1}ms",
        p / 0.03,
        r / 0.03,
        e / 0.03
    );
}
