package main

import (
	"bytes"
	"encoding/binary"
	"math"
	"time"
	"unicode/utf16"
)

// Layouts of ACC's shared memory pages (Kunos "ACC Shared Memory Documentation", packed to 4 bytes).
// Only the fields the recorder uses are named; the rest are kept as padding so every offset matches.

type physicsPage struct {
	PacketID        int32
	Gas             float32
	Brake           float32
	_               float32 // fuel
	Gear            int32   // 0 = reverse, 1 = neutral, 2 = first
	RPM             int32
	SteerAngle      float32 // -1 .. 1
	SpeedKmh        float32
	_               [3]float32 // velocity
	AccG            [3]float32 // x lateral, y vertical, z longitudinal
	_               [8]float32 // wheelSlip[4] + wheelLoad[4]
	WheelsPressure  [4]float32 // PSI (FL, FR, RL, RR)
	_               [26]float32
	Heading         float32
	_               [21]float32
	LocalAngularVel [3]float32 // y is the yaw rate, rad/s
}

const statusLive = 2

type graphicsPage struct {
	PacketID              int32
	Status                int32
	Session               int32
	_                     [60]uint16 // current, last, best and split time strings
	CompletedLaps         int32
	_                     int32 // position
	CurrentTimeMs         int32
	LastTimeMs            int32
	_                     int32 // best time
	_                     float32
	_                     float32
	IsInPit               int32
	_                     [3]int32
	_                     [34]uint16 // tyre compound
	_                     float32
	NormalizedCarPosition float32
	ActiveCars            int32
	CarCoordinates        [60][3]float32
	CarID                 [60]int32
	PlayerCarID           int32
	_                     [4]int32
	IsInPitLane           int32
	_                     [22]int32
	_                     [16]uint16 // delta lap time
	_                     int32
	_                     [16]uint16 // estimated lap time
	_                     [3]int32
	IsValidLap            int32
}

type staticInfo struct {
	CarModel          string
	Track             string
	TrackSplineLength float32
}

const (
	staticCarModelOffset    = 68
	staticTrackOffset       = 134
	staticNameChars         = 33
	staticSplineLenOffset   = 520
	staticMinimumPageLength = staticSplineLenOffset + 4
)

func decodePhysics(b []byte) (physicsPage, error) {
	var p physicsPage
	err := binary.Read(bytes.NewReader(b), binary.LittleEndian, &p)
	return p, err
}

func decodeGraphics(b []byte) (graphicsPage, error) {
	var g graphicsPage
	err := binary.Read(bytes.NewReader(b), binary.LittleEndian, &g)
	return g, err
}

// distanceTracker provides generic physics/coordinate-based distance tracking.
// Works for closed circuits (with or without official spline lengths) and point A to B rally stages.
type distanceTracker struct {
	lastLap    int32
	prevX      float32
	prevY      float32
	prevTime   time.Time
	lapDist    float32
	learnedLen float32
}

func (dt *distanceTracker) step(x, y float32, hasXY bool, speedKmh float32, normPos float32, splineLen float32, lap int32, now time.Time) float32 {
	if splineLen > 0 && normPos >= 0.0 && normPos <= 1.0 {
		return normPos * splineLen
	}

	// New lap detected on a closed circuit
	if dt.lastLap == 0 {
		dt.lastLap = lap
	} else if lap != dt.lastLap {
		if dt.lapDist > 200.0 {
			dt.learnedLen = dt.lapDist
		}
		dt.lapDist = 0.0
		dt.lastLap = lap
	}

	// Closed circuit with learned length from a completed lap
	if dt.learnedLen > 0 && normPos >= 0.0 && normPos <= 1.0 {
		return normPos * dt.learnedLen
	}

	// Generic displacement accumulation (works for point A to B rally stages, hillclimbs, and first circuit out-lap)
	if !dt.prevTime.IsZero() {
		dtSec := float32(now.Sub(dt.prevTime).Seconds())
		if dtSec > 0 && dtSec < 1.0 {
			if hasXY && (dt.prevX != 0 || dt.prevY != 0) {
				dx := float64(x - dt.prevX)
				dy := float64(y - dt.prevY)
				step := float32(math.Hypot(dx, dy))
				if step > 0.01 && step < 30.0 {
					dt.lapDist += step
				} else if speedKmh > 1.0 {
					dt.lapDist += (speedKmh / 3.6) * dtSec
				}
			} else if speedKmh > 1.0 {
				dt.lapDist += (speedKmh / 3.6) * dtSec
			}
		}
	}
	dt.prevX, dt.prevY, dt.prevTime = x, y, now
	return dt.lapDist
}

func decodeStatic(b []byte) staticInfo {
	if len(b) < staticMinimumPageLength {
		return staticInfo{}
	}
	return staticInfo{
		CarModel:          wideString(b[staticCarModelOffset : staticCarModelOffset+2*staticNameChars]),
		Track:             wideString(b[staticTrackOffset : staticTrackOffset+2*staticNameChars]),
		TrackSplineLength: math.Float32frombits(binary.LittleEndian.Uint32(b[staticSplineLenOffset:])),
	}
}

// playerPosition returns the player's car position on the ground plane (ACC's x and z; y is height).
func (g graphicsPage) playerPosition() (x, y float32, ok bool) {
	for i := 0; i < int(g.ActiveCars) && i < len(g.CarID); i++ {
		if g.CarID[i] == g.PlayerCarID {
			c := g.CarCoordinates[i]
			return c[0], c[2], true
		}
	}
	return 0, 0, false
}

func wideString(b []byte) string {
	units := make([]uint16, 0, len(b)/2)
	for i := 0; i+1 < len(b); i += 2 {
		u := binary.LittleEndian.Uint16(b[i:])
		if u == 0 {
			break
		}
		units = append(units, u)
	}
	return string(utf16.Decode(units))
}

func (p physicsPage) toSample(g graphicsPage, lapDistance float32) TelemetrySample {
	x, y, _ := g.playerPosition()
	inPit := int32(0)
	if g.IsInPit != 0 || g.IsInPitLane != 0 {
		inPit = 1
	}
	return TelemetrySample{
		PacketID:       p.PacketID,
		Lap:            g.CompletedLaps + 1,
		LapDistance:    lapDistance,
		SpeedKmh:       p.SpeedKmh,
		Gas:            p.Gas,
		Brake:          p.Brake,
		Gear:           p.Gear - 1, // ACC counts reverse as 0 and neutral as 1
		SteerAngle:     p.SteerAngle,
		RPM:            p.RPM,
		LatG:           p.AccG[0],
		LongG:          p.AccG[2],
		YawRate:        p.LocalAngularVel[1],
		X:              x,
		Y:              y,
		InPit:          inPit,
		LapValid:       g.IsValidLap,
		WheelsPressure: p.WheelsPressure,
		LastLapTimeMs:  g.LastTimeMs,
	}
}

func (s staticInfo) toMetadata(simulator, simPrefix string) SessionMetadata {
	return SessionMetadata{
		Simulator:         simulator,
		SimPrefix:         simPrefix,
		Track:             s.Track,
		CarModel:          s.CarModel,
		TrackSplineLength: s.TrackSplineLength,
	}
}
