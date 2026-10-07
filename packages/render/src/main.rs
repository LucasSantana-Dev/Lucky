//! `lucky-render`: recap card sidecar. `lucky-render healthcheck` probes /healthz.

use std::path::PathBuf;
use std::process::ExitCode;

use lucky_render::server::{AppState, router};

fn port() -> u16 {
    std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080)
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> ExitCode {
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        return if lucky_render::health::healthcheck(port()) {
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

    let addr = format!("0.0.0.0:{}", port());
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("level=error msg=bind_failed addr={addr} error={e:?}");
            return ExitCode::FAILURE;
        }
    };
    println!("level=info msg=listening addr={addr}");

    let served = axum::serve(listener, router(AppState::new(fontdb)))
        .with_graceful_shutdown(shutdown())
        .await;
    match served {
        Ok(()) => {
            println!("level=info msg=shutdown");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("level=error msg=serve_failed error={e:?}");
            ExitCode::FAILURE
        }
    }
}

async fn shutdown() {
    use tokio::signal::unix::{SignalKind, signal};
    let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
    tokio::select! {
        _ = term.recv() => {}
        _ = tokio::signal::ctrl_c() => {}
    }
}
