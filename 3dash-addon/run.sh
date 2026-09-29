#!/usr/bin/with-contenv bashio

# Shared installation storage (see nginx.conf). The PIN never leaves the container.
mkdir -p /data/shared/objects /data/shared-tmp
chown -R nginx:nginx /data/shared /data/shared-tmp
PIN="$(bashio::config 'write_pin')"
if [[ "${PIN}" =~ ^[A-Za-z0-9._-]{4,64}$ ]]; then
    echo "\"${PIN}\" 1;" > /etc/nginx/hometwin-pin.map
    bashio::log.info "Shared installation: writing enabled with PIN"
else
    : > /etc/nginx/hometwin-pin.map
    if [[ -n "${PIN}" && "${PIN}" != "null" ]]; then
        bashio::log.warning "write_pin ignored: use 4-64 characters (A-Z a-z 0-9 . _ -)"
    fi
    bashio::log.info "Shared installation: read-only (no write_pin)"
fi

exec nginx -g "daemon off;"
