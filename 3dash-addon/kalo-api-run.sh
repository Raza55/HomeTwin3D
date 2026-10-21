#!/usr/bin/with-contenv bashio

# KALO consumption bridge (kalo-api.mjs). Without a refresh token and the apartment
# identifiers it only answers "not_configured"; the credentials never leave the
# container. The configured token seeds the first run; the rotated one is kept in
# /config/shared/kalo-token.json afterwards.
TOKEN="$(bashio::config 'kalo_refresh_token')"
RESIDENT="$(bashio::config 'kalo_resident_id')"
BILLING="$(bashio::config 'kalo_billing_unit')"
OCCUPANCY="$(bashio::config 'kalo_occupancy_id')"
RESIDENTIAL="$(bashio::config 'kalo_residential_unit')"

for name in TOKEN RESIDENT BILLING OCCUPANCY RESIDENTIAL; do
    value="${!name}"
    [[ "${value}" == "null" ]] && printf -v "${name}" '%s' ''
done
[[ -z "${RESIDENTIAL}" ]] && RESIDENTIAL="8"

if [[ -z "${TOKEN}" || -z "${RESIDENT}" || -z "${BILLING}" || -z "${OCCUPANCY}" ]]; then
    bashio::log.info "KALO API: disabled (set kalo_refresh_token, kalo_resident_id, kalo_billing_unit and kalo_occupancy_id)"
else
    bashio::log.info "KALO API: enabled at /api/kalo"
fi

export KALO_REFRESH_TOKEN="${TOKEN}" KALO_RESIDENT_ID="${RESIDENT}" KALO_BILLING_UNIT="${BILLING}" \
    KALO_OCCUPANCY_ID="${OCCUPANCY}" KALO_RESIDENTIAL_UNIT="${RESIDENTIAL}" \
    KALO_TOKEN_STORE="/config/shared/kalo-token.json"
exec node /opt/hometwin/kalo-api.mjs
