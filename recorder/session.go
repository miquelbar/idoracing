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
	csvColumns     = "time,lap,lap_distance,speed,throttle,brake,gear,steer_angle,rpm,lat_accel,long_accel,yaw_rate,x,y,in_pit,lap_valid,pressure_fl,pressure_fr,pressure_rl,pressure_rr,tc,abs,brake_bias\n"
	bufferSize     = 256 * 1024
)

var unsafeFileChars = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

// recorder turns a stream of shared-memory snapshots into one CSV file per driving session.
type recorder struct {
	outDir string

	file       *os.File
	w          *bufio.Writer
	meta       SessionMetadata
	start      time.Time
	lastPacket int32
	lastLap    int32
	idleSince  time.Time
	row        []byte
}

// step records one snapshot from ACC structures for backwards-compatibility.
func (r *recorder) step(p physicsPage, g graphicsPage, info staticInfo, now time.Time) (live bool, err error) {
	meta := info.toMetadata("Assetto Corsa Competizione", "acc")
	sample := p.toSample(g, g.NormalizedCarPosition*info.TrackSplineLength)
	return r.stepSample(sample, meta, g.Status == statusLive, now)
}

// stepSample records one normalized telemetry sample. It reports whether the session is live.
func (r *recorder) stepSample(s TelemetrySample, meta SessionMetadata, live bool, now time.Time) (bool, error) {
	if !live {
		if r.file != nil && r.idleSince.IsZero() {
			r.idleSince = now
		}
		if r.file != nil && now.Sub(r.idleSince) >= idleCloseAfter {
			return false, r.close()
		}
		return false, nil
	}
	r.idleSince = time.Time{}

	if r.file != nil && (meta.Track != r.meta.Track || meta.CarModel != r.meta.CarModel || meta.Simulator != r.meta.Simulator) {
		if err := r.close(); err != nil {
			return true, err
		}
	}
	if r.file == nil {
		if err := r.open(meta, now); err != nil {
			return true, err
		}
	}

	if s.PacketID == r.lastPacket {
		return true, nil // paused: the physics packet has not advanced
	}
	r.lastPacket = s.PacketID

	if s.Lap != r.lastLap {
		r.lastLap = s.Lap
		if err := r.w.Flush(); err != nil {
			return true, err
		}
	}
	_, err := r.w.Write(r.formatSampleRow(s, now))
	return true, err
}

func (r *recorder) open(meta SessionMetadata, now time.Time) error {
	if err := os.MkdirAll(r.outDir, 0o755); err != nil {
		return err
	}
	prefix := meta.SimPrefix
	if prefix == "" {
		prefix = "acc"
	}
	simName := meta.Simulator
	if simName == "" {
		simName = "Assetto Corsa Competizione"
	}
	name := fmt.Sprintf("%s_%s_%s_%s.csv",
		prefix,
		unsafeFileChars.ReplaceAllString(meta.Track, "-"),
		unsafeFileChars.ReplaceAllString(meta.CarModel, "-"),
		now.Format("20060102-150405"))
	f, err := os.Create(filepath.Join(r.outDir, name))
	if err != nil {
		return err
	}
	r.file, r.w, r.meta, r.start = f, bufio.NewWriterSize(f, bufferSize), meta, now
	r.lastPacket, r.lastLap = -1, -1
	header := fmt.Sprintf(
		"# simulator: %s\n# track: %s\n# car: %s\n# track_length_m: %.1f\n# recorder: idoracing-recorder %s\n%s",
		simName, meta.Track, meta.CarModel, meta.TrackSplineLength, version, csvColumns)
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

func (r *recorder) formatSampleRow(s TelemetrySample, now time.Time) []byte {
	b := r.row[:0]
	b = strconv.AppendFloat(b, now.Sub(r.start).Seconds(), 'f', 3, 64)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(s.Lap), 10)
	b = appendFloat(b, float64(s.LapDistance), 2)
	b = appendFloat(b, float64(s.SpeedKmh), 2)
	b = appendFloat(b, float64(s.Gas), 3)
	b = appendFloat(b, float64(s.Brake), 3)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(s.Gear), 10)
	b = appendFloat(b, float64(s.SteerAngle), 4)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(s.RPM), 10)
	b = appendFloat(b, float64(s.LatG), 3)
	b = appendFloat(b, float64(s.LongG), 3)
	b = appendFloat(b, float64(s.YawRate), 4)
	b = appendFloat(b, float64(s.X), 2)
	b = appendFloat(b, float64(s.Y), 2)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(s.InPit), 10)
	b = append(b, ',')
	b = strconv.AppendInt(b, int64(s.LapValid), 10)
	b = appendFloat(b, float64(s.WheelsPressure[0]), 2)
	b = appendFloat(b, float64(s.WheelsPressure[1]), 2)
	b = appendFloat(b, float64(s.WheelsPressure[2]), 2)
	b = appendFloat(b, float64(s.WheelsPressure[3]), 2)
	b = appendFloat(b, float64(s.TC), 1)
	b = appendFloat(b, float64(s.ABS), 1)
	b = appendFloat(b, float64(s.BrakeBias), 2)
	b = append(b, '\n')
	r.row = b
	return b
}

func (r *recorder) formatRow(p physicsPage, g graphicsPage, now time.Time) []byte {
	return r.formatSampleRow(p.toSample(g, g.NormalizedCarPosition*r.meta.TrackSplineLength), now)
}

func appendFloat(b []byte, v float64, decimals int) []byte {
	return strconv.AppendFloat(append(b, ','), v, 'f', decimals, 64)
}
