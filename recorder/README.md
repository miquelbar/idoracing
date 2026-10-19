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
```

## Run

**Windows:** start `idoracing-recorder.exe` before or after launching ACC and leave it running. Close it with Ctrl+C.

**Linux (Steam + Proton):** ACC's shared memory only exists inside its Proton prefix, so the recorder has to run there too, not as a Linux program. With [protontricks](https://github.com/Matoking/protontricks) installed, start ACC and then:

```bash
protontricks-launch --appid 805550 /path/to/idoracing-recorder.exe
```

Session files go to `Documents\IdoRacing\recordings` of the user running it. Under Proton that is `~/.local/share/Steam/steamapps/compatdata/805550/pfx/drive_c/users/steamuser/Documents/IdoRacing/recordings/`, which IdoRacing lists next to ACC's MoTeC files. Pass `-out` to write somewhere else.

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

The page layouts follow Kunos' shared memory documentation and are checked against an independent implementation, but this build has not been run against a live ACC yet. On the first run, check that:

- `x`/`y` trace the circuit (IdoRacing's map should match the track);
- `lat_accel` is positive in one direction of turn and negative in the other;
- `lap` and `lap_distance` reset together at the start/finish line.
