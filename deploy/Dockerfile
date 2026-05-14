# Pinned to almir/webhook 2.8.3 by manifest digest (released 2026-02-12). The
# tag alone is mutable on Docker Hub — the digest guarantees immutability since
# this service has /var/run/docker.sock mounted (supply-chain risk).
FROM almir/webhook:2.8.3@sha256:f77cc91c91d1527b48052280af38b50791e842ad8dd291e9b360a0c13c9ca991

# NOSONAR: privileged operations required for apk and docker socket mount
USER root
RUN apk add --no-cache git docker-cli docker-cli-compose bash

# Copy hooks config to /hooks/ — a path NOT declared as VOLUME by the
# base image.  The base image declares VOLUME /etc/webhook which causes
# anonymous-volume shadowing and makes bind-mounts or COPY to that path
# unreliable across container recreates.
RUN mkdir -p /hooks
COPY hooks.json /hooks/hooks.json
