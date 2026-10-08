//! HTTP handler tests, driven through the router without a socket.

use std::sync::Arc;

use axum::body::{Body, Bytes, to_bytes};
use axum::http::{Request, Response, StatusCode, header};
use lucky_render::server::{AppState, router};
use tower::ServiceExt;

const POC: &str = include_str!("../fixtures/recap-poc.json");

fn fonts() -> Arc<resvg::usvg::fontdb::Database> {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fonts");
    lucky_render::font_db(&dir)
        .unwrap_or_else(|e| panic!("{e}: run scripts/fetch-fonts.sh fonts first"))
}

async fn send(state: &Arc<AppState>, req: Request<Body>) -> Response<Body> {
    router(state.clone()).oneshot(req).await.unwrap()
}

fn post(body: impl Into<Body>) -> Request<Body> {
    Request::post("/render/recap")
        .header(header::CONTENT_TYPE, "application/json")
        .body(body.into())
        .unwrap()
}

async fn text(res: Response<Body>) -> String {
    String::from_utf8(
        to_bytes(res.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec(),
    )
    .unwrap()
}

fn bare_state() -> Arc<AppState> {
    AppState::new(Arc::new(resvg::usvg::fontdb::Database::new()))
}

#[tokio::test]
async fn healthz_returns_ok() {
    let res = send(
        &bare_state(),
        Request::get("/healthz").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(text(res).await, "ok");
}

#[tokio::test]
async fn render_returns_a_jpeg() {
    let state = AppState::new(fonts());
    let res = send(&state, post(POC)).await;
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers()[header::CONTENT_TYPE], "image/jpeg");
    let bytes = to_bytes(res.into_body(), usize::MAX).await.unwrap();
    assert_eq!(&bytes[..3], &[0xff, 0xd8, 0xff]);
}

#[tokio::test]
async fn malformed_json_is_400_without_echoing_the_body() {
    let res = send(&bare_state(), post(r#"{"guildId":"SECRET-MARKER"#)).await;
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    let body = text(res).await;
    assert_eq!(body, r#"{"error":"invalid_json"}"#);
}

#[tokio::test]
async fn unknown_field_is_422_without_echoing_the_field() {
    let json = POC.replacen("\"guildId\"", "\"SECRET-MARKER\": 1, \"guildId\"", 1);
    let res = send(&bare_state(), post(json)).await;
    assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);
    let body = text(res).await;
    assert_eq!(body, r#"{"error":"invalid_payload"}"#);
}

#[tokio::test]
async fn wrong_schema_version_is_422() {
    let json = POC.replacen("\"schemaVersion\": 1", "\"schemaVersion\": 2", 1);
    assert_ne!(json, POC);
    let res = send(&bare_state(), post(json)).await;
    assert_eq!(res.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(text(res).await, r#"{"error":"unsupported_schema_version"}"#);
}

#[tokio::test]
async fn body_over_2_5_mb_is_413() {
    let res = send(&bare_state(), post(vec![b' '; 2_621_440 + 1])).await;
    assert_eq!(res.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(text(res).await, r#"{"error":"payload_too_large"}"#);
}

/// A body whose read fails midway, like a dropped connection.
struct Broken;

impl axum::body::HttpBody for Broken {
    type Data = Bytes;
    type Error = std::io::Error;

    fn poll_frame(
        self: std::pin::Pin<&mut Self>,
        _: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Result<http_body::Frame<Bytes>, std::io::Error>>> {
        std::task::Poll::Ready(Some(Err(std::io::Error::other("SECRET-MARKER"))))
    }
}

#[tokio::test]
async fn a_body_read_failure_is_400_not_413_and_never_echoed() {
    let res = send(&bare_state(), post(Body::new(Broken))).await;
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
    assert_eq!(text(res).await, r#"{"error":"invalid_body"}"#);
}

#[tokio::test]
async fn render_failure_is_500_and_counted() {
    fn failing(
        _: &lucky_render::RecapPayload,
        _: Arc<resvg::usvg::fontdb::Database>,
    ) -> Result<lucky_render::Rendered, lucky_render::RenderError> {
        Err(lucky_render::RenderError::Pixmap)
    }
    let state = AppState::with_renderer(Arc::new(resvg::usvg::fontdb::Database::new()), failing);
    let res = send(&state, post(POC)).await;
    assert_eq!(res.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(text(res).await, r#"{"error":"render_failed"}"#);
    let m = state.metrics.render();
    assert!(m.contains("lucky_render_requests_total{outcome=\"error\"} 1"));
}

#[tokio::test]
async fn metrics_count_outcomes_drops_and_durations() {
    let state = AppState::new(fonts());
    let bad_cover = POC.replacen(
        "\"plays\": 9 }",
        "\"plays\": 9, \"cover\": \"not-base64!\" }",
        1,
    );
    assert_ne!(bad_cover, POC);
    assert_eq!(send(&state, post(bad_cover)).await.status(), StatusCode::OK);
    assert_eq!(
        send(&state, post("{")).await.status(),
        StatusCode::BAD_REQUEST
    );
    let res = send(
        &state,
        Request::get("/metrics").body(Body::empty()).unwrap(),
    )
    .await;
    assert_eq!(res.status(), StatusCode::OK);
    assert!(
        res.headers()[header::CONTENT_TYPE]
            .to_str()
            .unwrap()
            .starts_with("text/plain")
    );
    let m = text(res).await;
    for line in [
        "lucky_render_requests_total{outcome=\"ok\"} 1",
        "lucky_render_requests_total{outcome=\"bad_request\"} 1",
        "lucky_render_requests_total{outcome=\"error\"} 0",
        "lucky_render_covers_dropped_total 1",
        "lucky_render_requests_total{outcome=\"busy\"} 0",
        // The 400 is not a render, so only the ok render is observed.
        "lucky_render_duration_seconds_bucket{le=\"+Inf\"} 1",
        "lucky_render_duration_seconds_count 1",
        "# TYPE lucky_render_duration_seconds histogram",
    ] {
        assert!(m.contains(line), "missing {line:?} in:\n{m}");
    }
}

type Db = Arc<resvg::usvg::fontdb::Database>;

fn slow(
    _: &lucky_render::RecapPayload,
    _: Db,
) -> Result<lucky_render::Rendered, lucky_render::RenderError> {
    std::thread::sleep(std::time::Duration::from_millis(400));
    Ok(lucky_render::Rendered {
        jpeg: vec![0xff, 0xd8, 0xff],
        covers_dropped: 0,
    })
}

fn empty_db() -> Db {
    Arc::new(resvg::usvg::fontdb::Database::new())
}

#[tokio::test]
async fn fourth_concurrent_request_gets_503_busy_and_is_not_observed() {
    let state = AppState::with_renderer(empty_db(), slow);
    let mut tasks = Vec::new();
    for _ in 0..3 {
        let s = state.clone();
        tasks.push(tokio::spawn(
            async move { send(&s, post(POC)).await.status() },
        ));
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }
    let res = send(&state, post(POC)).await;
    assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(text(res).await, r#"{"error":"busy"}"#);
    for t in tasks {
        assert_eq!(t.await.unwrap(), StatusCode::OK);
    }
    let m = state.metrics.render();
    assert!(m.contains("requests_total{outcome=\"busy\"} 1"), "{m}");
    assert!(m.contains("requests_total{outcome=\"ok\"} 3"), "{m}");
    assert!(m.contains("duration_seconds_count 3"), "{m}");
}

#[tokio::test]
async fn a_render_nobody_waits_for_is_counted_as_abandoned_not_ok() {
    let state = AppState::with_renderer(empty_db(), slow);
    let dropped = tokio::time::timeout(
        std::time::Duration::from_millis(50),
        send(&state, post(POC)),
    )
    .await;
    assert!(dropped.is_err(), "request should still be running");
    tokio::time::sleep(std::time::Duration::from_millis(900)).await;
    let m = state.metrics.render();
    assert!(m.contains("requests_total{outcome=\"abandoned\"} 1"), "{m}");
    assert!(m.contains("requests_total{outcome=\"ok\"} 0"), "{m}");
    // It was still a real render, so the histogram sees it.
    assert!(m.contains("duration_seconds_count 1"), "{m}");
}

#[tokio::test]
async fn drain_waits_for_in_flight_renders_up_to_its_budget() {
    let state = AppState::with_renderer(empty_db(), slow);
    let s = state.clone();
    let req = tokio::spawn(async move { send(&s, post(POC)).await.status() });
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert!(!state.drain(std::time::Duration::from_millis(50)).await);
    assert!(state.drain(std::time::Duration::from_secs(3)).await);
    assert_eq!(req.await.unwrap(), StatusCode::OK);
}

static STUCK: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tokio::test]
async fn watchdog_fires_when_a_render_exceeds_its_budget() {
    let state = AppState::with_renderer_and_watchdog(
        empty_db(),
        slow,
        std::time::Duration::from_millis(50),
        || STUCK.store(true, std::sync::atomic::Ordering::SeqCst),
    );
    let res = send(&state, post(POC)).await;
    assert_eq!(res.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert!(STUCK.load(std::sync::atomic::Ordering::SeqCst));
}

#[tokio::test]
async fn zero_width_and_combining_floods_render_fast_with_bounded_svg() {
    let state = AppState::new(fonts());
    for flood in ["\u{200b}", "\u{301}"] {
        let title = format!("a{}", flood.repeat(200_000));
        let mut v: serde_json::Value = serde_json::from_str(POC).unwrap();
        v["topTracks"][0]["title"] = title.into();
        let started = std::time::Instant::now();
        let res = send(&state, post(v.to_string())).await;
        assert_eq!(res.status(), StatusCode::OK);
        // Was 48.9 s before the fix; debug builds are slower than release,
        // so the bound is loose but still catches a regression.
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        let payload: lucky_render::RecapPayload = serde_json::from_value(v).unwrap();
        let svg = lucky_render::build_svg(&payload);
        assert!(svg.len() < 100_000, "svg grew to {} bytes", svg.len());
    }
}
