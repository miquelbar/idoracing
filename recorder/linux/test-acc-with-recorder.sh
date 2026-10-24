#!/usr/bin/env bash
# Checks acc-with-recorder.sh against a fake Proton that records how it is called.
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/Proton 9.0"
fake_proton="$work/Proton 9.0/proton"
cat >"$fake_proton" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >>"$CALLS"
FAKE
chmod +x "$fake_proton"
touch "$work/idoracing-recorder.exe"

export CALLS="$work/calls"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/acc-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/acc/AC2-Win64-Shipping.exe"
sleep 1

fail() {
	echo "FAIL: $1"
	echo "--- calls:"
	cat "$CALLS"
	exit 1
}
grep -qx "waitforexitandrun /games/acc/AC2-Win64-Shipping.exe" "$CALLS" || fail "game not started as Steam asked"
grep -qx "run $work/idoracing-recorder.exe -exit-with AC2-Win64-Shipping.exe,acc.exe -log $work/log" "$CALLS" || fail "recorder not started with the game's Proton"

: >"$CALLS"
mkdir -p "$work/entry"
fake_entry="$work/entry/_v2-entry-point"
cat >"$fake_entry" <<'FAKE'
#!/usr/bin/env bash
echo "entry: $*" >>"$CALLS"
FAKE
chmod +x "$fake_entry"

IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/acc-with-recorder.sh" "$fake_entry" --verb=waitforexitandrun -- "$fake_proton" waitforexitandrun "/games/acc/AC2-Win64-Shipping.exe"
sleep 1
grep -qx "entry: --verb=waitforexitandrun -- $fake_proton waitforexitandrun /games/acc/AC2-Win64-Shipping.exe" "$CALLS" || fail "game not started through runtime entry point"
grep -qx "entry: --verb=run -- $fake_proton run $work/idoracing-recorder.exe -exit-with AC2-Win64-Shipping.exe,acc.exe -log $work/log" "$CALLS" || fail "recorder not started through runtime entry point with --verb=run"

: >"$CALLS"
IDORACING_RECORDER="$work/missing.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/acc-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/acc/AC2-Win64-Shipping.exe" 2>/dev/null
sleep 1
[ "$(wc -l <"$CALLS")" -eq 1 ] || fail "a missing recorder must not stop the game from starting"

echo "ok"
