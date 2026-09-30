# Modified for HomeTwin3D: build this independent repository. See ../ORIGIN.md.
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20

# Stage 1: Build the SPA
FROM node:22-alpine AS builder

ARG BUILD_VERSION
RUN apk add --no-cache git
WORKDIR /app
RUN git clone --depth 1 --branch main https://github.com/Raza55/HomeTwin3D.git .
RUN npm ci
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Behind an HTTPS reverse proxy the app reaches HA through /ha-ws (nginx.conf).
# No service worker: a cached app shell kept wall tablets on old versions.
ENV VITE_HA_WS_PROXY=1 HOMETWIN_NO_SERVICE_WORKER=1
RUN npm run build -- --mode addon

# Stage 2: Serve with nginx on HA base image
FROM ${BUILD_FROM}

RUN apk add --no-cache nginx

COPY --from=builder /app/dist /var/www/html
COPY nginx.conf /etc/nginx/http.d/default.conf
RUN touch /etc/nginx/hometwin-pin.map
COPY run.sh /etc/services.d/nginx/run
RUN chmod +x /etc/services.d/nginx/run
