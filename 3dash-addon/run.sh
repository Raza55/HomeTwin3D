#!/usr/bin/with-contenv bashio

# Shared installation storage (see nginx.conf) in the add-on config folder
# (/config = addon_configs/<slug> on the host, reachable through the Samba
# share for the initial import). Data of versions before 0.4.0 moves over once.
# The PIN never leaves the container.
if [[ -d /data/shared && ! -e /config/shared/state.json ]]; then
    mkdir -p /config/shared
    cp -a /data/shared/. /config/shared/ && rm -rf /data/shared
    bashio::log.info "Shared installation moved to the add-on config folder"
fi
mkdir -p /config/shared/objects /config/shared-tmp
chown -R nginx:nginx /config/shared /config/shared-tmp
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
