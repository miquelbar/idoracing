# idoracing-recorder

ACC's MoTeC export has no car position, so IdoRacing cannot measure how far your line sits from your reference lap on ACC laps. This small recorder reads ACC's shared memory while you drive and writes a CSV per session that includes your position on track. Import it into IdoRacing like any other file.

It runs on its own; the IdoRacing app does not need to be open while you drive.

## Footprint

- One thread at below-normal priority, so the game always wins the CPU.
- 30 samples per second while you are on track (`-hz` to change it). Outside the car (menus, replays, pits screen) it checks once a second.
- Nothing is written while the game is paused. Rows are buffered and written to disk once per lap.
- About 2 MB on disk and a few MB of memory.

## Build

```bash
cd recorder
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o idoracing-recorder.exe .
go test ./...
bash linux/test-acc-with-recorder.sh
```

## Run on Linux (Steam + Proton)

ACC's shared memory only exists inside the wineserver that runs the game, so the recorder has to run in the same Proton prefix, with the same Proton build and the same fsync/esync setting. The launch-option script takes care of that by reusing the Proton from the command Steam builds:

1. Put `idoracing-recorder.exe` next to `linux/acc-with-recorder.sh`.
2. In Steam: ACC > Properties > General > Launch options:

   ```
   /path/to/recorder/linux/acc-with-recorder.sh %command%
   ```

3. Start ACC from Steam as usual. The recorder starts 10 seconds later and stops by itself a few seconds after ACC closes. Its log is in `~/.local/state/idoracing-recorder.log`.

If the recorder is missing or the launch command has no Proton, ACC starts normally without it. `IDORACING_RECORDER`, `IDORACING_RECORDER_DELAY` and `IDORACING_RECORDER_LOG` override the executable, the delay and the log path.

Session files go to `~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/IdoRacing/recordings/`, which IdoRacing lists next to ACC's MoTeC files. Pass `-out` to write somewhere else.

### Check it under Wine before driving

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

Start `idoracing-recorder.exe` before or after ACC and leave it running; close it with Ctrl+C, or pass `-exit-with AC2-Win64-Shipping.exe` so it stops with the game. Files go to `Documents\IdoRacing\recordings`.

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

## Not yet verified on a real ACC session

The page layouts follow Kunos' shared memory documentation and are checked against an independent implementation, and the launch-option approach is the one simshmbridge documents for helpers in a game's Proton prefix. This build has not been run against a live ACC yet. On the first run, check that:

- `x`/`y` trace the circuit (IdoRacing's map should match the track);
- `lat_accel` is positive in one direction of turn and negative in the other;
- `lap` and `lap_distance` reset together at the start/finish line.
