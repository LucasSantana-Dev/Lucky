# Pinned to almir/webhook 2.8.3 by manifest digest (released 2026-02-12). The
# tag alone is mutable on Docker Hub — the digest guarantees immutability since
# this service has /var/run/docker.sock mounted (supply-chain risk).
FROM almir/webhook:2.8.3@sha256:f77cc91c91d1527b48052280af38b50791e842ad8dd291e9b360a0c13c9ca991

# Webhook receiver mounts /var/run/docker.sock to invoke `docker compose pull/up`
# on the host. Effective access already equals root (anyone who can talk to the
# Docker socket is root-equivalent on the host), so dropping to a non-root UID
# inside the container is security theatre — switching users would only break
# the apk install + socket access without changing the trust boundary.
# NOSONAR: privileged operations required for apk and docker socket mount
# nosemgrep: dockerfile.security.last-user-is-root.last-user-is-root
USER root
RUN apk add --no-cache curl git docker-cli docker-cli-compose bash

# Copy hooks config to /hooks/ — a path NOT declared as VOLUME by the
# base image.  The base image declares VOLUME /etc/webhook which causes
# anonymous-volume shadowing and makes bind-mounts or COPY to that path
# unreliable across container recreates.
RUN mkdir -p /hooks
COPY hooks.json /hooks/hooks.json
