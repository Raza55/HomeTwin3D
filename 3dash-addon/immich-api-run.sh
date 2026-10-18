#!/usr/bin/with-contenv bashio
# Do not log credentials or private server/album details.
IMMICH_URL="$(bashio::config 'immich_url')"
IMMICH_API_KEY="$(bashio::config 'immich_api_key')"
IMMICH_ALBUM_ID="$(bashio::config 'immich_album_id')"
[[ "${IMMICH_URL}" == "null" ]] && IMMICH_URL=""
[[ "${IMMICH_API_KEY}" == "null" ]] && IMMICH_API_KEY=""
[[ "${IMMICH_ALBUM_ID}" == "null" ]] && IMMICH_ALBUM_ID=""
export IMMICH_URL IMMICH_API_KEY IMMICH_ALBUM_ID
exec node /opt/hometwin/immich-api.mjs
