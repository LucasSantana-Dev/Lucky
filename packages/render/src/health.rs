//! `lucky-render healthcheck`: the image has no curl, so the binary probes itself.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(2);

/// True when `GET 127.0.0.1:<port>/healthz` answers 200 within the timeout.
pub fn healthcheck(port: u16) -> bool {
    probe(port).unwrap_or(false)
}

fn probe(port: u16) -> std::io::Result<bool> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&addr, TIMEOUT)?;
    stream.set_read_timeout(Some(TIMEOUT))?;
    stream.set_write_timeout(Some(TIMEOUT))?;
    stream.write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")?;
    let mut head = [0u8; 12];
    stream.read_exact(&mut head)?;
    Ok(&head == b"HTTP/1.1 200")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn serve_once(reply: &'static str) -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = [0u8; 512];
            let n = s.read(&mut buf).unwrap();
            assert!(buf[..n].starts_with(b"GET /healthz HTTP/1.1\r\n"));
            s.write_all(reply.as_bytes()).unwrap();
        });
        port
    }

    #[test]
    fn passes_on_200() {
        let port = serve_once("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\nok");
        assert!(healthcheck(port));
    }

    #[test]
    fn fails_on_non_200() {
        let port = serve_once("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        assert!(!healthcheck(port));
    }

    #[test]
    fn fails_when_nothing_listens() {
        let port = TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        assert!(!healthcheck(port));
    }

    #[test]
    fn fails_on_a_silent_server_within_the_timeout() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let started = std::time::Instant::now();
        assert!(!healthcheck(port));
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        drop(listener);
    }
}
