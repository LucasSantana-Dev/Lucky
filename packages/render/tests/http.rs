//! HTTP handler tests, driven through the router without a socket.

use std::sync::Arc;

use axum::body::{Body, to_bytes};
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
async fn body_over_3_mb_is_413() {
    let res = send(&bare_state(), post(vec![b' '; 3 * 1024 * 1024 + 1])).await;
    assert_eq!(res.status(), StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(text(res).await, r#"{"error":"payload_too_large"}"#);
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
        "lucky_render_duration_seconds_bucket{le=\"+Inf\"} 2",
        "lucky_render_duration_seconds_count 2",
        "# TYPE lucky_render_duration_seconds histogram",
    ] {
        assert!(m.contains(line), "missing {line:?} in:\n{m}");
    }
}
