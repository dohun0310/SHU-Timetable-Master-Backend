#!/bin/sh
set -eu

: "${RELEASE_IMAGE:?RELEASE_IMAGE is required}"

CONTAINER_NAME="${CONTAINER_NAME:-shu-timetable-master-backend}"
CANDIDATE_NAME="${CANDIDATE_NAME:-${CONTAINER_NAME}-candidate}"
ROLLBACK_NAME="${ROLLBACK_NAME:-${CONTAINER_NAME}-rollback}"
HOST_PORT="${HOST_PORT:-8971}"
CONTAINER_PORT="${CONTAINER_PORT:-3000}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-30}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"

if [ -n "${APP_ENV_FILE:-}" ] && [ ! -r "$APP_ENV_FILE" ]; then
  printf 'Environment file is not readable: %s\n' "$APP_ENV_FILE" >&2
  exit 1
fi

wait_for_health() {
  container="$1"
  attempt=1

  while [ "$attempt" -le "$HEALTH_ATTEMPTS" ]; do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container" 2>/dev/null || true)"

    case "$status" in
      healthy)
        return 0
        ;;
      unhealthy|missing)
        return 1
        ;;
    esac

    sleep "$HEALTH_INTERVAL"
    attempt=$((attempt + 1))
  done

  return 1
}

run_container() {
  name="$1"
  image="$2"
  publish_port="$3"
  restart_policy="$4"

  set -- docker run --pull never -d --name "$name" --restart "$restart_policy"

  if [ -n "${APP_ENV_FILE:-}" ]; then
    set -- "$@" --env-file "$APP_ENV_FILE"
  fi

  if [ "$publish_port" = true ]; then
    set -- "$@" -p "127.0.0.1:${HOST_PORT}:${CONTAINER_PORT}"
  fi

  set -- "$@" -e "PORT=${CONTAINER_PORT}" "$image"
  "$@" >/dev/null
}

show_logs() {
  docker logs "$1" 2>&1 || true
}

smoke_test() {
  docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true
  trap 'docker rm -f "$CANDIDATE_NAME" >/dev/null 2>&1 || true' EXIT HUP INT TERM

  run_container "$CANDIDATE_NAME" "$RELEASE_IMAGE" false no

  if ! wait_for_health "$CANDIDATE_NAME"; then
    show_logs "$CANDIDATE_NAME"
    return 1
  fi

  printf 'Smoke test passed: %s\n' "$RELEASE_IMAGE"
}

restore_previous_container() {
  trap - EXIT HUP INT TERM

  if [ "${deployment_started:-false}" = true ]; then
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi

  if [ "${has_previous:-false}" != true ] \
    || ! docker inspect "$ROLLBACK_NAME" >/dev/null 2>&1; then
    return 0
  fi

  printf 'Restoring previous container: %s\n' "$ROLLBACK_NAME" >&2

  if ! docker rename "$ROLLBACK_NAME" "$CONTAINER_NAME"; then
    printf 'Previous container rename failed: %s\n' "$ROLLBACK_NAME" >&2
    return 1
  fi

  if [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" != true ]; then
    if ! docker start "$CONTAINER_NAME" >/dev/null; then
      printf 'Previous container start failed: %s\n' "$CONTAINER_NAME" >&2
      return 1
    fi
  fi

  previous_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$CONTAINER_NAME")"

  if { [ "$previous_health" = missing ] && [ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" = true ]; } \
    || wait_for_health "$CONTAINER_NAME"; then
    printf 'Previous container restored: %s\n' "$CONTAINER_NAME" >&2
    return 0
  fi

  printf 'Previous container restoration failed: %s\n' "$CONTAINER_NAME" >&2
  show_logs "$CONTAINER_NAME"
  return 1
}

handle_deploy_exit() {
  deploy_exit_status="$?"
  trap - EXIT HUP INT TERM

  if [ "${deployment_complete:-false}" != true ]; then
    restore_previous_container || true
  fi

  exit "$deploy_exit_status"
}

handle_deploy_signal() {
  printf 'Deployment interrupted; restoring previous container\n' >&2
  trap - EXIT HUP INT TERM
  restore_previous_container || true
  exit 1
}

deploy() {
  has_previous=false
  deployment_started=false
  deployment_complete=false

  trap handle_deploy_exit EXIT
  trap handle_deploy_signal HUP INT TERM

  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    if docker inspect "$ROLLBACK_NAME" >/dev/null 2>&1; then
      printf 'Rollback container already exists: %s\n' "$ROLLBACK_NAME" >&2
      return 1
    fi

    has_previous=true
    docker rename "$CONTAINER_NAME" "$ROLLBACK_NAME"
    docker stop "$ROLLBACK_NAME" >/dev/null
  fi

  deployment_started=true

  if run_container "$CONTAINER_NAME" "$RELEASE_IMAGE" true unless-stopped \
    && wait_for_health "$CONTAINER_NAME"; then
    deployment_complete=true
    trap - EXIT HUP INT TERM

    if [ "$has_previous" = true ]; then
      docker rm "$ROLLBACK_NAME" >/dev/null 2>&1 \
        || printf 'Warning: failed to remove rollback container: %s\n' "$ROLLBACK_NAME" >&2
    fi

    printf 'Deployment completed: %s\n' "$RELEASE_IMAGE"
    return 0
  fi

  printf 'Deployment failed: %s\n' "$RELEASE_IMAGE" >&2
  show_logs "$CONTAINER_NAME"
  return 1
}

case "${1:-}" in
  smoke)
    smoke_test
    ;;
  deploy)
    deploy
    ;;
  *)
    printf 'Usage: %s {smoke|deploy}\n' "$0" >&2
    exit 2
    ;;
esac
