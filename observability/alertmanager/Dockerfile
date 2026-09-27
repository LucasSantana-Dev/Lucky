# Renders alertmanager.yml.tmpl with envsubst before Alertmanager starts
# (see docker-compose.yml `alertmanager-config` and observability/README.md).
# Baking gettext (envsubst) in at build time, instead of `apk add` on every
# `docker compose up`, removes a per-run network dependency on the Alpine
# package mirror and the failure mode where a registry hiccup takes down the
# whole alerting path (alertmanager depends on this container succeeding).
FROM alpine:3.20
RUN apk add --no-cache gettext
