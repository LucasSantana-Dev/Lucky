//! `lucky-render`: recap card sidecar. `lucky-render healthcheck` probes /healthz.

use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Duration;

use lucky_render::health::{healthcheck, parse_port};
use lucky_render::server::{AppState, router};

/// How long SIGTERM waits for an in-flight render before exiting anyway.
const DRAIN: Duration = Duration::from_secs(10);

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    let port = match parse_port(std::env::var("PORT").ok().as_deref()) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("level=error msg=invalid_port error={e:?}");
            return ExitCode::FAILURE;
        }
    };
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        return if healthcheck(port) {
            ExitCode::SUCCESS
        } else {
            ExitCode::FAILURE
        };
    }

    let font_dir = PathBuf::from(
        std::env::var("FONT_DIR").unwrap_or_else(|_| "/usr/share/lucky-render/fonts".into()),
    );
    let fontdb = match lucky_render::font_db(&font_dir) {
        Ok(db) => db,
        Err(e) => {
            eprintln!("level=error msg=fonts_unavailable error={e:?}");
            return ExitCode::FAILURE;
        }
    };
    println!("level=info msg=fonts_loaded faces={}", fontdb.len());

    let addr = format!("0.0.0.0:{port}");
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("level=error msg=bind_failed addr={addr} error={e:?}");
            return ExitCode::FAILURE;
        }
    };
    println!("level=info msg=listening addr={addr}");

    let state = AppState::new(fontdb);
    let served = axum::serve(listener, router(state.clone()))
        .with_graceful_shutdown(shutdown())
        .await;
    if let Err(e) = served {
        eprintln!("level=error msg=serve_failed error={e:?}");
        return ExitCode::FAILURE;
    }
    // Detached renders outlive the connections; give them a bounded window,
    // then exit explicitly so a stuck blocking task cannot hang termination.
    let idle = state.drain(DRAIN).await;
    println!("level=info msg=shutdown drained={idle}");
    std::process::exit(if idle { 0 } else { 1 });
}

async fn shutdown() {
    use tokio::signal::unix::{SignalKind, signal};
    let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
    tokio::select! {
        _ = term.recv() => {}
        _ = tokio::signal::ctrl_c() => {}
    }
}
