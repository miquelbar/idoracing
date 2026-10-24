# idoracing-recorder

Reads telemetry and car position from **Assetto Corsa Competizione**, **Le Mans Ultimate**, **Assetto Corsa**, **Assetto Corsa Rally**, **Assetto Corsa EVO**, **DiRT Rally 2.0**, and **EA SPORTS WRC** in real time and writes standard 50Hz/100Hz CSV files per session. Import them into IdoRacing like any other file.

It runs on its own; the IdoRacing app does not need to be open while you drive. (For **iRacing**, export `.ld` with the MoTeC plugin or `.csv` via Mu/Atlas).

## Supported Simulators

| Simulator | Detection Flag (`-sim`) | Process / Shared Memory / Network | Launch Script |
| :--- | :--- | :--- | :--- |
| **Assetto Corsa Competizione** | `acc` (default) | `AC2-Win64-Shipping.exe`<br>`Local\acpmf_physics`, `graphics`, `static` | `linux/acc-with-recorder.sh` |
| **Le Mans Ultimate** | `lmu` | `Le Mans Ultimate.exe`<br>`$rFactor2SMMP_Telemetry$`, `$rFactor2SMMP_Scoring$` | `linux/lmu-with-recorder.sh` |
| **Assetto Corsa 1** | `ac` | `acs.exe`, `AssettoCorsa.exe`<br>`Local\acpmf_physics`, `graphics`, `static` | `linux/ac-with-recorder.sh` |
| **Assetto Corsa Rally** | `ac` | `acs.exe`, `AssettoCorsa.exe`<br>Point-to-point stages without false loop closure | `linux/ac-with-recorder.sh` |
| **Assetto Corsa EVO** | `acevo` | `AssettoCorsaEVO.exe`<br>`Local\acevo_pmf_*` (fallback `Local\acpmf_*`) | `linux/acevo-with-recorder.sh` |
| **DiRT Rally 2.0** | `dr2` | `dirtrally2.exe`<br>UDP `127.0.0.1:20777` (`extradata=3`) | `linux/dr2-with-recorder.sh` |
| **EA SPORTS WRC** | `dr2` | `WRC.exe`<br>UDP `127.0.0.1:20777` (`extradata=3`) | `linux/dr2-with-recorder.sh` |
| **Auto-Detect All** | `auto` | Detects via running processes, memory maps, or UDP ports | `linux/sim-with-recorder.sh` |

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

   - **Universal (Recommended for all sims):**
     ```text
     /path/to/recorder/linux/sim-with-recorder.sh %command%
     ```
   - **With GameMode (Recommended on Linux):**
     ```text
     gamemoderun /path/to/recorder/linux/sim-with-recorder.sh %command%
     ```
   - **With GameMode & MangoHud:**
     ```text
     mangohud gamemoderun /path/to/recorder/linux/sim-with-recorder.sh %command%
     ```
   - **Dedicated sim scripts (all still 100% supported):**
     - **ACC:** `/path/to/recorder/linux/acc-with-recorder.sh %command%`
     - **LMU:** `/path/to/recorder/linux/lmu-with-recorder.sh %command%`
     - **AC1 / AC Rally:** `/path/to/recorder/linux/ac-with-recorder.sh %command%`
     - **AC EVO:** `/path/to/recorder/linux/acevo-with-recorder.sh %command%`
     - **DiRT Rally 2.0 / EA WRC:** `/path/to/recorder/linux/dr2-with-recorder.sh %command%`

3. Start the game from Steam as usual. The recorder starts 10 seconds later and stops by itself a few seconds after the game closes. Its log is in `~/.local/state/idoracing-recorder.log`.

If the recorder is missing or the launch command has no Proton, the game starts normally without it. `IDORACING_RECORDER`, `IDORACING_RECORDER_DELAY` and `IDORACING_RECORDER_LOG` override the executable, the delay and the log path.

Session files go to `.../pfx/drive_c/users/steamuser/Documents/IdoRacing/recordings/`, which IdoRacing lists alongside other telemetry files. Pass `-out` to write somewhere else.

### Note for DiRT Rally 2.0 / EA SPORTS WRC
Enable UDP output in `hardware_settings_config.xml` (located in `Documents/My Games/DiRT Rally 2.0/hardwaresettings/`):
```xml
<udp enabled="true" extradata="3" ip="127.0.0.1" port="20777" delay="1" />
```

### Note for Le Mans Ultimate (LMU)
LMU uses the standard rFactor 2 shared memory architecture:
1. Place `rFactor2SharedMemoryMapPlugin64.dll` inside `<Le Mans Ultimate>/Plugins/`.
2. Enable it in `<Le Mans Ultimate>/UserData/player/CustomPluginVariables.JSON`:
```json
{
  "rFactor2SharedMemoryMapPlugin64.dll": {
    " Enabled": 1
  }
}
```
3. Set your Steam Launch Options to `gamemoderun /path/to/recorder/linux/sim-with-recorder.sh %command%` (or `lmu-with-recorder.sh %command%`).
4. On Windows, just start `idoracing-recorder.exe -sim lmu` (or use `-sim auto`).

### Check it under Wine before driving (ACC and LMU Fake Sim)

`tools/fakeacc` and `tools/fakelmu` publish the simulator's shared memory pages with a virtual car lapping a circle, so the whole recorder chain can be tested under Wine without running the actual game:

**ACC:**
```bash
GOOS=windows GOARCH=amd64 go build -o fakeacc.exe ./tools/fakeacc
export WINEPREFIX=/tmp/idoracing-wine-test
wine fakeacc.exe -seconds 30 &
wine idoracing-recorder.exe -out 'C:\recordings' -exit-with fakeacc.exe
ls "$WINEPREFIX/drive_c/recordings"   # one acc_fake_circle_fake_gt3_*.csv
```

**LMU:**
```bash
GOOS=windows GOARCH=amd64 go build -o fakelmu.exe ./tools/fakelmu
export WINEPREFIX=/tmp/idoracing-wine-test
wine fakelmu.exe -seconds 30 &
wine idoracing-recorder.exe -sim lmu -out 'C:\recordings' -exit-with fakelmu.exe
ls "$WINEPREFIX/drive_c/recordings"   # one lmu_Circuit-de-la-Sarthe_Ferrari-499P_*.csv
```

The recorder exits on its own when the fake simulator finishes.

## Run on Windows

Because `idoracing-recorder.exe` is built with `-H=windowsgui`, it runs completely silently in the background: **no command prompt window popups, no taskbar icon, and zero impact on gaming performance** (<0.01% CPU when idle, checking once per second until you hit the track).

Sessions are automatically saved as CSV files with full 50Hz telemetry to:
```text
C:\Users\<YourUser>\Documents\IdoRacing\recordings\
```

### Option 1: Automatic Startup (Set and Forget — Recommended)
To have telemetry automatically recorded whenever you play any simulator without ever thinking about it:
1. Press `Win + R`, type `shell:startup`, and press Enter.
2. Create a shortcut to `idoracing-recorder.exe` inside that folder.
3. Done! The recorder will run quietly in the background on every boot, auto-detecting any game you launch.

### Option 2: Manual Run / Shortcut
Double-click `idoracing-recorder.exe` before or after starting your game. It runs in the background with auto-detection enabled (`-sim auto`). To stop it, close it via Task Manager (`idoracing-recorder.exe`) or run `taskkill /IM idoracing-recorder.exe`.

### Option 3: Auto-exit with Game (Command Line / Batch Script)
You can instruct the recorder to exit automatically as soon as your game closes using the `-exit-with` flag:

```cmd
# Assetto Corsa Competizione (ACC)
idoracing-recorder.exe -exit-with "AC2-Win64-Shipping.exe,acc.exe"

# Le Mans Ultimate (LMU)
idoracing-recorder.exe -sim lmu -exit-with "Le Mans Ultimate.exe,start_protected_game.exe"

# Assetto Corsa 1 & AC Rally
idoracing-recorder.exe -sim ac -exit-with "acs.exe,AssettoCorsa.exe"

# Assetto Corsa EVO
idoracing-recorder.exe -sim acevo -exit-with AssettoCorsaEVO.exe

# DiRT Rally 2.0 & EA SPORTS WRC
idoracing-recorder.exe -sim dr2 -exit-with "dirtrally2.exe,WRC.exe"
```

### Option 4: Steam Launch Options on Windows
If you want Steam to launch the recorder together with the game on Windows, you can set Steam Launch Options to:
```cmd
cmd /c "start /b "" "C:\path\to\idoracing-recorder.exe" -sim auto" && %command%
```

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
