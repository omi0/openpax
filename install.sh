#!/usr/bin/env bash
# OpenPax installer. One line to a running instance:
#
#   curl -fsSL https://raw.githubusercontent.com/omi0/openpax/main/install.sh | bash
#
# It checks Docker (and offers to install it on Linux), asks where OpenPax
# will be reached, generates the secrets, writes a folder with the
# configuration and starts the containers. Nothing changes on the machine
# before you confirm. Run it again on an existing installation to update it:
# the configuration is kept, the helper files are refreshed and the newest
# image is pulled.
#
# Every question can be answered up front for scripted installs:
#   OPENPAX_DIR      install folder (default: /opt/openpax as root, ~/openpax otherwise)
#   OPENPAX_DOMAIN   domain for automatic HTTPS, e.g. bookings.example.com (empty: plain HTTP)
#   OPENPAX_URL      address to use without a domain (default: http://<this machine>:3000)
#   OPENPAX_PORT     port without a domain (default: 3000)
#   OPENPAX_YES=1    do not ask, take the defaults and start
# and a few for forks and testing:
#   OPENPAX_IMAGE    image (default: ghcr.io/omi0/openpax), OPENPAX_TAG (default: latest)
#   OPENPAX_RAW_URL  where the deploy/ files are downloaded from, OPENPAX_REF (default: main)
#   OPENPAX_PULL=0   do not pull the image (use one built locally)
#   OPENPAX_HTTP_PORT, OPENPAX_HTTPS_PORT   Caddy's ports (default: 80 and 443)

[ -n "${BASH_VERSION:-}" ] || { echo "Run this with bash:  curl -fsSL https://raw.githubusercontent.com/omi0/openpax/main/install.sh | bash" >&2; exit 1; }
set -euo pipefail

REPO="omi0/openpax"
RAW_URL="${OPENPAX_RAW_URL:-https://raw.githubusercontent.com/$REPO/${OPENPAX_REF:-main}}"
IMAGE="${OPENPAX_IMAGE:-ghcr.io/$REPO}"
TAG="${OPENPAX_TAG:-latest}"

SUDO=""
ADDED_TO_DOCKER_GROUP=0
UPDATED=0
OS=$(uname -s)
ASK=1
[ "${OPENPAX_YES:-0}" = 1 ] && ASK=0
(: < /dev/tty) 2>/dev/null || ASK=0

if [ -t 1 ]; then
  BOLD=$'\033[1m' GREEN=$'\033[1;32m' YELLOW=$'\033[1;33m' RED=$'\033[1;31m' RESET=$'\033[0m'
else
  BOLD="" GREEN="" YELLOW="" RED="" RESET=""
fi

say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==>%s %s%s%s\n' "$GREEN" "$RESET" "$BOLD" "$*" "$RESET"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

# ask "question" "default" → REPLY. Reads the terminal directly, because with
# `curl | bash` stdin is the script itself.
ask() {
  local prompt=$1 default=${2:-}
  REPLY=$default
  [ "$ASK" = 1 ] || return 0
  if [ -n "$default" ]; then printf '%s [%s]: ' "$prompt" "$default" > /dev/tty
  else printf '%s: ' "$prompt" > /dev/tty; fi
  IFS= read -r REPLY < /dev/tty || REPLY=$default
  [ -n "$REPLY" ] || REPLY=$default
}

# confirm "question" [y|n]: the default answer is taken when nobody can answer.
confirm() {
  local default=${2:-y} hint="Y/n" answer
  [ "$default" = y ] || hint="y/N"
  if [ "$ASK" != 1 ]; then [ "$default" = y ]; return; fi
  printf '%s [%s] ' "$1" "$hint" > /dev/tty
  IFS= read -r answer < /dev/tty || answer=
  [ -n "$answer" ] || answer=$default
  case $answer in y|Y|yes|Yes|YES) return 0 ;; *) return 1 ;; esac
}

have() { command -v "$1" >/dev/null 2>&1; }

fetch() { # fetch URL FILE
  if have curl; then curl -fsSL --retry 3 "$1" -o "$2"
  elif have wget; then wget -qO "$2" "$1"
  else die "curl or wget is needed to download files."; fi
}

fetch_text() { # fetch_text URL → stdout, empty on failure
  if have curl; then curl -fsS --max-time 5 "$1" 2>/dev/null || true
  elif have wget; then wget -qO- --timeout=5 "$1" 2>/dev/null || true; fi
}

need_sudo() {
  [ "$(id -u)" = 0 ] && return 0
  have sudo || die "Administrator rights are needed for this step. Run the installer as root, or install sudo."
  SUDO="sudo"
  say "Administrator rights are needed; sudo may ask for your password."
}

# ---------------------------------------------------------------- Docker

install_docker_linux() {
  say "OpenPax runs in Docker, which is not installed on this machine."
  say "The official Docker install script (get.docker.com) can set it up now."
  say "It needs administrator rights and takes about a minute."
  confirm "Install Docker now?" y || die "Install Docker first (https://docs.docker.com/engine/install/), then run this command again."
  need_sudo
  local script
  script=$(mktemp)
  fetch https://get.docker.com "$script" || die "Could not download the Docker install script. Is the machine online?"
  $SUDO sh "$script" < /dev/null || die "The Docker installation failed; the message above says why. See https://docs.docker.com/engine/install/"
  rm -f "$script"
  if [ -n "$SUDO" ]; then
    $SUDO usermod -aG docker "${USER:-$(id -un)}" 2>/dev/null && ADDED_TO_DOCKER_GROUP=1
  fi
}

ensure_docker() {
  step "Checking Docker"
  if ! have docker; then
    case $OS in
      Linux) install_docker_linux ;;
      Darwin) die "Install Docker Desktop (https://docs.docker.com/desktop/setup/install/mac-install/) or OrbStack, open it once, then run this command again." ;;
      *) die "OpenPax installs on Linux and macOS. On Windows, run this inside Ubuntu on WSL2 with Docker Desktop." ;;
    esac
  fi
  if ! docker info >/dev/null 2>&1; then
    if [ "$OS" = Darwin ]; then
      die "Docker is installed but not running. Open Docker Desktop (or OrbStack), wait until it is ready, then run this command again."
    fi
    if [ "$(id -u)" != 0 ] && have sudo; then
      need_sudo
      sudo docker info >/dev/null 2>&1 || die "Docker is installed but not reachable, even as root. Is the service running? Try: sudo systemctl start docker"
    else
      die "Docker is installed but not reachable. Is the service running? Try: systemctl start docker"
    fi
  fi
  $SUDO docker compose version >/dev/null 2>&1 || die "This Docker has no 'docker compose' command. Install a current Docker: https://docs.docker.com/engine/install/"
  say "Docker $($SUDO docker version --format '{{.Server.Version}}' 2>/dev/null || echo '') is ready."
}

compose() { (cd "$DIR" && $SUDO docker compose "$@"); }

# ---------------------------------------------------------------- machine facts

# Pipelines below may fail on purpose (no route, unknown host): `|| true` keeps
# `set -e -o pipefail` from ending the script on them.
local_ip() {
  local ip=""
  case $OS in
    Linux)
      ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}' || true)
      [ -n "$ip" ] || ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
      ;;
    Darwin)
      ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
      ;;
  esac
  printf '%s' "${ip:-localhost}"
}

public_ip() {
  local ip
  ip=$(fetch_text https://api.ipify.org)
  [ -n "$ip" ] || ip=$(fetch_text https://checkip.amazonaws.com)
  printf '%s' "$ip" | tr -d '[:space:]'
}

resolve() {
  if have getent; then getent ahostsv4 "$1" 2>/dev/null | awk '{print $1; exit}' || true
  elif have dscacheutil; then dscacheutil -q host -a name "$1" 2>/dev/null | awk '/^ip_address/ {print $2; exit}' || true
  elif have dig; then dig +short A "$1" 2>/dev/null | grep -E '^[0-9.]+$' | head -n 1 || true
  fi
}

port_in_use() {
  if have ss; then [ -n "$(ss -Hltn "sport = :$1" 2>/dev/null || true)" ]
  elif have lsof; then lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else return 1; fi
}

rand_b64() { # 32 random bytes, base64 (44 chars)
  if have openssl; then openssl rand -base64 32
  else head -c 32 /dev/urandom | base64; fi | tr -d '\n'
}

rand_hex() { # 24 random bytes as hex: safe inside a connection string
  if have openssl; then openssl rand -hex 24
  else od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; fi
}

env_get() { sed -n "s/^$1=//p" "$DIR/.env" | tail -n 1; }

# ---------------------------------------------------------------- questions

choose_dir() {
  if [ "$(id -u)" = 0 ]; then DIR=${OPENPAX_DIR:-/opt/openpax}; else DIR=${OPENPAX_DIR:-$HOME/openpax}; fi
  if [ -z "${OPENPAX_DIR:-}" ]; then
    step "Where to install"
    say "The configuration, the secrets and the backups go in one folder."
    ask "Folder" "$DIR"
    DIR=${REPLY/#\~/$HOME}
  fi
  case $DIR in /*) ;; *) DIR="$PWD/$DIR" ;; esac
  mkdir -p "$DIR" 2>/dev/null || die "Cannot create $DIR. Pick a folder you can write to, or run the installer as root."
  [ -w "$DIR" ] || die "Cannot write to $DIR."
}

valid_domain() {
  [[ $1 =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]
}

choose_address() {
  step "How will people reach OpenPax?"
  say "With a domain name that points at this machine (for example bookings.myrestaurant.it)"
  say "OpenPax gets HTTPS on its own, which guests need to book online."
  say "Leave it empty for a phone-only instance on your local network: it then answers"
  say "on http://<this machine>:${OPENPAX_PORT:-3000}."
  DOMAIN=$(printf '%s' "${OPENPAX_DOMAIN:-}" | tr 'A-Z' 'a-z')
  if [ -z "${OPENPAX_DOMAIN+set}" ]; then
    while :; do
      ask "Domain (empty for none)" ""
      DOMAIN=$(printf '%s' "$REPLY" | tr 'A-Z' 'a-z' | sed -e 's#^https\{0,1\}://##' -e 's#/.*$##' -e 's/[[:space:]]//g')
      [ -z "$DOMAIN" ] && break
      valid_domain "$DOMAIN" && break
      say "That does not look like a domain name. Type it like bookings.example.com, or leave it empty."
      [ "$ASK" = 1 ] || die "invalid domain: $DOMAIN"
    done
  elif [ -n "$DOMAIN" ] && ! valid_domain "$DOMAIN"; then
    die "OPENPAX_DOMAIN does not look like a domain name: $DOMAIN"
  fi

  HTTP_PORT=${OPENPAX_HTTP_PORT:-80}
  HTTPS_PORT=${OPENPAX_HTTPS_PORT:-443}
  PORT=${OPENPAX_PORT:-3000}

  if [ -n "$DOMAIN" ]; then
    PUBLIC_URL="https://$DOMAIN"
    local busy=""
    port_in_use "$HTTP_PORT" && busy="$HTTP_PORT"
    port_in_use "$HTTPS_PORT" && busy="${busy:+$busy and }$HTTPS_PORT"
    if [ -n "$busy" ]; then
      die "Port $busy is already used by another program on this machine (a web server such as Apache or Nginx?). Stop it, or install without a domain and put OpenPax behind that server: see the README, 'HTTPS and reverse proxy'."
    fi
    check_dns
  else
    if port_in_use "$PORT"; then
      say "Port $PORT is already in use on this machine."
      ask "Port for OpenPax" "$((PORT + 1))"
      PORT=$REPLY
      [[ $PORT =~ ^[0-9]+$ ]] || die "not a port number: $PORT"
    fi
    PUBLIC_URL=${OPENPAX_URL:-http://$(local_ip):$PORT}
    if [ -z "${OPENPAX_URL:-}" ]; then
      say ""
      say "Without a domain, staff open OpenPax at an address on your network."
      say "Keep the suggestion unless this machine has a name people use (for example http://kitchen-pc:$PORT)."
      ask "Address" "$PUBLIC_URL"
      PUBLIC_URL=${REPLY%/}
    fi
    case $PUBLIC_URL in http://*|https://*) ;; *) die "The address must start with http:// or https://: $PUBLIC_URL" ;; esac
  fi
}

check_dns() {
  local resolved mine
  resolved=$(resolve "$DOMAIN")
  mine=$(public_ip)
  if [ -z "$resolved" ]; then
    warn "$DOMAIN does not resolve yet. Create an A record for it pointing at this machine${mine:+ ($mine)}: HTTPS starts working as soon as it does."
  elif [ -n "$mine" ] && [ "$resolved" != "$mine" ]; then
    warn "$DOMAIN points at $resolved, but this machine's public address is $mine. Fix the A record (or the port forwarding), or HTTPS will not work."
  else
    say "$DOMAIN points at this machine."
    return 0
  fi
  if [ "$ASK" = 1 ] && ! confirm "Continue anyway?" n; then
    die "Stopped. Run the installer again when the domain points here."
  fi
}

# ---------------------------------------------------------------- files

write_env() {
  local pg_password auth_secret encryption_key today
  pg_password=$(rand_hex)
  auth_secret=$(rand_b64)
  encryption_key=$(rand_b64)
  today=$(date +%Y-%m-%d)
  : > "$DIR/.env"
  chmod 600 "$DIR/.env"
  {
    say "# OpenPax configuration, written by install.sh on $today."
    say "# Back this file up together with the database: APP_ENCRYPTION_KEY cannot be"
    say "# recovered, and without it the stored provider credentials cannot be read."
    say "# Every setting: https://github.com/$REPO#configuration"
    say ""
    say "# The address guests and staff use."
    say "PUBLIC_URL=$PUBLIC_URL"
    if [ -n "$DOMAIN" ]; then
      say "# Caddy answers on ports $HTTP_PORT and $HTTPS_PORT for this domain and handles HTTPS."
      say "OPENPAX_DOMAIN=$DOMAIN"
      say "COMPOSE_PROFILES=https"
      say "HTTP_PORT=$HTTP_PORT"
      say "HTTPS_PORT=$HTTPS_PORT"
      say "TRUST_PROXY=true"
      say "# The app itself is only reachable from this machine; Caddy sits in front."
      say "BIND_IP=127.0.0.1"
      say "PORT=$PORT"
    else
      say "# No domain: plain HTTP on this port, on every network interface of the machine."
      say "OPENPAX_DOMAIN="
      say "COMPOSE_PROFILES="
      say "BIND_IP=0.0.0.0"
      say "PORT=$PORT"
      say "# Browsers need this to keep you signed in over plain HTTP."
      say "SECURE_COOKIES=false"
    fi
    say ""
    say "# Email fallback for password resets and invitations when a restaurant has not"
    say "# set up its own provider in Settings → Notifications."
    say "# SMTP_URL=smtp://user:password@smtp.example.com:587"
    say "# SMTP_FROM=OpenPax <no-reply@example.com>"
    say ""
    say "# Secrets, generated at install."
    say "POSTGRES_PASSWORD=$pg_password"
    say "BETTER_AUTH_SECRET=$auth_secret"
    say "APP_ENCRYPTION_KEY=$encryption_key"
    say ""
    say "# Which image to run; 'openpax update' pulls the newest build of this tag."
    say "OPENPAX_IMAGE=$IMAGE"
    say "OPENPAX_TAG=$TAG"
  } >> "$DIR/.env"
}

download() { # download NAME: deploy/NAME → $DIR/NAME, replaced only when the download succeeded
  local tmp="$DIR/.$1.download"
  fetch "$RAW_URL/deploy/$1" "$tmp" || { rm -f "$tmp"; die "Could not download $1 from $RAW_URL/deploy/"; }
  mv "$tmp" "$DIR/$1"
}

write_files() {
  download docker-compose.yml
  download Caddyfile
  download openpax
  chmod +x "$DIR/openpax"
  HELPER="$DIR/openpax"
  if [ "$(id -u)" = 0 ] && [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
    ln -sf "$DIR/openpax" /usr/local/bin/openpax && HELPER="openpax"
  fi
}

# ---------------------------------------------------------------- start

wait_for_app() {
  local host=$1 i=0
  [ "$host" != "0.0.0.0" ] || host=127.0.0.1
  while [ $i -lt 60 ]; do
    if fetch_text "http://$host:$PORT/api/health" | grep -q '"ok":true'; then return 0; fi
    sleep 2; i=$((i + 1))
  done
  return 1
}

start_stack() {
  if [ "${OPENPAX_PULL:-1}" != 0 ]; then
    step "Downloading OpenPax ($IMAGE:$TAG)"
    compose pull || die "Could not pull the image. Is the machine online? If the image name is wrong, fix OPENPAX_IMAGE and OPENPAX_TAG in $DIR/.env and run '$HELPER start'."
  fi
  step "Starting"
  compose up -d --remove-orphans || die "Docker could not start the containers; the message above says why."
  if ! wait_for_app "$(env_get BIND_IP)"; then
    compose logs --tail 40 app || true
    die "The app did not answer within two minutes. The last log lines are above; '$HELPER logs' shows more."
  fi
}

summary() {
  if [ "$UPDATED" = 1 ]; then
    step "OpenPax is up to date and running"
    say ""
    say "  Address: ${BOLD}$PUBLIC_URL${RESET}"
  else
    step "OpenPax is running"
    say ""
    say "  Open ${BOLD}$PUBLIC_URL${RESET} and create your account: the first one becomes the owner,"
    say "  and the setup guide takes it from there. Colleagues join through invitations."
  fi
  if [ -n "$DOMAIN" ] && [ "$UPDATED" != 1 ]; then
    say ""
    say "  The HTTPS certificate is requested on first contact, so give the first page a minute."
    say "  If your hosting provider has a firewall, open ports $HTTP_PORT and $HTTPS_PORT."
  fi
  say ""
  say "  Everything lives in $DIR:"
  say "    .env     settings and secrets. Back it up: the encryption key cannot be recovered."
  say "    openpax  the helper: ${BOLD}$HELPER update${RESET} pulls the newest version,"
  say "             ${BOLD}$HELPER backup${RESET} saves the database, also logs, status, stop, start."
  if [ "$ADDED_TO_DOCKER_GROUP" = 1 ]; then
    say ""
    say "  Docker needed sudo this time; after you log out and in again it will not."
  elif [ -n "$SUDO" ]; then
    say ""
    say "  Docker needs sudo for your user on this machine; the helper takes care of it."
  fi
  say ""
  say "  Docs: https://github.com/$REPO#self-hosting"
  say ""
}

main() {
  say ""
  say "${BOLD}OpenPax installer${RESET}"
  say "Restaurant bookings you host yourself. This sets up OpenPax in Docker on this machine."
  [ "$ASK" = 1 ] || say "(no terminal to ask questions on: taking the defaults)"

  ensure_docker
  choose_dir

  if [ -f "$DIR/.env" ]; then
    step "Existing installation in $DIR"
    say "The configuration in .env is kept. The compose file and the helper are refreshed"
    say "and the newest image is pulled."
    confirm "Update it now?" y || die "Nothing changed."
    UPDATED=1
    DOMAIN=$(env_get OPENPAX_DOMAIN)
    PUBLIC_URL=$(env_get PUBLIC_URL)
    PORT=$(env_get PORT); PORT=${PORT:-3000}
    HTTP_PORT=$(env_get HTTP_PORT); HTTP_PORT=${HTTP_PORT:-80}
    HTTPS_PORT=$(env_get HTTPS_PORT); HTTPS_PORT=${HTTPS_PORT:-443}
    IMAGE=$(env_get OPENPAX_IMAGE); IMAGE=${IMAGE:-ghcr.io/$REPO}
    TAG=$(env_get OPENPAX_TAG); TAG=${TAG:-latest}
    write_files
    start_stack
    summary
    return 0
  fi

  choose_address

  step "Ready to install"
  say "  Folder:   $DIR"
  if [ -n "$DOMAIN" ]; then
    say "  Address:  $PUBLIC_URL (HTTPS through Caddy on ports $HTTP_PORT and $HTTPS_PORT)"
  else
    say "  Address:  $PUBLIC_URL (plain HTTP, no domain)"
  fi
  say "  Image:    $IMAGE:$TAG"
  say "  Postgres runs in a container next to the app; the data stays in a Docker volume."
  confirm "Start the installation?" y || die "Nothing changed."

  step "Writing the configuration"
  write_env
  write_files
  say "Secrets generated, files written to $DIR."

  start_stack
  summary
}

main "$@"
