#!/usr/bin/env bash
# Checks all sim-with-recorder launcher scripts against a fake Proton.
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

fail() {
	echo "FAIL: $1"
	echo "--- calls:"
	cat "$CALLS"
	exit 1
}

# 1. ACC
: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/acc-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/acc/AC2-Win64-Shipping.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -exit-with AC2-Win64-Shipping.exe,acc.exe -log $work/log" "$CALLS" || fail "acc-with-recorder.sh failed"

# 2. LMU
: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/lmu-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/lmu/Le Mans Ultimate.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim lmu -exit-with Le Mans Ultimate.exe,start_protected_game.exe -log $work/log" "$CALLS" || fail "lmu-with-recorder.sh failed"

# 3. AC
: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/ac-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/ac/acs.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim ac -exit-with acs.exe,AssettoCorsa.exe -log $work/log" "$CALLS" || fail "ac-with-recorder.sh failed"

# 4. AC EVO
: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/acevo-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/acevo/AssettoCorsaEVO.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim acevo -exit-with AssettoCorsaEVO.exe -log $work/log" "$CALLS" || fail "acevo-with-recorder.sh failed"

# 5. DiRT Rally 2.0 / WRC
: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/dr2-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/dr2/dirtrally2.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim dr2 -exit-with dirtrally2.exe,WRC.exe -log $work/log" "$CALLS" || fail "dr2-with-recorder.sh failed"

# 6. Universal launcher auto-detection
: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/sim-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/dr2/dirtrally2.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim dr2 -exit-with dirtrally2.exe,WRC.exe -log $work/log" "$CALLS" || fail "sim-with-recorder.sh auto-dr2 failed"

: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/sim-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/lmu/Le Mans Ultimate.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim lmu -exit-with Le Mans Ultimate.exe,start_protected_game.exe -log $work/log" "$CALLS" || fail "sim-with-recorder.sh auto-lmu failed"

: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/sim-with-recorder.sh" "$fake_proton" waitforexitandrun "/steamapps/common/Le Mans Ultimate/start_protected_game.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim lmu -exit-with Le Mans Ultimate.exe,start_protected_game.exe -log $work/log" "$CALLS" || fail "sim-with-recorder.sh auto-lmu-eac failed"

: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/sim-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/acc/AC2-Win64-Shipping.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim acc -exit-with AC2-Win64-Shipping.exe,acc.exe -log $work/log" "$CALLS" || fail "sim-with-recorder.sh auto-acc failed"

: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/acc-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/Assetto Corsa Rally/acr/Binaries/Win64/acr.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim acrally -exit-with acr.exe,AssettoCorsaRally.exe,ACR-Win64-Shipping.exe,AssettoCorsaRally-Win64-Shipping.exe,acrally.exe -log $work/log" "$CALLS" || fail "acc-with-recorder.sh acr.exe failed"

: >"$CALLS"
IDORACING_RECORDER="$work/idoracing-recorder.exe" IDORACING_RECORDER_DELAY=0 IDORACING_RECORDER_LOG="$work/log" \
	bash "$here/sim-with-recorder.sh" "$fake_proton" waitforexitandrun "/games/Assetto Corsa Rally/acr/Binaries/Win64/acr.exe"
sleep 0.5
grep -qx "run $work/idoracing-recorder.exe -sim acrally -exit-with acr.exe,AssettoCorsaRally.exe,ACR-Win64-Shipping.exe,AssettoCorsaRally-Win64-Shipping.exe,acrally.exe -log $work/log" "$CALLS" || fail "sim-with-recorder.sh auto-acr failed"

echo "All sim launcher tests passed ok!"
