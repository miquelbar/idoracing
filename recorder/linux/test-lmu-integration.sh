#!/usr/bin/env bash
# End-to-end integration test for LMU shared memory recorder under Wine/Proton.
# Runs fakelmu.exe in background, idoracing-recorder.exe alongside it,
# and verifies the resulting CSV telemetry file.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
rec_dir="$(cd "$here/.." && pwd)"

# Find Wine or Proton binary
WINE=""
if [ -n "${WINE_BIN:-}" ] && command -v "$WINE_BIN" >/dev/null 2>&1; then
	WINE="$WINE_BIN"
elif command -v wine >/dev/null 2>&1; then
	WINE="wine"
else
	# Search Steam / GE-Proton installations
	for p in \
		"$HOME/.local/share/Steam/compatibilitytools.d"/GE-Proton*/files/bin/wine \
		"$HOME/.local/share/Steam/steamapps/common"/Proton*/files/bin/wine; do
		if [ -x "$p" ]; then
			WINE="$p"
			break
		fi
	done
fi

if [ -z "$WINE" ]; then
	echo "SKIP: No Wine or Proton binary found to run Windows integration test."
	exit 0
fi

echo "Using Wine: $WINE"

# Compile binaries if needed
(cd "$rec_dir" && GOOS=windows GOARCH=amd64 go build -o fakelmu.exe ./tools/fakelmu)
(cd "$rec_dir" && GOOS=windows GOARCH=amd64 go build -o idoracing-recorder.exe .)

work="$HOME/.cache/idoracing-test-lmu-wine"
export WINEPREFIX="$work/pfx"
mkdir -p "$WINEPREFIX"
out_dir="$work/recordings"
rm -rf "$out_dir"
mkdir -p "$out_dir"

echo "Starting fakelmu.exe (6 seconds)..."
"$WINE" "$rec_dir/fakelmu.exe" -seconds 6 >/dev/null 2>&1 &
FAKE_PID=$!

sleep 1

echo "Starting idoracing-recorder.exe..."
"$WINE" "$rec_dir/idoracing-recorder.exe" -sim lmu -exit-with fakelmu.exe -out "Z:$out_dir" -log "Z:$work/recorder.log" >/dev/null 2>&1 &
REC_PID=$!

wait "$FAKE_PID" || true
wait "$REC_PID" || true

# Check CSV output
csv_file=$(find "$out_dir" -name "lmu_*.csv" | head -n 1)
if [ -z "$csv_file" ] || [ ! -f "$csv_file" ]; then
	echo "FAIL: No CSV recording was generated!" >&2
	[ -f "$work/recorder.log" ] && cat "$work/recorder.log" >&2
	exit 1
fi

echo "Generated: $csv_file"
grep -q "# simulator: Le Mans Ultimate" "$csv_file" || { echo "FAIL: Header missing simulator: Le Mans Ultimate" >&2; exit 1; }
grep -q "Ferrari 499P" "$csv_file" || { echo "FAIL: Header missing car Ferrari 499P" >&2; exit 1; }
grep -q "Circuit de la Sarthe" "$csv_file" || { echo "FAIL: Header missing track" >&2; exit 1; }

rows=$(wc -l < "$csv_file")
if [ "$rows" -lt 50 ]; then
	echo "FAIL: Expected at least 50 telemetry samples, got $rows" >&2
	exit 1
fi

echo "PASS: LMU integration test succeeded ($rows telemetry rows recorded)."
