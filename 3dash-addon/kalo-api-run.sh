#!/usr/bin/with-contenv bashio

# KALO consumption bridge (kalo-api.mjs). Without username, password and the apartment
# identifiers it only answers "not_configured"; the credentials never leave the
# container. For each (cached) fetch the service logs in to the portal itself.
USERNAME="$(bashio::config 'kalo_username')"
PASSWORD="$(bashio::config 'kalo_password')"
RESIDENT="$(bashio::config 'kalo_resident_id')"
BILLING="$(bashio::config 'kalo_billing_unit')"
OCCUPANCY="$(bashio::config 'kalo_occupancy_id')"
RESIDENTIAL="$(bashio::config 'kalo_residential_unit')"

for name in USERNAME PASSWORD RESIDENT BILLING OCCUPANCY RESIDENTIAL; do
    value="${!name}"
    [[ "${value}" == "null" ]] && printf -v "${name}" '%s' ''
done
[[ -z "${RESIDENTIAL}" ]] && RESIDENTIAL="8"

if [[ -z "${USERNAME}" || -z "${PASSWORD}" || -z "${RESIDENT}" || -z "${BILLING}" || -z "${OCCUPANCY}" ]]; then
    bashio::log.info "KALO API: disabled (set kalo_username, kalo_password, kalo_resident_id, kalo_billing_unit and kalo_occupancy_id)"
else
    bashio::log.info "KALO API: enabled at /api/kalo"
fi

export KALO_USERNAME="${USERNAME}" KALO_PASSWORD="${PASSWORD}" KALO_RESIDENT_ID="${RESIDENT}" \
    KALO_BILLING_UNIT="${BILLING}" KALO_OCCUPANCY_ID="${OCCUPANCY}" KALO_RESIDENTIAL_UNIT="${RESIDENTIAL}"
exec node /opt/hometwin/kalo-api.mjs
