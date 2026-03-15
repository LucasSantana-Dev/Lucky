FROM almir/webhook:latest

USER root
RUN apk add --no-cache git docker-cli docker-cli-compose bash

# Copy hooks config at build time so the VOLUME /etc/webhook declared
# in the base image is initialised with the correct content.
COPY hooks.json /etc/webhook/hooks.json
