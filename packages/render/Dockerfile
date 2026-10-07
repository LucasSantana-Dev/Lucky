# lucky-render sidecar. Build context is packages/render:
#   docker build -t lucky-render:dev packages/render
# The Rust tag must match rust-toolchain.toml.

FROM alpine:3.22 AS fonts
RUN apk add --no-cache curl ca-certificates
COPY scripts/fetch-fonts.sh /fetch-fonts.sh
RUN sh /fetch-fonts.sh /fonts

FROM rust:1.99.0-alpine AS build
RUN apk add --no-cache musl-dev
# Static musl binary. An explicit --target keeps crt-static off the proc macros
# and build scripts, which must stay dynamic on a musl host.
ENV RUSTFLAGS="-C target-feature=+crt-static"
WORKDIR /src
# Dependency layer: rebuilt only when Cargo.toml or Cargo.lock change.
COPY Cargo.toml Cargo.lock ./
RUN mkdir -p src/bin \
 && echo "" > src/lib.rs \
 && echo "fn main() {}" > src/main.rs \
 && echo "fn main() {}" > src/bin/bench.rs \
 && cargo build --release --locked --target "$(uname -m)-unknown-linux-musl" --bin lucky-render \
 && rm -rf src
COPY src ./src
RUN touch src/lib.rs src/main.rs \
 && cargo build --release --locked --target "$(uname -m)-unknown-linux-musl" --bin lucky-render \
 && cp "target/$(uname -m)-unknown-linux-musl/release/lucky-render" /lucky-render

FROM scratch
COPY --from=build /lucky-render /usr/local/bin/lucky-render
COPY --from=fonts /fonts /usr/share/lucky-render/fonts
USER 10001:10001
ENV PORT=8080 FONT_DIR=/usr/share/lucky-render/fonts
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/lucky-render"]
