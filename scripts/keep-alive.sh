#!/bin/sh
# Keep the hosted Supabase project from being paused for inactivity.
#
# A Free-plan Supabase project is paused after a week without enough user
# database activity (supabase.com/docs/guides/platform/free-project-pausing),
# and the hosted project is what sign-in, cloud preferences, sync and both live
# suites talk to. So this asks it two questions a week cannot pass: one PostgREST
# read — a real query, even though RLS answers a keyless request with no rows —
# and one auth health check.
#
# It is READ-ONLY. There is no write anywhere in this file, on purpose, and the
# unit guard proves it rather than trusting the sentence.
#
# Configuration: `SUPABASE_URL` and `SUPABASE_ANON_KEY`, from the environment
# (which is what .github/workflows/keep-alive.yml passes) or from `.env`, read
# the way scripts/cloud.sh reads it: last assignment wins, one layer of quotes
# stripped, no eval and no sourcing, so a stray line cannot run anything. The key
# is the dashboard's *publishable* key — the one the browser bundle already
# carries — and it is never written into a tracked file; it lives in the
# repository's own secrets.
#
# Exit: 0 pinged, or nothing configured to ping · 1 the project did not answer ·
# 2 half configured. A red run is the point of it: that is the alarm saying the
# keep-alive has stopped working, which is the week the project would pause in.

set -eu

TIMEOUT="${KEEP_ALIVE_TIMEOUT:-20}"

from_environment() {
  # No eval: the names are the two this script takes, and no others.
  case "$1" in
    SUPABASE_URL) printf '%s' "${SUPABASE_URL:-}" ;;
    SUPABASE_ANON_KEY) printf '%s' "${SUPABASE_ANON_KEY:-}" ;;
  esac
}

value_for() {
  value="$(from_environment "$1")"
  if [ -z "$value" ] && [ -f .env ]; then
    value="$(sed -n "s/^$1=//p" .env | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")"
  fi
  printf '%s' "$value"
}

url="$(value_for SUPABASE_URL)"
key="$(value_for SUPABASE_ANON_KEY)"

if [ -z "$url" ] && [ -z "$key" ]; then
  echo "keep-alive: neither SUPABASE_URL nor SUPABASE_ANON_KEY is set; nothing to ping."
  exit 0
fi
if [ -z "$url" ]; then
  echo "keep-alive: SUPABASE_URL is missing while SUPABASE_ANON_KEY is set." >&2
  exit 2
fi
if [ -z "$key" ]; then
  echo "keep-alive: SUPABASE_ANON_KEY is missing while SUPABASE_URL is set." >&2
  exit 2
fi

# `plans` is a core catalogue table that is always there. A read with the
# publishable key and no session is RLS-filtered to `[]` with a 200 — the query
# still runs, which is the activity the pause rule counts. If the grants are ever
# tightened (register item 21), this probe or that grant has to move with it.
#
# Both probes carry the key. `/auth/v1/health` is behind the project's gateway,
# which answers 401 without it — measured, not assumed: the first draft omitted
# the headers and this file failed against the live project.
url="${url%/}"
host="$(printf '%s' "$url" | sed -e 's#^http://##' -e 's#^https://##' -e 's#/.*$##')"

failed=0

rest_code="$(curl -sS -m "$TIMEOUT" -o /dev/null -w '%{http_code}' \
  -H "apikey: ${key}" -H "Authorization: Bearer ${key}" \
  "${url}/rest/v1/plans?select=id&limit=1" || printf '000')"
case "$rest_code" in
  2??) echo "keep-alive: ${host} answered a table read with ${rest_code}." ;;
  *)   echo "keep-alive: ${host} answered a table read with ${rest_code}." >&2; failed=1 ;;
esac

auth_code="$(curl -sS -m "$TIMEOUT" -o /dev/null -w '%{http_code}' \
  -H "apikey: ${key}" -H "Authorization: Bearer ${key}" \
  "${url}/auth/v1/health" || printf '000')"
case "$auth_code" in
  2??) echo "keep-alive: ${host} answered its auth health check with ${auth_code}." ;;
  *)   echo "keep-alive: ${host} answered its auth health check with ${auth_code}." >&2; failed=1 ;;
esac

if [ "$failed" -ne 0 ]; then
  echo "keep-alive: ${host} did not answer both probes; it may already be paused." >&2
  exit 1
fi

echo "keep-alive: ${host} pinged."
