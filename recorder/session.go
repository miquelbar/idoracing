package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"time"
)

const (
	// A session file is closed once ACC has not been live for this long (menus, replays, quitting).
	idleCloseAfter = 60 * time.Second
	csvColumns     = "time,lap,lap_distance,speed,throttle,brake,gear,steer_angle,rpm,lat_accel,long_accel,yaw_rate,x,y,in_pit,lap_valid\n"
	bufferSize     = 256 * 1024
)

var unsafeFileChars = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

// recorder turns a stream of shared-memory snapshots into one CSV file per driving session.
type recorder struct {
	outDir string

	file       *os.File
	w          *bufio.Writer
	info       staticInfo
	start      time.Time
	lastPacket int32
	lastLap    int32
	idleSince  time.Time
	row        []byte
}

// step records one snapshot. It reports whether ACC is live, so the caller can poll slowly when it is not.
func (r *recorder) step(p physicsPage, g graphicsPage, info staticInfo, now time.Time) (live bool, err error) {
	if g.Status != statusLive {
		if r.file != nil && r.idleSince.IsZero() {
			r.idleSince = now
		}
		if r.file != nil && now.Sub(r.idleSince) >= idleCloseAfter {
			return false, r.close()
		}
		return false, nil
	}
	r.idleSince = time.Time{}

	if r.file != nil && (info.Track != r.info.Track || info.CarModel != r.info.CarModel) {
		if err := r.close(); err != nil {
			return true, err
		}
	}
	if r.file == nil {
		if err := r.open(info, now); err != nil {
			return true, err
		}
	}

	if p.PacketID == r.lastPacket {
		return true, nil // paused: the physics page has not advanced
	}
	r.lastPacket = p.PacketID

	if g.CompletedLaps != r.lastLap {
		r.lastLap = g.CompletedLaps
		if err := r.w.Flush(); err != nil {
			return true, err
		}
	}
	_, err = r.w.Write(r.formatRow(p, g, now))
	return true, err
}

func (r *recorder) open(info staticInfo, now time.Time) error {
	if err := os.MkdirAll(r.outDir, 0o755); err != nil {
		return err
	}
	name := fmt.Sprintf("acc_%s_%s_%s.csv",
		unsafeFileChars.ReplaceAllString(info.Track, "-"),
		unsafeFileChars.ReplaceAllString(info.CarModel, "-"),
		now.Format("20060102-150405"))
	f, err := os.Create(filepath.Join(r.outDir, name))
	if err != nil {
		return err
	}
	r.file, r.w, r.info, r.start = f, bufio.NewWriterSize(f, bufferSize), info, now
	r.lastPacket, r.lastLap = -1, -1
	header := fmt.Sprintf(
		"# simulator: Assetto Corsa Competizione\n# track: %s\n# car: %s\n# track_length_m: %.1f\n# recorder: idoracing-recorder %s\n%s",
		info.Track, info.CarModel, info.TrackSplineLength, version, csvColumns)
	_, err = r.w.WriteString(header)
	return err
}

func (r *recorder) close() error {
	if r.file == nil {
		return nil
	}
	flushErr := r.w.Flush()
	closeErr := r.file.Close()
	r.file, r.w = nil, nil
	if flushErr != nil {
		return flushErr
	}
	return closeErr
}

func (r *recorder) formatRow(p physicsPage, g graphicsPage, now time.Time) []byte {
	x, y, _ := g.playerPosition()
	inPit := 0
	if g.IsInPit != 0 || g.IsInPitLane != 0 {
		inPit = 1
	}
	b := r.row[:0]
	b = strconv.AppendFloat(b, now.Sub(r.start).Seconds(), 'f', 3, 64)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(g.CompletedLaps)+1, 10)
	b = appendFloat(b, float64(g.NormalizedCarPosition)*float64(r.info.TrackSplineLength), 2)
	b = appendFloat(b, float64(p.SpeedKmh), 2)
	b = appendFloat(b, float64(p.Gas), 3)
	b = appendFloat(b, float64(p.Brake), 3)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(p.Gear)-1, 10) // ACC counts reverse as 0 and neutral as 1
	b = appendFloat(b, float64(p.SteerAngle), 4)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(p.RPM), 10)
	b = appendFloat(b, float64(p.AccG[0]), 3)
	b = appendFloat(b, float64(p.AccG[2]), 3)
	b = appendFloat(b, float64(p.LocalAngularVel[1]), 4)
	b = appendFloat(b, float64(x), 2)
	b = appendFloat(b, float64(y), 2)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(inPit), 10)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(g.IsValidLap), 10)
	b = append(b, '\n')
	r.row = b
	return b
}

func appendFloat(b []byte, v float64, decimals int) []byte {
	return strconv.AppendFloat(append(b, ','), v, 'f', decimals, 64)
}
