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
voices_dir="${IDORACING_VOICES_DIR:-$repo_root/recorder/voices}"
config_file="${IDORACING_CONFIG:-$repo_root/data/spotter_config.json}"
# Determine target game executable and simulator
cmd_str="$*"
sim="${IDORACING_SIM:-auto}"
game_exe="${IDORACING_GAME_EXE:-}"

if [ -z "$game_exe" ]; then
	case "$cmd_str" in
	*"acr.exe"*|*"AssettoCorsaRally"*|*"/Assetto Corsa Rally/"*|*"ACR-Win64-Shipping.exe"*|*"acrally.exe"*)
		[ "$sim" = "auto" ] && sim="acrally"
		game_exe="acr.exe,AssettoCorsaRally.exe,ACR-Win64-Shipping.exe,AssettoCorsaRally-Win64-Shipping.exe,acrally.exe"
		;;
	*"Le Mans Ultimate"*|*"start_protected_game.exe"*)
		[ "$sim" = "auto" ] && sim="lmu"
		game_exe="Le Mans Ultimate.exe,start_protected_game.exe"
		;;
	*"AssettoCorsaEVO"*|*"Assetto Corsa Evo"*)
		[ "$sim" = "auto" ] && sim="acevo"
		game_exe="AssettoCorsaEVO.exe"
		;;
	*"acs.exe"*|*"AssettoCorsa.exe"*|*"/Assetto Corsa/"*)
		[ "$sim" = "auto" ] && sim="ac"
		game_exe="acs.exe,AssettoCorsa.exe"
		;;
	*"dirtrally2.exe"*|*"WRC.exe"*|*"/DiRT Rally 2.0/"*|*"/EA SPORTS WRC/"*)
		[ "$sim" = "auto" ] && sim="dr2"
		game_exe="dirtrally2.exe,WRC.exe"
		;;
	*"AC2-Win64-Shipping.exe"*|*"acc.exe"*|*"/Assetto Corsa Competizione/"*)
		[ "$sim" = "auto" ] && sim="acc"
		game_exe="AC2-Win64-Shipping.exe,acc.exe"
		;;
	*)
		# Fallback: find any .exe in arguments
		for arg in "$@"; do
			case "$arg" in
			*.exe|*.EXE)
				game_exe="$(basename "$arg")"
				;;
			esac
		done
		[ -z "$game_exe" ] && game_exe="AC2-Win64-Shipping.exe,acc.exe"
		;;
	esac
fi

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
		rec_cmd+=("run" "$recorder")
		if [ -n "$sim" ] && [ "$sim" != "auto" ] && [ "$sim" != "acc" ]; then
			rec_cmd+=("-sim" "$sim")
		fi
		rec_cmd+=("-exit-with" "$game_exe" "-log" "$log")
		break
		;;
	esac
done

"$@" &
game=$!

spotter_pid=""
moza_pid=""
hud_pid=""

if [ -z "$proton" ]; then
	echo "idoracing: no Proton in the launch command, starting ACC without the recorder" >&2
elif [ ! -f "$recorder" ]; then
	echo "idoracing: $recorder not found, starting ACC without the recorder" >&2
else
	rec_magic=$(head -c 2 "$recorder" 2>/dev/null || true)
	if [ "$rec_magic" != "MZ" ] && [ -s "$recorder" ]; then
		echo "idoracing: WARNING: $recorder is NOT a Windows PE executable (magic: '$rec_magic'). Rebuild with: GOOS=windows GOARCH=amd64 go build -trimpath -ldflags='-s -w -H=windowsgui' -o idoracing-recorder.exe ." >&2
	fi
	mkdir -p "$(dirname "$log")"
	touch "$log"

	# Spotter audio loop: listens to the recorder log
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
					if [ -f "$config_file" ]; then
						cfg_en=$(grep -o '"enabled": *[^,}]*' "$config_file" | head -n1 | sed -e 's/"enabled": *//' -e 's/"//g' -e 's/ //g')
						[ "$cfg_en" = "false" ] && spotter_enabled="false"
						[ "$cfg_en" = "true" ] && spotter_enabled="true"
						cfg_vol=$(grep -o '"volume": *[0-9]*' "$config_file" | head -n1 | sed -e 's/"volume": *//' -e 's/ //g')
						if [ -n "$cfg_vol" ] && [ "$cfg_vol" -gt 0 ] 2>/dev/null; then
							spotter_vol_pct="$cfg_vol"
						fi
					fi
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

	# Moza RPM shift lights bridge
	if [ "${IDORACING_MOZA_LEDS:-true}" = "true" ] && [ -f "$repo_root/tools/moza_leds.py" ] && command -v python3 >/dev/null 2>&1; then
		python3 "$repo_root/tools/moza_leds.py" </dev/null >>"$log" 2>&1 &
		moza_pid=$!
	fi

	# Native Pedal & Trail Braking HUD overlay (100% Go)
	if [ "${IDORACING_HUD:-false}" = "true" ]; then
		hud_bin=""
		for cand in "$repo_root/recorder/bin/idoracing-hud" "$repo_root/recorder/idoracing-hud" "$here/idoracing-hud"; do
			if [ -x "$cand" ]; then
				hud_bin="$cand"
				break
			fi
		done
		if [ -z "$hud_bin" ] && command -v go >/dev/null 2>&1 && [ -d "$repo_root/recorder/tools/hud" ]; then
			( cd "$repo_root/recorder" && go build -trimpath -ldflags="-s -w" -o bin/idoracing-hud ./tools/hud 2>/dev/null || true )
			[ -x "$repo_root/recorder/bin/idoracing-hud" ] && hud_bin="$repo_root/recorder/bin/idoracing-hud"
		fi
		if [ -n "$hud_bin" ]; then
			"$hud_bin" </dev/null >>"$log" 2>&1 &
			hud_pid=$!
		elif [ -f "$repo_root/tools/pedal_hud.py" ] && command -v python3 >/dev/null 2>&1; then
			python_cmd="/usr/bin/python3"
			[ ! -x "$python_cmd" ] && python_cmd="python3"
			"$python_cmd" "$repo_root/tools/pedal_hud.py" </dev/null >>"$log" 2>&1 &
			hud_pid=$!
		fi
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
if [ -n "$moza_pid" ]; then
	kill "$moza_pid" 2>/dev/null || true
fi
if [ -n "$hud_pid" ]; then
	kill "$hud_pid" 2>/dev/null || true
fi
pkill -P $$ 2>/dev/null || true
sleep 0.05 2>/dev/null || true
