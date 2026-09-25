#!/usr/bin/env bash
# What a gate costs, and who else is on the machine (`P4 · 57`).
#
# Why this exists: two rounds in a row, a red e2e stage was read as an app reading when it was
# an environment reading — round 24's `3 failed / 9 flaky / 89 passed in 14.8m` on a host at a
# load average of 12–47, and round 25's subset re-run failing the same way. The number a gate
# prints has to carry its own conditions, so:
#
#   cost.sh machine [cores] [load]   the machine a stage is about to take, and a warning once
#                                    the load average is above **half** the cores — the point
#                                    where a stage's seconds stop being about the app.
#   cost.sh show                     the previous recorded run's per-stage timings, and when it
#                                    was, so today's reading has something to be compared with.
#   cost.sh save                     read `<stage> <seconds>` lines on stdin and record them,
#                                    with the machine they were measured on.
#
# `machine` takes the two readings as optional arguments so a caller that already knows them —
# or a test that has to pin them — can say so; on its own it reads the real machine.
#
# The readings are the machine's rather than a container's on purpose: the contention these
# two rounds lost time to was between host processes (another agent's dev server, its suite,
# its Docker build), and every one of them shows up in the host's load average.
set -euo pipefail

# One file per machine, like the preparation lock (`scripts/session.sh`): a gate is the only
# writer, the lock serialises gates, and "the last run on this machine" is the useful thing to
# read next time. Not inside the repo — a run's timings are not a tracked artifact.
STATE="${TMPDIR:-/tmp}/meditaur-gate-timings"

cores() {
  if command -v sysctl >/dev/null 2>&1 && sysctl -n hw.ncpu >/dev/null 2>&1; then
    sysctl -n hw.ncpu
  elif command -v nproc >/dev/null 2>&1; then
    nproc
  else
    printf '1'
  fi
}

# The one-minute average: the window a stage is actually spent inside.
load1() {
  if [[ -r /proc/loadavg ]]; then
    cut -d' ' -f1 </proc/loadavg
  elif command -v sysctl >/dev/null 2>&1; then
    # macOS: `{ 1.23 2.34 3.45 }`.
    sysctl -n vm.loadavg | awk '{print $2}'
  else
    printf '?'
  fi
}

cmd="${1:-}"
case "${cmd}" in
  machine)
    c="${2:-$(cores)}"
    l="${3:-$(load1)}"
    printf 'meditaur: this machine — %s cores, load average %s\n' "${c}" "${l}"
    if [[ "${l}" == "?" ]]; then
      printf 'meditaur: the load average could not be read; treat any timing below as a condition of nothing\n'
    elif awk -v l="${l}" -v c="${c}" 'BEGIN { exit !(l > c / 2) }'; then
      # Over half the cores is where a stage stops being about the app: something else is
      # already working this machine, which is what both red rounds were.
      printf 'meditaur: warning — that is more than half the cores: this host is busy, so every stage below\n'
      printf 'meditaur: shares it. Read a red or slow stage as an environment reading until it reproduces on\n'
      printf 'meditaur: a quiet machine — one spec at a time needs no preparation: ./scripts/meditaur e2e <spec>\n'
    fi
    ;;
  show)
    if [[ ! -r "${STATE}" ]]; then
      printf 'meditaur: no previous gate run recorded on this machine\n'
      exit 0
    fi
    printf 'meditaur: the previous gate run\n'
    sed 's/^/meditaur:   /' "${STATE}"
    ;;
  save)
    # Read the stages, keep the file in one piece, and record the machine with them. A gate
    # that failed still saves: the timings of the run that went wrong are the interesting ones.
    if [[ -t 0 ]]; then
      printf 'meditaur: cost.sh save reads "<stage> <seconds>" lines on stdin\n' >&2
      exit 2
    fi
    incoming="$(cat)"
    if [[ -z "${incoming}" ]]; then
      exit 0
    fi
    {
      printf '# %s — %s cores, load average %s\n' \
        "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$(cores)" "$(load1)"
      printf '%s\n' "${incoming}"
    } >"${STATE}.$$"
    mv "${STATE}.$$" "${STATE}"
    ;;
  *)
    printf 'meditaur: cost.sh machine [cores] [load] | show | save\n' >&2
    exit 2
    ;;
esac
