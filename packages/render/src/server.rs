//! HTTP surface: `POST /render/recap`, `GET /healthz`, `GET /metrics`.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, State};
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use resvg::usvg::fontdb::Database;
use tokio::sync::Semaphore;

use crate::metrics::{Metrics, Outcome};
use crate::{RecapPayload, RenderError, Rendered};

pub const BODY_LIMIT: usize = 3 * 1024 * 1024;
/// How long a request waits for the single render slot before a 503.
const QUEUE_TIMEOUT: Duration = Duration::from_secs(10);

pub type Renderer = fn(&RecapPayload, Arc<Database>) -> Result<Rendered, RenderError>;

pub struct AppState {
    fontdb: Arc<Database>,
    renderer: Renderer,
    /// One render at a time: the container runs at 0.5 CPU.
    slot: Arc<Semaphore>,
    pub metrics: Metrics,
}

impl AppState {
    pub fn new(fontdb: Arc<Database>) -> Arc<Self> {
        Self::with_renderer(fontdb, crate::render_jpeg)
    }

    pub fn with_renderer(fontdb: Arc<Database>, renderer: Renderer) -> Arc<Self> {
        Arc::new(Self {
            fontdb,
            renderer,
            slot: Arc::new(Semaphore::new(1)),
            metrics: Metrics::default(),
        })
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/render/recap", post(render_recap))
        .route("/healthz", get(|| async { "ok" }))
        .route("/metrics", get(metrics))
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .with_state(state)
}

async fn metrics(State(state): State<Arc<AppState>>) -> Response {
    (
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        state.metrics.render(),
    )
        .into_response()
}

fn error(status: StatusCode, code: &'static str) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "application/json")],
        format!("{{\"error\":\"{code}\"}}"),
    )
        .into_response()
}

async fn render_recap(
    State(state): State<Arc<AppState>>,
    body: Result<Bytes, axum::extract::rejection::BytesRejection>,
) -> Response {
    let started = Instant::now();
    let (res, outcome, dropped) = handle(&state, body).await;
    let elapsed = started.elapsed();
    state.metrics.observe(outcome, elapsed.as_secs_f64());
    state.metrics.add_covers_dropped(dropped);
    // Never log payload contents: status and sizes only.
    println!(
        "level=info msg=render status={} outcome={outcome:?} duration_ms={} covers_dropped={dropped}",
        res.status().as_u16(),
        elapsed.as_millis()
    );
    res
}

async fn handle(
    state: &Arc<AppState>,
    body: Result<Bytes, axum::extract::rejection::BytesRejection>,
) -> (Response, Outcome, usize) {
    let bad = |status, code| (error(status, code), Outcome::BadRequest, 0);
    let Ok(body) = body else {
        return bad(StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large");
    };
    // serde errors can quote payload values, so they are never forwarded.
    let payload: RecapPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) if e.is_data() => return bad(StatusCode::UNPROCESSABLE_ENTITY, "invalid_payload"),
        Err(_) => return bad(StatusCode::BAD_REQUEST, "invalid_json"),
    };
    if payload.schema_version != 1 {
        return bad(
            StatusCode::UNPROCESSABLE_ENTITY,
            "unsupported_schema_version",
        );
    }
    let fail = |status, code| (error(status, code), Outcome::Error, 0);
    let permit = match tokio::time::timeout(QUEUE_TIMEOUT, state.slot.clone().acquire_owned()).await
    {
        Ok(Ok(p)) => p,
        _ => return fail(StatusCode::SERVICE_UNAVAILABLE, "busy"),
    };
    let (renderer, fontdb) = (state.renderer, state.fontdb.clone());
    // The permit moves into the task, so a dropped client cannot free the
    // slot while the render is still burning CPU.
    let job = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        renderer(&payload, fontdb)
    });
    match job.await {
        Ok(Ok(r)) => (
            ([(header::CONTENT_TYPE, "image/jpeg")], r.jpeg).into_response(),
            Outcome::Ok,
            r.covers_dropped,
        ),
        _ => fail(StatusCode::INTERNAL_SERVER_ERROR, "render_failed"),
    }
}
