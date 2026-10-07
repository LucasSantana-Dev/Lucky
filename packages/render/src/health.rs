//! `lucky-render healthcheck`: the image has no curl, so the binary probes itself.

use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::{Duration, Instant};

const TIMEOUT: Duration = Duration::from_secs(2);

/// Listen port from the `PORT` value: 8080 when unset, an error when invalid.
pub fn parse_port(value: Option<&str>) -> Result<u16, String> {
    match value {
        None => Ok(8080),
        Some(v) => v
            .parse::<u16>()
            .ok()
            .filter(|p| *p != 0)
            .ok_or_else(|| "PORT must be an integer from 1 to 65535".to_string()),
    }
}

/// True when `GET 127.0.0.1:<port>/healthz` answers 200 within the timeout.
pub fn healthcheck(port: u16) -> bool {
    probe(port).unwrap_or(false)
}

fn probe(port: u16) -> std::io::Result<bool> {
    // One absolute deadline for connect, write and every read.
    let deadline = Instant::now() + TIMEOUT;
    let left = || {
        deadline
            .checked_duration_since(Instant::now())
            .filter(|d| !d.is_zero())
            .ok_or_else(|| std::io::Error::from(std::io::ErrorKind::TimedOut))
    };
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&addr, left()?)?;
    stream.set_write_timeout(Some(left()?))?;
    stream.write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")?;
    // Read just the status line, never more than 64 bytes of it.
    let mut line = Vec::with_capacity(64);
    let mut byte = [0u8; 1];
    while line.len() < 64 && !line.ends_with(b"\r\n") {
        stream.set_read_timeout(Some(left()?))?;
        if stream.read(&mut byte)? == 0 {
            break;
        }
        line.push(byte[0]);
    }
    Ok(is_200(&line))
}

/// `HTTP/1.x 200` followed by a space or the end of the line.
fn is_200(line: &[u8]) -> bool {
    let line = line.strip_suffix(b"\r\n").unwrap_or(line);
    let Some(rest) = line.strip_prefix(b"HTTP/1.") else {
        return false;
    };
    let [minor, b' ', code @ ..] = rest else {
        return false;
    };
    minor.is_ascii_digit()
        && code.len() >= 3
        && code[..3] == *b"200"
        && code.get(3).is_none_or(|b| *b == b' ')
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
    fn port_defaults_and_rejects_garbage() {
        assert_eq!(parse_port(None), Ok(8080));
        assert_eq!(parse_port(Some("9000")), Ok(9000));
        for bad in ["", "abc", "0", "65536", "-1", "80 80", "8080\n"] {
            assert!(parse_port(Some(bad)).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn passes_on_200() {
        let port = serve_once("HTTP/1.1 200 OK\r\ncontent-length: 2\r\n\r\nok");
        assert!(healthcheck(port));
    }

    #[test]
    fn parses_the_whole_status_line() {
        for (reply, ok) in [
            ("HTTP/1.0 200 OK\r\n\r\n", true),
            ("HTTP/1.1 200\r\n\r\n", true),
            ("HTTP/1.1 2000 OK\r\n\r\n", false),
            ("HTTP/1.1 200OK\r\n\r\n", false),
            ("HTTP/2 200 OK\r\n\r\n", false),
            ("HTTP/1.1 20 OK\r\n\r\n", false),
            ("garbage", false),
        ] {
            assert_eq!(healthcheck(serve_once(reply)), ok, "{reply:?}");
        }
    }

    #[test]
    fn a_slow_drip_server_hits_one_absolute_deadline() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            for b in b"HTTP/1.1 200 OK\r\n" {
                if s.write_all(&[*b]).is_err() {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(400));
            }
        });
        let started = std::time::Instant::now();
        assert!(!healthcheck(port));
        assert!(started.elapsed() < std::time::Duration::from_millis(2600));
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
