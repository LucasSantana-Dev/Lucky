# lucky-render sidecar. Build context is packages/render:
#   docker build -t lucky-render:dev packages/render
# The Rust tag must match rust-toolchain.toml.

# alpine:3.22
FROM alpine@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8 AS fonts
RUN apk add --no-cache curl ca-certificates
COPY scripts/fetch-fonts.sh /fetch-fonts.sh
RUN sh /fetch-fonts.sh /fonts

# rust:1.99.0-alpine (keep in sync with rust-toolchain.toml)
FROM rust@sha256:0cce0a5e0e8ba67b455257a3a02a1d99005f382748789d6464460028810f1627 AS build
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
