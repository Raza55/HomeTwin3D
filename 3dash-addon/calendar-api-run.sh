#!/usr/bin/with-contenv bashio

# Calendar API (calendar-api.mjs). Without tokens of at least 16 characters it only
# answers "disabled"; the tokens never leave the container.
TOKEN="$(bashio::config 'calendar_api_token')"
if [[ "${TOKEN}" == "null" || ${#TOKEN} -lt 16 ]]; then
    [[ -n "${TOKEN}" && "${TOKEN}" != "null" ]] && bashio::log.warning "calendar_api_token ignored: use at least 16 characters"
    TOKEN=""
    bashio::log.info "Calendar API: disabled (no calendar_api_token)"
else
    bashio::log.info "Calendar API: enabled at /api/calendar"
fi
FEED="$(bashio::config 'calendar_feed_token')"
if [[ "${FEED}" == "null" || ${#FEED} -lt 16 ]]; then
    [[ -n "${FEED}" && "${FEED}" != "null" ]] && bashio::log.warning "calendar_feed_token ignored: use at least 16 characters"
    FEED=""
else
    bashio::log.info "Calendar feed: enabled at /api/calendar/feed.ics"
fi
DEFAULT="$(bashio::config 'calendar_api_default')"
[[ "${DEFAULT}" == "null" ]] && DEFAULT=""

export CALENDAR_API_TOKEN="${TOKEN}" CALENDAR_FEED_TOKEN="${FEED}" CALENDAR_API_DEFAULT="${DEFAULT}"
exec node --experimental-websocket /opt/hometwin/calendar-api.mjs
