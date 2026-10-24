# idoracing-recorder

Reads telemetry and car position from **Assetto Corsa Competizione (ACC)**, **Le Mans Ultimate (LMU)**, **Assetto Corsa 1 (AC)**, and **Assetto Corsa EVO (AC EVO)** in real time and writes standard CSV files per session. Import them into IdoRacing like any other file.

It runs on its own; the IdoRacing app does not need to be open while you drive.

## Supported Simulators

| Simulator | Detection Flag (`-sim`) | Process / Shared Memory | Launch Script |
| :--- | :--- | :--- | :--- |
| **Assetto Corsa Competizione** | `acc` (default) | `AC2-Win64-Shipping.exe`<br>`Local\acpmf_physics`, `graphics`, `static` | `linux/acc-with-recorder.sh` |
| **Le Mans Ultimate** | `lmu` | `Le Mans Ultimate.exe`<br>`$rFactor2SMMP_Telemetry$`, `$rFactor2SMMP_Scoring$` | `linux/lmu-with-recorder.sh` |
| **Assetto Corsa 1** | `ac` | `acs.exe`, `AssettoCorsa.exe`<br>`Local\acpmf_physics`, `graphics`, `static` | `linux/ac-with-recorder.sh` |
| **Assetto Corsa EVO** | `acevo` | `AssettoCorsaEVO.exe`<br>`Local\acevo_pmf_*` (fallback `Local\acpmf_*`) | `linux/acevo-with-recorder.sh` |
| **Auto-Detect All** | `auto` | Detects via running processes or active shared memory maps | `linux/sim-with-recorder.sh` |

## Footprint

- One thread at below-normal priority, so the game always wins the CPU.
- 30 samples per second while you are on track (`-hz` to change it). Outside the car (menus, replays, pits screen) it checks once a second.
- Nothing is written while the game is paused. Rows are buffered and written to disk once per lap.
- About 2 MB on disk and a few MB of memory.

## Build

```bash
cd recorder
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w -H=windowsgui" -o idoracing-recorder.exe .
go test ./...
bash linux/test-acc-with-recorder.sh
bash linux/test-sim-launchers.sh
```

## Run on Linux (Steam + Proton)

The simulator's shared memory only exists inside the wineserver that runs the game, so the recorder has to run in the same Proton prefix, with the same Proton build and the same fsync/esync setting. The launch-option scripts take care of that by reusing the Proton from the command Steam builds:

1. Put `idoracing-recorder.exe` next to the `linux/*.sh` scripts.
2. In Steam: Sim Properties > General > Launch options:

   - **ACC:** `/path/to/recorder/linux/acc-with-recorder.sh %command%`
   - **LMU:** `/path/to/recorder/linux/lmu-with-recorder.sh %command%`
   - **AC1:** `/path/to/recorder/linux/ac-with-recorder.sh %command%`
   - **AC EVO:** `/path/to/recorder/linux/acevo-with-recorder.sh %command%`
   - **Universal (Any):** `/path/to/recorder/linux/sim-with-recorder.sh %command%`

3. Start the game from Steam as usual. The recorder starts 10 seconds later and stops by itself a few seconds after the game closes. Its log is in `~/.local/state/idoracing-recorder.log`.

If the recorder is missing or the launch command has no Proton, the game starts normally without it. `IDORACING_RECORDER`, `IDORACING_RECORDER_DELAY` and `IDORACING_RECORDER_LOG` override the executable, the delay and the log path.

Session files go to `.../pfx/drive_c/users/steamuser/Documents/IdoRacing/recordings/`, which IdoRacing lists alongside other telemetry files. Pass `-out` to write somewhere else.

### Note for Le Mans Ultimate (LMU)
Ensure `rFactor2SharedMemoryMapPlugin64.dll` is enabled in your LMU prefix:
In `UserData/player/CustomPluginVariables.json`, confirm:
```json
"rFactor2SharedMemoryMapPlugin64.dll": {
  " Enabled": 1
}
```

### Check it under Wine before driving (ACC Fake Sim)

`tools/fakeacc` publishes ACC's three shared memory pages with a car lapping a circle, so the whole chain can be checked without the game:

```bash
GOOS=windows GOARCH=amd64 go build -o fakeacc.exe ./tools/fakeacc
export WINEPREFIX=/tmp/idoracing-wine-test
wine fakeacc.exe -seconds 30 &
wine idoracing-recorder.exe -out 'C:\recordings' -exit-with fakeacc.exe
ls "$WINEPREFIX/drive_c/recordings"   # one acc_fake_circle_fake_gt3_*.csv, x/y tracing a 200 m circle
```

The recorder exits on its own when `fakeacc.exe` finishes.

## Run on Windows

Start `idoracing-recorder.exe` before or after the game and leave it running; close it with Ctrl+C, or pass `-exit-with <game.exe>` (e.g. `-exit-with AC2-Win64-Shipping.exe`, `-exit-with "Le Mans Ultimate.exe"`, `-exit-with "acs.exe,AssettoCorsa.exe"`, `-exit-with AssettoCorsaEVO.exe`) so it stops with the game. Files go to `Documents\IdoRacing\recordings`.

Pass `-sim <acc|lmu|ac|acevo|auto>` to force a specific simulator adapter or let it auto-detect.

## Output

```
# simulator: Assetto Corsa Competizione
# track: spa
# car: bmw_m4_gt3
# track_length_m: 7004.0
# recorder: idoracing-recorder 0.1.0
time,lap,lap_distance,speed,throttle,brake,gear,steer_angle,rpm,lat_accel,long_accel,yaw_rate,x,y,in_pit,lap_valid
```

`x` and `y` are ACC's world coordinates on the ground plane (its x and z), in metres. `lap_distance` is the position along the track. `lap_valid` is ACC's own flag, so laps with track-limit cuts are marked invalid.

## Verified on live ACC sessions

- Built with `-H=windowsgui` so it runs silently in the background without creating a console window or interrupting fullscreen focus.
- Automatically joins the game's Steam Linux Runtime container via `acc-with-recorder.sh --verb=run`.
- Real world coordinates `(x, y)` match circuit layouts (tested and verified on Valencia).
- Lateral and longitudinal accelerations follow physical conventions.
- Laps cut-short or exceeding track limits are flagged automatically using ACC's native `lap_valid` signal.
- Stops cleanly when `AC2-Win64-Shipping.exe` exits.
