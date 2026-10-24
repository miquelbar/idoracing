#!/usr/bin/env bash
# Steam launch options for any supported simulator (ACC, LMU, AC, AC EVO):
#
#     /path/to/sim-with-recorder.sh %command%
#
# Auto-detects the simulator from the launch command and starts idoracing-recorder.exe
# in the same Proton prefix and wine namespace as the game.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
recorder="${IDORACING_RECORDER:-$here/idoracing-recorder.exe}"
delay="${IDORACING_RECORDER_DELAY:-10}"
log="${IDORACING_RECORDER_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/idoracing-recorder.log}"

# Determine sim and exe
cmd_str="$*"
sim="${IDORACING_SIM:-auto}"
game_exe="${IDORACING_GAME_EXE:-}"

if [ "$sim" = "auto" ] && [ -z "$game_exe" ]; then
	case "$cmd_str" in
	*"AC2-Win64-Shipping.exe"*)
		sim="acc"
		game_exe="AC2-Win64-Shipping.exe"
		;;
	*"Le Mans Ultimate.exe"*)
		sim="lmu"
		game_exe="Le Mans Ultimate.exe"
		;;
	*"AssettoCorsaEVO"*)
		sim="acevo"
		game_exe="AssettoCorsaEVO.exe"
		;;
	*"acs.exe"*|*"AssettoCorsa.exe"*)
		sim="ac"
		game_exe="acs.exe,AssettoCorsa.exe"
		;;
	*"dirtrally2.exe"*|*"WRC.exe"*)
		sim="dr2"
		game_exe="dirtrally2.exe,WRC.exe"
		;;
	esac
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
		rec_cmd+=("run" "$recorder")
		if [ -n "$sim" ] && [ "$sim" != "auto" ]; then
			rec_cmd+=("-sim" "$sim")
		fi
		if [ -n "$game_exe" ]; then
			rec_cmd+=("-exit-with" "$game_exe")
		fi
		rec_cmd+=("-log" "$log")
		break
		;;
	esac
done

"$@" &
game=$!

if [ -z "$proton" ]; then
	echo "idoracing: no Proton in the launch command, starting game without the recorder" >&2
elif [ ! -f "$recorder" ]; then
	echo "idoracing: $recorder not found, starting game without the recorder" >&2
else
	mkdir -p "$(dirname "$log")"
	(sleep "$delay" && exec "${rec_cmd[@]}") >>"$log" 2>&1 &
fi

wait "$game"
