# Pinned to almir/webhook 2.8.3 (released 2026-02-12). Avoid :latest because
# this service has /var/run/docker.sock mounted — any silent base-image change
# is a supply-chain incident waiting to happen.
FROM almir/webhook:2.8.3

# NOSONAR: privileged operations required for apk and docker socket mount
USER root
RUN apk add --no-cache git docker-cli docker-cli-compose bash

# Copy hooks config to /hooks/ — a path NOT declared as VOLUME by the
# base image.  The base image declares VOLUME /etc/webhook which causes
# anonymous-volume shadowing and makes bind-mounts or COPY to that path
# unreliable across container recreates.
RUN mkdir -p /hooks
COPY hooks.json /hooks/hooks.json
