#!/usr/bin/env bash
# Steam launch options for Assetto Corsa EVO (AC EVO):
#
#     /path/to/acevo-with-recorder.sh %command%
#
# Starts AC EVO exactly as Steam would, then idoracing-recorder.exe in the same Proton prefix with the same
# Proton build that runs the game.
# The recorder exits on its own a few seconds after AC EVO closes.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
recorder="${IDORACING_RECORDER:-$here/idoracing-recorder.exe}"
delay="${IDORACING_RECORDER_DELAY:-10}"
log="${IDORACING_RECORDER_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/idoracing-recorder.log}"
game_exe="AssettoCorsaEVO.exe"

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
		rec_cmd+=("run" "$recorder" "-sim" "acevo" "-exit-with" "$game_exe" "-log" "$log")
		break
		;;
	esac
done

"$@" &
game=$!

if [ -z "$proton" ]; then
	echo "idoracing: no Proton in the launch command, starting AC EVO without the recorder" >&2
elif [ ! -f "$recorder" ]; then
	echo "idoracing: $recorder not found, starting AC EVO without the recorder" >&2
else
	mkdir -p "$(dirname "$log")"
	(sleep "$delay" && exec "${rec_cmd[@]}") >>"$log" 2>&1 &
fi

wait "$game"
