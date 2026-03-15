FROM almir/webhook:latest

USER root
RUN apk add --no-cache git docker-cli docker-cli-compose bash

# Copy hooks config to /hooks/ — a path NOT declared as VOLUME by the
# base image.  The base image declares VOLUME /etc/webhook which causes
# anonymous-volume shadowing and makes bind-mounts or COPY to that path
# unreliable across container recreates.
RUN mkdir -p /hooks
COPY hooks.json /hooks/hooks.json
