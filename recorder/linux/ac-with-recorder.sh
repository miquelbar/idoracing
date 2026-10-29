#!/usr/bin/env bash
# Steam launch options for Assetto Corsa (AC1):
#
#     /path/to/ac-with-recorder.sh %command%
#
# Starts AC exactly as Steam would, then idoracing-recorder.exe in the same Proton prefix with the same
# Proton build that runs the game.
# The recorder exits on its own a few seconds after AC closes.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
recorder="${IDORACING_RECORDER:-$here/idoracing-recorder.exe}"
delay="${IDORACING_RECORDER_DELAY:-10}"
log="${IDORACING_RECORDER_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/idoracing-recorder.log}"
cmd_str="$*"
sim="ac"
game_exe="acs.exe,AssettoCorsa.exe"
case "$cmd_str" in
*"acr.exe"*|*"/Assetto Corsa Rally/"*)
	sim="acrally"
	game_exe="acr.exe"
	;;
esac

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
		rec_cmd+=("run" "$recorder" "-sim" "$sim" "-exit-with" "$game_exe" "-log" "$log")
		break
		;;
	esac
done

"$@" &
game=$!

if [ -z "$proton" ]; then
	echo "idoracing: no Proton in the launch command, starting AC without the recorder" >&2
elif [ ! -f "$recorder" ]; then
	echo "idoracing: $recorder not found, starting AC without the recorder" >&2
else
	mkdir -p "$(dirname "$log")"
	(sleep "$delay" && exec "${rec_cmd[@]}") >>"$log" 2>&1 &
fi

wait "$game"
