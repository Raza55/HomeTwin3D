# Modified for HomeTwin3D: build this independent repository. See ../ORIGIN.md.
#
# Releases are prebuilt by .github/workflows/addon-image.yml (config.yaml
# `image:`), so Home Assistant only downloads them. This file also builds
# locally (Supervisor fallback, docker build).
ARG BUILD_ARCH=amd64

# Stage 1: build the web app once on the build machine itself: its output is
# the same for every architecture, so no emulated (slow) ARM build is needed.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

# SOURCE_REF: the commit to build (CI passes it; local builds use main).
# BUILD_VERSION is part of the step so a new version never reuses an old clone.
ARG SOURCE_REF=main
ARG BUILD_VERSION
RUN apk add --no-cache git
WORKDIR /app
RUN echo "HomeTwin3D ${BUILD_VERSION} from ${SOURCE_REF}" \
 && git clone --filter=blob:none https://github.com/Raza55/HomeTwin3D.git . \
 && git checkout --quiet "${SOURCE_REF}"
RUN npm ci
ENV NODE_OPTIONS="--max-old-space-size=4096"
# Behind an HTTPS reverse proxy the app reaches HA through /ha-ws (nginx.conf).
# No service worker: a cached app shell kept wall tablets on old versions.
ENV VITE_HA_WS_PROXY=1 HOMETWIN_NO_SERVICE_WORKER=1
RUN npm run build -- --mode addon

# Stage 2: serve with nginx on the HA base image of the target architecture.
FROM ghcr.io/home-assistant/${BUILD_ARCH}-base:3.20

RUN apk add --no-cache nginx

COPY --from=builder /app/dist /var/www/html
COPY nginx.conf /etc/nginx/http.d/default.conf
RUN touch /etc/nginx/hometwin-pin.map
COPY run.sh /etc/services.d/nginx/run
RUN chmod +x /etc/services.d/nginx/run
