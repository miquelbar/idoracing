#!/usr/bin/env bash
# Steam launch options for Assetto Corsa Competizione:
#
#     /path/to/acc-with-recorder.sh %command%
#
# Starts ACC exactly as Steam would, then idoracing-recorder.exe in the same Proton prefix with the same
# Proton build that runs the game. Live Spotter audio (Pep) plays OGG cues via pw-play/paplay/ffplay.
set -u

here="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
repo_root="$(cd "$here/../.." && pwd)"
recorder="${IDORACING_RECORDER:-$here/idoracing-recorder.exe}"
delay="${IDORACING_RECORDER_DELAY:-10}"
log="${IDORACING_RECORDER_LOG:-${XDG_STATE_HOME:-$HOME/.local/state}/idoracing-recorder.log}"
voices_dir="${IDORACING_VOICES_DIR:-$repo_root/recorder/voices}"
config_file="${IDORACING_CONFIG:-$repo_root/data/spotter_config.json}"
game_exe="AC2-Win64-Shipping.exe,acc.exe"

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
		rec_cmd+=("run" "$recorder" "-exit-with" "$game_exe" "-log" "$log")
		break
		;;
	esac
done

"$@" &
game=$!

if [ -z "$proton" ]; then
	echo "idoracing: no Proton in the launch command, starting ACC without the recorder" >&2
elif [ ! -f "$recorder" ]; then
	echo "idoracing: $recorder not found, starting ACC without the recorder" >&2
else
	mkdir -p "$(dirname "$log")"
	touch "$log"

	# Spotter audio loop: listens to the recorder log
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
	) &

	run_recorder() {
		if [ "$delay" -gt 0 ] 2>/dev/null; then
			sleep "$delay"
		fi
		exec "${rec_cmd[@]}"
	}

	run_recorder >>"$log" 2>&1 &
fi

wait "$game"
sleep 0.05 2>/dev/null || true
