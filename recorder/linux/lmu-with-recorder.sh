#!/usr/bin/env bash
# Steam launch options for Le Mans Ultimate (LMU):
#
#     /path/to/lmu-with-recorder.sh %command%
#
# Starts LMU exactly as Steam would, then idoracing-recorder.exe in the same Proton prefix with the same
# Proton build that runs the game, reading $rFactor2SMMP_Telemetry$ and $rFactor2SMMP_Scoring$.
# The recorder exits on its own a few seconds after LMU closes.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"
recorder="${IDORACING_RECORDER:-}"
if [ -z "$recorder" ]; then
	for cand in "$here/idoracing-recorder.exe" "$here/../idoracing-recorder.exe" "$repo_root/recorder/idoracing-recorder.exe"; do
		if [ -f "$cand" ]; then
			magic=$(head -c 2 "$cand" 2>/dev/null || true)
			if [ "$magic" = "MZ" ]; then
				recorder="$cand"
				break
			fi
		fi
	done
	if [ -z "$recorder" ]; then
		if [ -f "$here/idoracing-recorder.exe" ]; then
			recorder="$here/idoracing-recorder.exe"
		elif [ -f "$here/../idoracing-recorder.exe" ]; then
			recorder="$here/../idoracing-recorder.exe"
		else
			recorder="$here/idoracing-recorder.exe"
		fi
	fi
fi
delay="${IDORACING_RECORDER_DELAY:-10}"
log="${IDORACING_RECORDER_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/idoracing-recorder.log}"
game_exe="Le Mans Ultimate.exe,start_protected_game.exe"

# Optional local user environment overrides (e.g. SDL_GAMECONTROLLER_IGNORE_DEVICES)
if [ -f "${XDG_CONFIG_HOME:-${HOME:-}/.config}/idoracing/env" ]; then
	# shellcheck disable=SC1090
	. "${XDG_CONFIG_HOME:-${HOME:-}/.config}/idoracing/env"
fi

proton=""
rec_cmd=()
for arg in "$@"; do
	if [ "$arg" = "--verb=waitforexitandrun" ]; then
		rec_cmd+=("--verb=run")
	else
		rec_cmd+=("$arg")
	fi
	case "$arg" in
	*/proton)
		proton="$arg"
		rec_cmd+=("run" "$recorder" "-sim" "lmu" "-exit-with" "$game_exe" "-log" "$log")
		break
		;;
	esac
done

"$@" &
game=$!

if [ -z "$proton" ]; then
	echo "idoracing: no Proton in the launch command, starting LMU without the recorder" >&2
elif [ ! -f "$recorder" ]; then
	echo "idoracing: $recorder not found, starting LMU without the recorder" >&2
else
	rec_magic=$(head -c 2 "$recorder" 2>/dev/null || true)
	if [ "$rec_magic" != "MZ" ] && [ -s "$recorder" ]; then
		echo "idoracing: WARNING: $recorder is NOT a Windows PE executable (magic: '$rec_magic'). Rebuild with: GOOS=windows GOARCH=amd64 go build -trimpath -ldflags='-s -w -H=windowsgui' -o idoracing-recorder.exe ." >&2
	fi
	mkdir -p "$(dirname "$log")"
	(sleep "$delay" && exec "${rec_cmd[@]}") >>"$log" 2>&1 &
fi

wait "$game"
