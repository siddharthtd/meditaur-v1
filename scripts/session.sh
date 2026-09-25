#!/usr/bin/env bash
# This session's names, and the one lock that keeps two sessions out of each other's way.
#
# The owner's decision (2026-09-24): a private compose project and image tag **and** a
# preparation lock, refusing and explaining rather than waiting.
#
# Why a lock exists: `clean-run.sh` ran `docker compose … down --remove-orphans` over three
# projects unconditionally, and it is called by `check:full`, `e2e`, `build`, `dev` and
# `down`. With two agents in one checkout, one session's gate tears down the other's
# **running** browser containers — which is where round 24's `Protocol error … session
# closed` and its mass of 15-second timeouts came from — and it also kills a live
# `pnpm check` in the tools project and can restart the database under a live suite. Round
# 25's subset re-run then failed the same way, so the contention is not only the teardown:
# two gates on one machine make both numbers meaningless. So the lock is held for a gate's
# whole body and for any e2e run, which is what makes a green reading mean something.
#
# It holds a pid and is released by emptying the file. A pid that is gone is a gate that
# was killed rather than one that is running, so the next session takes it over — that is
# the staleness rule, and it is why a crashed gate cannot wedge the machine.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# One lock per machine rather than per checkout: what it protects is machine-wide — the
# Supabase stack's own containers, the Docker VM, and the three shared compose projects.
LOCK="${TMPDIR:-/tmp}/meditaur-prep.lock"

# Empty by default, so a lone agent keeps the names it has always had (`meditaur-e2e`,
# `meditaur-e2e:local`) and CI keeps the tags its workflow builds. `MEDITAUR_SESSION=alpha`
# is how two agents in one checkout stop sharing even a project name.
suffix() {
  if [[ -n "${MEDITAUR_SESSION:-}" ]]; then printf '%s' "-${MEDITAUR_SESSION}"; fi
}

# The live holder as `pid<TAB>started<TAB>what`, or non-zero when the lock is free.
lock_holder() {
  [[ -f "${LOCK}" ]] || return 1
  local pid started what
  IFS=$'\t' read -r pid started what <"${LOCK}" || return 1
  [[ -n "${pid}" ]] || return 1
  kill -0 "${pid}" 2>/dev/null || return 1
  printf '%s\t%s\t%s\n' "${pid}" "${started}" "${what:-unknown}"
}

# Prints the holder and exits 1 when a session **other than this one** holds the lock.
refuse_when_held() {
  local holder pid started what
  holder="$(lock_holder)" || return 0
  IFS=$'\t' read -r pid started what <<<"${holder}"
  [[ "${pid}" == "${PPID}" ]] && return 0
  echo "meditaur: another session is using the machine (pid ${pid}, started $(date -r "${started}" '+%H:%M:%S' 2>/dev/null || echo "${started}"), ${what})." >&2
  echo "meditaur: a second gate on one machine makes both e2e numbers meaningless, so this one stops here." >&2
  echo "meditaur: wait for it, or read a single spec without the gate:" >&2
  echo "meditaur:   ./scripts/meditaur e2e tests/e2e/<spec>.spec.ts" >&2
  exit 1
}

case "${1:-}" in
  project)
    printf 'meditaur-e2e%s' "$(suffix)"
    ;;
  image)
    printf 'meditaur-e2e:%s' "${MEDITAUR_SESSION:-local}"
    ;;
  # For a caller that only wants to decide something (the teardown): quiet exit 0 when the
  # lock is free or this session's, the holder and exit 1 when another session has it.
  held)
    holder="$(lock_holder)" || exit 0
    [[ "${holder%%$'\t'*}" != "${PPID}" ]] || exit 0
    printf '%s\n' "${holder}"
    exit 1
    ;;
  hold)
    shift
    [[ "${CI:-}" == "true" ]] && exit 0
    refuse_when_held
    printf '%s\t%s\t%s\n' "${PPID}" "$(date +%s)" "${1:-work}" >"${LOCK}"
    ;;
  # A note, never a refusal. A second suite alongside this one makes both readings noisy,
  # and the cheap way out is one spec, so say who else is working instead of stopping.
  warn-if-other)
    holder="$(lock_holder)" || exit 0
    [[ "${holder%%$'\t'*}" != "${PPID}" ]] || exit 0
    IFS=$'\t' read -r pid started what <<<"${holder}"
    echo "meditaur: another session is preparing (pid ${pid}, ${what}); this run shares the machine with it." >&2
    ;;
  release)
    # **Only this session's own lock.** A gate that was refused never took it, and must not
    # clear the file out from under the session that holds it — which is what an unguarded
    # release does the moment a gate is refused while another one is running.
    if holder="$(lock_holder)" && [[ "${holder%%$'\t'*}" == "${PPID}" ]]; then
      : >"${LOCK}"
    fi
    ;;
  *)
    echo "meditaur: session.sh project|image|held|hold <what>|release" >&2
    exit 2
    ;;
esac
