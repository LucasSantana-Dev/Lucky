//! HTTP surface: `POST /render/recap`, `GET /healthz`, `GET /metrics`.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{DefaultBodyLimit, Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{Next, from_fn_with_state};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use resvg::usvg::fontdb::Database;
use tokio::sync::Semaphore;
use tower_http::timeout::TimeoutLayer;

use crate::metrics::{Metrics, Outcome};
use crate::{RecapPayload, RenderError, Rendered};

/// 25 covers at about 87 KB of base64 each, plus text.
pub const BODY_LIMIT: usize = 2_621_440;
/// One render running plus two waiting; anything beyond is a 503 up front.
const WAITING_ROOM: usize = 3;
/// How long an admitted request waits for the single render slot.
const QUEUE_TIMEOUT: Duration = Duration::from_secs(10);
/// Whole-request budget, so a slow client cannot hold a connection forever.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
/// `spawn_blocking` cannot be cancelled; a render past this budget is stuck.
const WATCHDOG: Duration = Duration::from_secs(30);

pub type Renderer = fn(&RecapPayload, Arc<Database>) -> Result<Rendered, RenderError>;

pub struct AppState {
    fontdb: Arc<Database>,
    renderer: Renderer,
    watchdog: Duration,
    on_stuck: fn(),
    /// One render at a time: the container runs at 0.5 CPU.
    slot: Arc<Semaphore>,
    /// Admission control, checked before the body is read.
    waiting_room: Arc<Semaphore>,
    pub metrics: Metrics,
}

fn exit_stuck() {
    eprintln!("level=error msg=render_stuck action=exit");
    std::process::exit(1);
}

impl AppState {
    pub fn new(fontdb: Arc<Database>) -> Arc<Self> {
        Self::with_renderer(fontdb, crate::render_jpeg)
    }

    pub fn with_renderer(fontdb: Arc<Database>, renderer: Renderer) -> Arc<Self> {
        Self::with_renderer_and_watchdog(fontdb, renderer, WATCHDOG, exit_stuck)
    }

    pub fn with_renderer_and_watchdog(
        fontdb: Arc<Database>,
        renderer: Renderer,
        watchdog: Duration,
        on_stuck: fn(),
    ) -> Arc<Self> {
        Arc::new(Self {
            fontdb,
            renderer,
            watchdog,
            on_stuck,
            slot: Arc::new(Semaphore::new(1)),
            waiting_room: Arc::new(Semaphore::new(WAITING_ROOM)),
            metrics: Metrics::default(),
        })
    }

    /// Waits until no render holds the slot, at most `wait`. True when idle.
    /// Used on shutdown so SIGTERM does not cut a render in half.
    pub async fn drain(&self, wait: Duration) -> bool {
        tokio::time::timeout(wait, self.slot.acquire())
            .await
            .is_ok_and(|p| p.is_ok())
    }

    fn finish(&self, status: u16, outcome: Outcome, started: Instant, dropped: usize) {
        self.metrics.count(outcome);
        self.metrics.add_covers_dropped(dropped);
        // Never log payload contents: status and sizes only.
        println!(
            "level=info msg=render status={status} outcome={outcome:?} duration_ms={} covers_dropped={dropped}",
            started.elapsed().as_millis()
        );
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    let render = post(render_recap).layer(from_fn_with_state(state.clone(), admit));
    Router::new()
        .route("/render/recap", render)
        .route("/healthz", get(|| async { "ok" }))
        .route("/metrics", get(metrics))
        .layer(DefaultBodyLimit::max(BODY_LIMIT))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            REQUEST_TIMEOUT,
        ))
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

/// Takes a waiting-room place before the body is extracted; 503 when full.
async fn admit(State(state): State<Arc<AppState>>, req: Request, next: Next) -> Response {
    let started = Instant::now();
    match state.waiting_room.clone().try_acquire_owned() {
        Ok(_place) => next.run(req).await,
        Err(_) => {
            state.finish(503, Outcome::Busy, started, 0);
            error(StatusCode::SERVICE_UNAVAILABLE, "busy")
        }
    }
}

async fn render_recap(
    State(state): State<Arc<AppState>>,
    body: Result<Bytes, axum::extract::rejection::BytesRejection>,
) -> Response {
    let started = Instant::now();
    // serde errors can quote payload values, so they are never forwarded.
    let reject = |status: StatusCode, code| {
        state.finish(status.as_u16(), Outcome::BadRequest, started, 0);
        error(status, code)
    };
    let Ok(body) = body else {
        return reject(StatusCode::PAYLOAD_TOO_LARGE, "payload_too_large");
    };
    let payload: RecapPayload = match serde_json::from_slice(&body) {
        Ok(p) => p,
        Err(e) if e.is_data() => {
            return reject(StatusCode::UNPROCESSABLE_ENTITY, "invalid_payload");
        }
        Err(_) => return reject(StatusCode::BAD_REQUEST, "invalid_json"),
    };
    if payload.schema_version != 1 {
        return reject(
            StatusCode::UNPROCESSABLE_ENTITY,
            "unsupported_schema_version",
        );
    }
    let permit = match tokio::time::timeout(QUEUE_TIMEOUT, state.slot.clone().acquire_owned()).await
    {
        Ok(Ok(p)) => p,
        _ => {
            state.finish(503, Outcome::Busy, started, 0);
            return error(StatusCode::SERVICE_UNAVAILABLE, "busy");
        }
    };

    // The render and its bookkeeping run in a detached task, so a client that
    // disconnects mid-render still gets counted and the slot stays held until
    // the blocking work really ends.
    let task_state = state.clone();
    let abandoned = Arc::new(AtomicBool::new(false));
    let mut guard = AbandonGuard {
        flag: abandoned.clone(),
        completed: false,
    };
    let task = tokio::spawn(async move {
        let (renderer, fontdb) = (task_state.renderer, task_state.fontdb.clone());
        let job = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            renderer(&payload, fontdb)
        });
        let render_started = Instant::now();
        let result = match tokio::time::timeout(task_state.watchdog, job).await {
            Ok(joined) => joined.ok().and_then(Result::ok),
            Err(_) => {
                (task_state.on_stuck)();
                None
            }
        };
        task_state
            .metrics
            .observe_duration(render_started.elapsed().as_secs_f64());
        match result {
            Some(r) if abandoned.load(Ordering::SeqCst) => {
                // 499: the client closed the request before the response.
                task_state.finish(499, Outcome::Abandoned, started, r.covers_dropped);
                error(StatusCode::REQUEST_TIMEOUT, "abandoned")
            }
            Some(r) => {
                task_state.finish(200, Outcome::Ok, started, r.covers_dropped);
                ([(header::CONTENT_TYPE, "image/jpeg")], r.jpeg).into_response()
            }
            None => {
                task_state.finish(500, Outcome::Error, started, 0);
                error(StatusCode::INTERNAL_SERVER_ERROR, "render_failed")
            }
        }
    });
    let res = task
        .await
        .unwrap_or_else(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "render_failed"));
    guard.completed = true;
    res
}

/// Marks the request abandoned when the handler future is dropped before it
/// delivered (client disconnect or the router timeout answering 408).
struct AbandonGuard {
    flag: Arc<AtomicBool>,
    completed: bool,
}

impl Drop for AbandonGuard {
    fn drop(&mut self) {
        if !self.completed {
            self.flag.store(true, Ordering::SeqCst);
        }
    }
}
