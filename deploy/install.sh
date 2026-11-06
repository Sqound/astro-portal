#!/bin/sh
# One checkout, one private data folder. No host Node or npm is needed.
set -eu
umask 077
fail() { printf '%s\n' "$*" >&2; exit 1; }
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
port=$(sed -n 's/^[[:space:]]*PORT=\([0-9][0-9]*\).*/\1/p' "$repo/apps/portal-oss/Dockerfile")
data_dir=$HOME/astro-portal-data
yes=0
sample=1
port_set=0
dir_set=0
bind_address=0.0.0.0
bind_set=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) [ "$#" -ge 2 ] || fail '--port requires a value.'; port=$2; port_set=1; shift 2 ;;
    --data-dir) [ "$#" -ge 2 ] || fail '--data-dir requires a value.'; data_dir=$2; dir_set=1; shift 2 ;;
    --bind-address) [ "$#" -ge 2 ] || fail '--bind-address requires a value.'; bind_address=$2; bind_set=1; shift 2 ;;
    --yes) yes=1; shift ;;
    --no-sample) sample=0; shift ;;
    --help) printf '%s\n' 'Usage: sh deploy/install.sh [--port PORT] [--data-dir DIR] [--bind-address ADDRESS] [--yes] [--no-sample]'; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
command -v docker >/dev/null 2>&1 || fail 'Docker is missing; install Docker and its Compose plugin.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose plugin is missing; install the Compose plugin.'
if [ "$yes" -eq 0 ]; then
  if [ "$port_set" -eq 0 ]; then
    printf 'Port [%s]: ' "$port"
    IFS= read -r answer || fail 'No port answer; use --yes for defaults.'
    port=${answer:-$port}
  fi
  if [ "$dir_set" -eq 0 ]; then
    printf 'Data folder [%s]: ' "$data_dir"
    IFS= read -r answer || fail 'No data folder answer; use --yes for defaults.'
    data_dir=${answer:-$data_dir}
  fi
  if [ "$bind_set" -eq 0 ] && [ ! -e "$data_dir/portal.env" ]; then
    printf 'Address the port is published on, 127.0.0.1 behind a tunnel or a reverse proxy [%s]: ' "$bind_address"
    IFS= read -r answer || fail 'No address answer; use --yes for defaults.'
    bind_address=${answer:-$bind_address}
  fi
fi
case "$bind_address" in
  *[!0-9.]*|'') fail 'The address must be an IPv4 address such as 0.0.0.0 or 127.0.0.1.' ;;
esac
case "$port" in ''|*[!0-9]*) fail 'Port must be an integer from 1 to 65535.' ;; esac
[ "${#port}" -le 5 ] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail 'Port must be an integer from 1 to 65535.'
case "$data_dir" in
  ''|*"'"*|*'
'*) fail 'Data folder must be nonempty and contain no single quote or newline.' ;;
esac
mkdir -p "$data_dir"
data_dir=$(CDPATH= cd -- "$data_dir" && pwd -P)
case "$data_dir/" in "$repo/"*) fail 'Data folder must be outside the checkout.' ;; esac
env_file=$data_dir/portal.env
created=0
if [ -e "$env_file" ]; then
  printf '%s\n' 'Reusing the existing environment file; secrets and settings are unchanged.'
else
  command -v openssl >/dev/null 2>&1 || fail 'OpenSSL is missing; install OpenSSL to generate secrets.'
  sign_in_key=$(openssl rand -base64 32)
  bootstrap_secret=$(openssl rand -base64 32)
  postgres_password=$(openssl rand -hex 32)
  # Noclobber also prevents a concurrent installer from overwriting secrets.
  (set -C; cat > "$env_file" <<ENV
ASTRO_PORTAL_DATA_DIR='$data_dir'
ASTRO_PORTAL_UID=$(id -u)
ASTRO_PORTAL_GID=$(id -g)
PORT=$port
ASTRO_PORTAL_AUTH_MODE=password
ASTRO_PORTAL_SIGN_IN_KEY=$sign_in_key
ASTRO_PORTAL_BOOTSTRAP_SECRET=$bootstrap_secret
POSTGRES_PASSWORD=$postgres_password
ENV
  if [ "$bind_address" != 0.0.0.0 ]; then printf 'ASTRO_PORTAL_BIND_ADDRESS=%s\n' "$bind_address" >> "$env_file"; fi
  ) || fail 'Could not create the environment file; rerun to reuse an existing file.'
  created=1
fi
chmod 600 "$env_file"
port=$(sed -n 's/^PORT=//p' "$env_file")
case "$port" in ''|*[!0-9]*) fail 'Existing environment file has an invalid PORT.' ;; esac
mkdir -p "$data_dir/portal/next-cache" "$data_dir/postgres"
# The commit the image is built from, shown in the footer; empty without git.
build_id=$(git -C "$repo" rev-parse --short=9 HEAD 2>/dev/null || true)
case "$build_id" in ''|*[!0-9a-f]*) build_id= ;; *) build_id=sha-$build_id ;; esac
compose() (
  # An unrelated exported setting must not override this installation's private file.
  unset PORT ASTRO_PORTAL_DATA_DIR ASTRO_PORTAL_UID ASTRO_PORTAL_GID POSTGRES_PASSWORD ASTRO_PORTAL_SIGN_IN_KEY ASTRO_PORTAL_BOOTSTRAP_SECRET ASTRO_PORTAL_BIND_ADDRESS ASTRO_PORTAL_AUTH_MODE
  ASTRO_PORTAL_BUILD_ID=$build_id
  export ASTRO_PORTAL_BUILD_ID
  docker compose --project-directory "$repo" --env-file "$env_file" -f "$repo/compose.yaml" "$@"
)
compose up -d --build
attempt=0
until compose exec -T portal node -e "fetch('http://127.0.0.1:8787/api/v1/service').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || fail 'Portal did not become ready; inspect docker compose logs.'
  sleep 2
done
printf 'Portal: http://localhost:%s\nOwner setup: http://localhost:%s/auth/bootstrap\n' "$port" "$port"
if [ "$created" -eq 1 ]; then
  printf 'Bootstrap secret (shown once): %s\n' "$bootstrap_secret"
else
  printf 'The bootstrap secret is in the private environment file: %s\n' "$env_file"
fi
sample_command() {
  # The helper reads the container environment, keeping the database secret off the command line.
  printf "docker compose --project-directory '%s' --env-file '%s' -f '%s/compose.yaml' exec -T portal node deploy/install-sample.mjs\n" "$repo" "$env_file" "$repo"
}
if [ "$sample" -eq 1 ]; then
  if [ "$yes" -eq 1 ]; then
    printf '%s\n' 'After the owner signs in, run the sample command (records and pack must be published):'
  else
    printf '%s' "Press Enter when the owner's account exists: "
    IFS= read -r answer || fail 'Owner setup was not confirmed; run the sample command later.'
    compose exec -T portal node deploy/install-sample.mjs
    printf '%s\n' 'Sample command to run later if needed:'
  fi
  sample_command
fi
