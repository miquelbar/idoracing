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
	_               [25]float32
	TC              float32 // offset 204
	Heading         float32 // offset 208
	_               [10]float32
	ABS             float32 // offset 252
	_               [10]float32
	LocalAngularVel [3]float32 // y is the yaw rate, rad/s (offset 296..308)
	_               [64]float32
	BrakeBias       float32 // offset 564
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
	_                     [7]int32
	TC                    int32 // offset 1268
	TCCut                 int32 // offset 1272
	EngineMap             int32 // offset 1276
	ABS                   int32 // offset 1280
	_                     [31]int32
	IsValidLap            int32 // offset 1408
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
	// If the simulator provides active normalized spline position (e.g. ACC 0.001 .. 1.0), use official spline distance.
	// When normPos is 0.0 (unsupported or zeroed by Kunos in AC EVO), fall through to speed/coordinate tracking.
	if splineLen > 0 && normPos > 0.0001 && normPos <= 1.0 {
		return normPos * splineLen
	}

	// Sanitize lap to avoid resetting distance on uninitialized or negative packet counters
	if lap <= 0 || lap > 500 {
		lap = 1
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

	// Wrap around at official circuit spline length if known
	if splineLen > 500.0 && dt.lapDist >= splineLen {
		dt.lapDist -= splineLen
	}
	return dt.lapDist
}

func decodeStatic(b []byte) staticInfo {
	if len(b) < staticMinimumPageLength {
		return staticInfo{}
	}
	car := wideString(b[staticCarModelOffset : staticCarModelOffset+2*staticNameChars])
	track := wideString(b[staticTrackOffset : staticTrackOffset+2*staticNameChars])
	spline := math.Float32frombits(binary.LittleEndian.Uint32(b[staticSplineLenOffset:]))

	// If offsets were displaced (e.g. AC EVO), scan for printable UTF-16LE strings
	if car == "" || track == "" {
		stringsFound := scanWideStrings(b, 3)
		for _, s := range stringsFound {
			sLower := toLowerASCII(s)
			if car == "" && len(s) >= 4 && (containsAny(sLower, "porsche", "ferrari", "bmw", "audi", "mercedes", "mclaren", "aston", "lamborghini", "gt2", "gt3", "gt4", "ks_") || len(sLower) > 8) {
				car = s
			} else if track == "" && len(s) >= 3 && containsAny(sLower, "ring", "valencia", "monza", "spa", "silverstone", "nurburgring", "barcelona", "zandvoort", "redbull") {
				track = s
			}
		}
	}

	return staticInfo{
		CarModel:          car,
		Track:             track,
		TrackSplineLength: spline,
	}
}

func scanWideStrings(b []byte, minChars int) []string {
	var result []string
	var current []uint16
	for i := 0; i+1 < len(b); i += 2 {
		u := binary.LittleEndian.Uint16(b[i:])
		if u >= 32 && u < 127 {
			current = append(current, u)
		} else {
			if len(current) >= minChars {
				result = append(result, string(utf16.Decode(current)))
			}
			current = current[:0]
		}
	}
	if len(current) >= minChars {
		result = append(result, string(utf16.Decode(current)))
	}
	return result
}

func toLowerASCII(s string) string {
	b := []byte(s)
	for i := 0; i < len(b); i++ {
		if b[i] >= 'A' && b[i] <= 'Z' {
			b[i] += 32
		}
	}
	return string(b)
}

func containsAny(s string, substrs ...string) bool {
	for _, sub := range substrs {
		if len(sub) == 0 {
			continue
		}
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
	}
	return false
}

// playerPosition returns the player's car position on the ground plane (ACC's x and z; y is height).
func (g graphicsPage) playerPosition() (x, y float32, ok bool) {
	for i := 0; i < int(g.ActiveCars) && i < len(g.CarID); i++ {
		if g.CarID[i] == g.PlayerCarID {
			c := g.CarCoordinates[i]
			// Sanitize garbage/uninitialized memory coordinates (e.g. 4.3e21 in AC EVO)
			if math.Abs(float64(c[0])) < 50000 && math.Abs(float64(c[2])) < 50000 && !math.IsNaN(float64(c[0])) && !math.IsNaN(float64(c[2])) {
				return c[0], c[2], true
			}
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
	// A car traveling at racing speed (> 75 km/h) cannot physically be in the pits
	if p.SpeedKmh > 75.0 {
		inPit = 0
	}

	lap := g.CompletedLaps + 1
	if lap <= 0 || lap > 500 {
		lap = 1
	}

	pressures := p.WheelsPressure
	for i := 0; i < 4; i++ {
		if pressures[i] > 0.5 && pressures[i] < 5.0 {
			pressures[i] *= 14.5038 // bar -> psi conversion
		}
	}

	tcVal := float32(g.TC)
	if tcVal <= 0 && p.TC > 0 {
		tcVal = p.TC
	}

	absVal := float32(g.ABS)
	if absVal <= 0 && p.ABS > 0 {
		absVal = p.ABS
	}

	bbVal := p.BrakeBias
	if bbVal > 0 && bbVal <= 1.0 {
		bbVal *= 100.0
	}

	return TelemetrySample{
		PacketID:       p.PacketID,
		Lap:            lap,
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
		WheelsPressure: pressures,
		TC:             tcVal,
		ABS:            absVal,
		BrakeBias:      bbVal,
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
