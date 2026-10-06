#!/usr/bin/with-contenv bashio

# Calendar API (calendar-api.mjs). Without a token of at least 16 characters it only
# answers "disabled"; the token never leaves the container.
TOKEN="$(bashio::config 'calendar_api_token')"
if [[ "${TOKEN}" == "null" || ${#TOKEN} -lt 16 ]]; then
    [[ -n "${TOKEN}" && "${TOKEN}" != "null" ]] && bashio::log.warning "calendar_api_token ignored: use at least 16 characters"
    TOKEN=""
    bashio::log.info "Calendar API: disabled (no calendar_api_token)"
else
    bashio::log.info "Calendar API: enabled at /api/calendar"
fi
DEFAULT="$(bashio::config 'calendar_api_default')"
[[ "${DEFAULT}" == "null" ]] && DEFAULT=""

export CALENDAR_API_TOKEN="${TOKEN}" CALENDAR_API_DEFAULT="${DEFAULT}"
exec node --experimental-websocket /opt/hometwin/calendar-api.mjs
