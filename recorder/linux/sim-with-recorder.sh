#!/usr/bin/env bash
# Steam launch options for any supported simulator (ACC, LMU, AC, AC EVO, DR2/WRC):
#
#     /path/to/sim-with-recorder.sh %command%
#
# Auto-detects the simulator from the launch command and starts idoracing-recorder.exe
# in the same Proton prefix and wine namespace as the game. Live Spotter audio (Pep) plays OGG cues.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"
recorder="${IDORACING_RECORDER:-$here/idoracing-recorder.exe}"
delay="${IDORACING_RECORDER_DELAY:-10}"
log="${IDORACING_RECORDER_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/idoracing-recorder.log}"
voices_dir="${IDORACING_VOICES_DIR:-$repo_root/recorder/voices}"
config_file="${IDORACING_CONFIG:-$repo_root/data/spotter_config.json}"

# Clean up all background jobs on script exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT INT TERM

# Read spotter configuration (enabled, language, volume)
spotter_enabled="true"
spotter_lang="es"
spotter_vol_pct="${IDORACING_SPOTTER_VOLUME:-100}"
if [ -f "$config_file" ]; then
	cfg_en=$(grep -o '"enabled": *[^,}]*' "$config_file" | head -n1 | sed -e 's/"enabled": *//' -e 's/"//g' -e 's/ //g')
	[ "$cfg_en" = "false" ] && spotter_enabled="false"
	cfg_lang=$(grep -o '"language": *[^,}]*' "$config_file" | head -n1 | sed -e 's/"language": *//' -e 's/"//g' -e 's/ //g')
	[ "$cfg_lang" = "en" ] && spotter_lang="en"
	cfg_vol=$(grep -o '"volume": *[0-9]*' "$config_file" | head -n1 | sed -e 's/"volume": *//' -e 's/ //g')
	if [ -n "$cfg_vol" ] && [ "$cfg_vol" -gt 0 ] 2>/dev/null; then
		spotter_vol_pct="$cfg_vol"
	fi
fi

# Optional local user environment overrides (e.g. SDL_GAMECONTROLLER_IGNORE_DEVICES)
if [ -f "${XDG_CONFIG_HOME:-$HOME/.config}/idoracing/env" ]; then
	# shellcheck disable=SC1090
	. "${XDG_CONFIG_HOME:-$HOME/.config}/idoracing/env"
fi

play_clip() {
	local ogg="$1"
	[ -f "$ogg" ] || return 0
	if command -v pw-play >/dev/null 2>&1; then
		local pw_vol
		pw_vol=$(awk "BEGIN {printf \"%.2f\", $spotter_vol_pct / 100}")
		pw-play --volume "${pw_vol:-1.0}" --media-role=voice "$ogg" 2>/dev/null || pw-play "$ogg"
	elif command -v paplay >/dev/null 2>&1; then
		local pa_vol=$(( spotter_vol_pct * 65536 / 100 ))
		paplay --volume="$pa_vol" --property="media.role=voice" "$ogg" 2>/dev/null || paplay "$ogg"
	elif command -v ffplay >/dev/null 2>&1; then
		ffplay -nodisp -autoexit -loglevel quiet -volume "$spotter_vol_pct" "$ogg"
	fi
}

# Determine sim and exe
cmd_str="$*"
sim="${IDORACING_SIM:-auto}"
game_exe="${IDORACING_GAME_EXE:-}"

if [ "$sim" = "auto" ] && [ -z "$game_exe" ]; then
	case "$cmd_str" in
	*"acr.exe"*|*"/Assetto Corsa Rally/"*)
		sim="acrally"
		game_exe="acr.exe"
		;;
	*"AC2-Win64-Shipping.exe"*|*"acc.exe"*|*"/Assetto Corsa Competizione/"*)
		sim="acc"
		game_exe="AC2-Win64-Shipping.exe,acc.exe"
		;;
	*"Le Mans Ultimate"*|*"start_protected_game.exe"*)
		sim="lmu"
		game_exe="Le Mans Ultimate.exe,start_protected_game.exe"
		;;
	*"AssettoCorsaEVO"*|*"Assetto Corsa Evo"*)
		sim="acevo"
		game_exe="AssettoCorsaEVO.exe"
		;;
	*"acs.exe"*|*"AssettoCorsa.exe"*|*"/Assetto Corsa/"*)
		sim="ac"
		game_exe="acs.exe,AssettoCorsa.exe"
		;;
	*"dirtrally2.exe"*|*"WRC.exe"*|*"/DiRT Rally 2.0/"*|*"/EA SPORTS WRC/"*)
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
	touch "$log"

	# Spotter audio loop: listens to the recorder log
	spotter_pid=""
	if [ "$spotter_enabled" = "true" ]; then
		(
			current_track=""
			tail -n0 -F "$log" 2>/dev/null | while IFS= read -r line; do
				case "$line" in
				*PEP_TRACK\|*)
					current_track="${line#*PEP_TRACK|}"
					current_track="$(echo "$current_track" | tr -d '\r\n[:space:]')"
					;;
				*PEP_PLAY\|*)
					clip_id="${line#*PEP_PLAY|}"
					clip_id="$(echo "$clip_id" | tr -d '\r\n[:space:]')"
					if [ "$spotter_enabled" = "true" ] && [ -n "$clip_id" ]; then
						target_ogg=""
						if [ -n "$current_track" ] && [ -f "$voices_dir/tracks/$current_track/$spotter_lang/$clip_id.ogg" ]; then
							target_ogg="$voices_dir/tracks/$current_track/$spotter_lang/$clip_id.ogg"
						else
							for f in "$voices_dir"/tracks/*/"$spotter_lang"/"$clip_id.ogg"; do
								if [ -f "$f" ]; then
									target_ogg="$f"
									break
								fi
							done
						fi
						if [ -z "$target_ogg" ] && [ -f "$voices_dir/$spotter_lang/$clip_id.ogg" ]; then
							target_ogg="$voices_dir/$spotter_lang/$clip_id.ogg"
						fi
						if [ -z "$target_ogg" ]; then
							case "$clip_id" in
							hotspot_*)
								slot="${clip_id#hotspot_}"
								corner_id="$slot"
								manifest="$voices_dir/tracks/$current_track/manifest.json"
								if [ -f "$manifest" ]; then
									cid="$(grep -B2 -A10 "\"slot\":[[:space:]]*$slot" "$manifest" 2>/dev/null | grep "\"corner_id\"" | head -n1 | sed -E 's/[^0-9]//g')"
									[ -n "$cid" ] && corner_id="$cid"
								fi
								if [ -f "$voices_dir/$spotter_lang/turn_${corner_id}.ogg" ]; then
									target_ogg="$voices_dir/$spotter_lang/turn_${corner_id}.ogg"
								fi
								;;
							esac
						fi
						if [ -n "$target_ogg" ] && [ -f "$target_ogg" ]; then
							play_clip "$target_ogg"
						fi
					fi
					;;
				esac
			done
		) </dev/null >/dev/null 2>&1 &
		spotter_pid=$!
	fi

	run_recorder() {
		if [ "$delay" -gt 0 ] 2>/dev/null; then
			sleep "$delay"
		fi
		exec "${rec_cmd[@]}"
	}

	run_recorder >>"$log" 2>&1 &
fi

wait "$game"
if [ -n "$spotter_pid" ]; then
	kill "$spotter_pid" 2>/dev/null || true
fi
pkill -P $$ 2>/dev/null || true
sleep 0.05 2>/dev/null || true
