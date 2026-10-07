//! Hand-rolled Prometheus metrics: atomics only, no payload contents.

use std::fmt::Write;
use std::sync::atomic::{AtomicU64, Ordering::Relaxed};

/// Upper bounds in seconds, suited to a 0.05 to 2 s render.
const BUCKETS: [f64; 9] = [0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1.0, 1.5, 2.0];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Ok,
    BadRequest,
    /// 503: the waiting room is full or the render slot never freed up.
    Busy,
    Error,
}

#[derive(Default)]
pub struct Metrics {
    ok: AtomicU64,
    bad_request: AtomicU64,
    error: AtomicU64,
    busy: AtomicU64,
    covers_dropped: AtomicU64,
    /// Per-bucket (non-cumulative) counts; the last slot is +Inf.
    buckets: [AtomicU64; BUCKETS.len() + 1],
    sum_micros: AtomicU64,
}

impl Metrics {
    pub fn count(&self, outcome: Outcome) {
        match outcome {
            Outcome::Ok => &self.ok,
            Outcome::BadRequest => &self.bad_request,
            Outcome::Busy => &self.busy,
            Outcome::Error => &self.error,
        }
        .fetch_add(1, Relaxed);
    }

    /// Histogram of real renders only (ok and render_failed).
    pub fn observe_duration(&self, seconds: f64) {
        let slot = BUCKETS
            .iter()
            .position(|&le| seconds <= le)
            .unwrap_or(BUCKETS.len());
        self.buckets[slot].fetch_add(1, Relaxed);
        self.sum_micros.fetch_add((seconds * 1e6) as u64, Relaxed);
    }

    pub fn add_covers_dropped(&self, n: usize) {
        self.covers_dropped.fetch_add(n as u64, Relaxed);
    }

    /// Prometheus text exposition format 0.0.4.
    pub fn render(&self) -> String {
        let mut o = String::new();
        o.push_str("# HELP lucky_render_requests_total Render requests by outcome.\n");
        o.push_str("# TYPE lucky_render_requests_total counter\n");
        for (name, c) in [
            ("ok", &self.ok),
            ("bad_request", &self.bad_request),
            ("busy", &self.busy),
            ("error", &self.error),
        ] {
            let _ = writeln!(
                o,
                "lucky_render_requests_total{{outcome=\"{name}\"}} {}",
                c.load(Relaxed)
            );
        }
        o.push_str("# HELP lucky_render_duration_seconds Time spent rendering (ok and failed renders only).\n");
        o.push_str("# TYPE lucky_render_duration_seconds histogram\n");
        let mut cumulative = 0;
        for (i, le) in BUCKETS.iter().enumerate() {
            cumulative += self.buckets[i].load(Relaxed);
            let _ = writeln!(
                o,
                "lucky_render_duration_seconds_bucket{{le=\"{le}\"}} {cumulative}"
            );
        }
        cumulative += self.buckets[BUCKETS.len()].load(Relaxed);
        let _ = writeln!(
            o,
            "lucky_render_duration_seconds_bucket{{le=\"+Inf\"}} {cumulative}"
        );
        let _ = writeln!(
            o,
            "lucky_render_duration_seconds_sum {}",
            self.sum_micros.load(Relaxed) as f64 / 1e6
        );
        let _ = writeln!(o, "lucky_render_duration_seconds_count {cumulative}");
        o.push_str("# HELP lucky_render_covers_dropped_total Covers rejected by validation.\n");
        o.push_str("# TYPE lucky_render_covers_dropped_total counter\n");
        let _ = writeln!(
            o,
            "lucky_render_covers_dropped_total {}",
            self.covers_dropped.load(Relaxed)
        );
        o
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn histogram_buckets_are_cumulative_and_inclusive() {
        let m = Metrics::default();
        m.observe_duration(0.05);
        m.observe_duration(0.4);
        m.observe_duration(9.0);
        m.count(Outcome::Busy);
        let out = m.render();
        assert!(out.contains("_bucket{le=\"0.05\"} 1\n"));
        assert!(out.contains("_bucket{le=\"0.5\"} 2\n"));
        assert!(out.contains("_bucket{le=\"2\"} 2\n"));
        assert!(out.contains("_bucket{le=\"+Inf\"} 3\n"));
        assert!(out.contains("_sum 9.45\n"));
        assert!(out.contains("requests_total{outcome=\"busy\"} 1\n"));
    }
}
