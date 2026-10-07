//! Dev bench: 10 warm-up renders, then N timed renders of the fixture (JPEG).
//! Usage: bench <fixture.json> <font dir> <out.jpg> [renders]

use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let fixture = std::fs::read_to_string(&args[1]).expect("fixture");
    let recap: lucky_render::RecapPayload = serde_json::from_str(&fixture).expect("payload");
    let renders: usize = args.get(4).map_or(200, |n| n.parse().expect("renders"));

    let started = Instant::now();
    let fontdb = lucky_render::font_db(std::path::Path::new(&args[2])).expect("fonts");
    println!(
        "fonts loaded: {} faces in {:?}",
        fontdb.len(),
        started.elapsed()
    );

    let mut jpeg = Vec::new();
    for _ in 0..10 {
        jpeg = lucky_render::render_jpeg(&recap, fontdb.clone())
            .expect("render")
            .jpeg;
    }
    let mut times = Vec::with_capacity(renders);
    for _ in 0..renders {
        let t = Instant::now();
        jpeg = lucky_render::render_jpeg(&recap, fontdb.clone())
            .expect("render")
            .jpeg;
        times.push(t.elapsed().as_secs_f64() * 1000.0);
    }
    std::fs::write(&args[3], &jpeg).expect("write jpeg");
    std::fs::write(format!("{}.svg", args[3]), lucky_render::build_svg(&recap)).expect("write svg");

    times.sort_by(|a, b| a.total_cmp(b));
    let pct = |p: f64| times[((times.len() as f64 * p).ceil() as usize).saturating_sub(1)];
    println!(
        "renders={renders} p50={:.1}ms p95={:.1}ms max={:.1}ms jpeg={}B",
        pct(0.50),
        pct(0.95),
        times[times.len() - 1],
        jpeg.len()
    );
    // Peak RSS (Linux only).
    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status
            .lines()
            .filter(|l| l.starts_with("VmHWM") || l.starts_with("VmRSS"))
        {
            println!("{line}");
        }
    }
}
