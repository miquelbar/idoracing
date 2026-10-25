package main

import (
	"encoding/binary"
	"math"
	"testing"
	"time"
	"unicode/utf16"
)

// Offsets from the ACC shared memory documentation; the test writes values there and expects the
// decoded struct to pick them up, so a miscounted padding field fails loudly.

func putF32(b []byte, off int, v float32) {
	binary.LittleEndian.PutUint32(b[off:], math.Float32bits(v))
}
func putI32(b []byte, off int, v int32) { binary.LittleEndian.PutUint32(b[off:], uint32(v)) }

func TestPhysicsOffsets(t *testing.T) {
	b := make([]byte, 800)
	putF32(b, 4, 0.75)   // gas
	putF32(b, 8, 0.25)   // brake
	putI32(b, 16, 4)     // gear (third)
	putI32(b, 20, 7200)  // rpm
	putF32(b, 24, -0.3)  // steer
	putF32(b, 28, 187.5) // speed
	putF32(b, 44, 1.4)   // lateral G
	putF32(b, 52, -0.9)  // longitudinal G
	putF32(b, 208, 1.57) // heading
	putF32(b, 300, 0.42) // yaw rate

	p, err := decodePhysics(b)
	if err != nil {
		t.Fatal(err)
	}
	if p.Gas != 0.75 || p.Brake != 0.25 || p.Gear != 4 || p.RPM != 7200 || p.SteerAngle != -0.3 ||
		p.SpeedKmh != 187.5 || p.AccG[0] != 1.4 || p.AccG[2] != -0.9 || p.Heading != 1.57 ||
		p.LocalAngularVel[1] != 0.42 {
		t.Fatalf("physics decoded at wrong offsets: %+v", p)
	}
}

func TestGraphicsOffsets(t *testing.T) {
	b := make([]byte, 1600)
	putI32(b, 4, statusLive)
	putI32(b, 132, 5)       // completed laps
	putI32(b, 140, 83456)   // current lap time, ms
	putI32(b, 160, 1)       // in pit
	putF32(b, 248, 0.5)     // normalized position
	putI32(b, 252, 2)       // active cars
	putF32(b, 256+12, 100)  // car 1 x
	putF32(b, 256+16, 5)    // car 1 height
	putF32(b, 256+20, -250) // car 1 z
	putI32(b, 976+4, 7)     // car 1 id
	putI32(b, 1216, 7)      // player car id
	putI32(b, 1236, 1)      // in pit lane
	putI32(b, 1408, 1)      // lap valid

	g, err := decodeGraphics(b)
	if err != nil {
		t.Fatal(err)
	}
	if g.Status != statusLive || g.CompletedLaps != 5 || g.CurrentTimeMs != 83456 || g.IsInPit != 1 ||
		g.NormalizedCarPosition != 0.5 || g.IsInPitLane != 1 || g.IsValidLap != 1 {
		t.Fatalf("graphics decoded at wrong offsets: %+v", g)
	}
	x, y, ok := g.playerPosition()
	if !ok || x != 100 || y != -250 {
		t.Fatalf("player position = %v, %v, %v; want 100, -250 on the ground plane", x, y, ok)
	}
}

func TestStaticInfo(t *testing.T) {
	b := make([]byte, 820)
	for i, u := range utf16.Encode([]rune("amr_v8_vantage_gt3")) {
		binary.LittleEndian.PutUint16(b[68+2*i:], u)
	}
	for i, u := range utf16.Encode([]rune("spa")) {
		binary.LittleEndian.PutUint16(b[134+2*i:], u)
	}
	putF32(b, 520, 7004)

	s := decodeStatic(b)
	if s.CarModel != "amr_v8_vantage_gt3" || s.Track != "spa" || s.TrackSplineLength != 7004 {
		t.Fatalf("static = %+v", s)
	}
}

func TestDistanceTrackerRallyPointToPoint(t *testing.T) {
	var dt distanceTracker
	now := time.Now()

	// Simulate a 5 km rally stage from Point A to Point B
	// Lap remains 1 throughout, splineLen is 0 (point-to-point stage)
	totalSteps := 500
	stepDist := float32(10.0) // 10 meters per step
	var currentDist float32

	for i := 0; i <= totalSteps; i++ {
		// Moving diagonally along the ground plane
		x := float32(i) * 8.0
		y := float32(i) * 6.0 // hypot(8, 6) = 10m
		speedKmh := float32(120.0)
		tStep := now.Add(time.Duration(i*100) * time.Millisecond)

		currentDist = dt.step(x, y, true, speedKmh, 0.0, 0.0, 1, tStep)
	}

	expectedDist := float32(totalSteps) * stepDist // 5000m
	if math.Abs(float64(currentDist-expectedDist)) > 20.0 {
		t.Fatalf("rally stage distance = %v; want ~%v", currentDist, expectedDist)
	}

	// Verify the stage is point-to-point (open track): start != finish
	startX, startY := float32(0.0), float32(0.0)
	finishX := float32(totalSteps) * 8.0
	finishY := float32(totalSteps) * 6.0
	gap := math.Hypot(float64(finishX-startX), float64(finishY-startY))
	if gap < 4000.0 {
		t.Fatalf("expected open rally stage with start != finish, got gap = %v", gap)
	}
}

func TestDistanceTrackerClosedCircuit(t *testing.T) {
	var dt distanceTracker
	now := time.Now()

	// Lap 1: Drive an uncalibrated circuit loop (e.g. Valencia with splineLen = 0)
	// Circle of circumference ~4000m -> radius R = 4000 / (2 * pi) ~ 636.62m
	circumference := float64(4000.0)
	radius := circumference / (2.0 * math.Pi)
	steps := 400

	for i := 0; i < steps; i++ {
		angle := (float64(i) / float64(steps)) * 2.0 * math.Pi
		x := float32(radius * math.Cos(angle))
		y := float32(radius * math.Sin(angle))
		tStep := now.Add(time.Duration(i*100) * time.Millisecond)

		dt.step(x, y, true, 144.0, float32(i)/float32(steps), 0.0, 1, tStep)
	}

	// Lap 2 begins: crossing start/finish line, lap increments to 2
	tLap2 := now.Add(time.Duration(steps*100) * time.Millisecond)
	// Start of lap 2 at normPos = 0.0
	d0 := dt.step(float32(radius), 0, true, 144.0, 0.0, 0.0, 2, tLap2)
	if d0 != 0.0 {
		t.Fatalf("lap 2 start distance = %v; want 0.0", d0)
	}

	// Learned length must be approximately 4000m
	if math.Abs(float64(dt.learnedLen-4000.0)) > 50.0 {
		t.Fatalf("circuit learnedLen = %v; want ~4000m", dt.learnedLen)
	}

	// Mid-lap on lap 2: normPos = 0.5 should report ~2000m
	tMid := tLap2.Add(50 * time.Second)
	dMid := dt.step(0, float32(radius), true, 144.0, 0.5, 0.0, 2, tMid)
	if math.Abs(float64(dMid-2000.0)) > 30.0 {
		t.Fatalf("lap 2 mid-lap distance = %v; want ~2000m", dMid)
	}
}

func TestDistanceTrackerBogusLapAndGarbageCoords(t *testing.T) {
	var dt distanceTracker
	now := time.Now()

	// In AC EVO, coordinates may be uninitialized, and lap may fluctuate.
	// Speed integration should accumulate smoothly and not reset every frame.
	speedKmh := float32(180.0)      // 50 m/s
	dtStep := 20 * time.Millisecond // 50Hz

	var lastDist float32
	for i := 0; i < 50; i++ { // 1 second total -> 50m
		tStep := now.Add(time.Duration(i) * dtStep)
		// Alternating bogus lap 0 and 1
		bogusLap := int32(i % 2)
		lastDist = dt.step(4.3e21, 0, false, speedKmh, 0, 4318.0, bogusLap, tStep)
	}

	if lastDist < 45.0 || lastDist > 55.0 {
		t.Fatalf("expected distance ~50m, got %v", lastDist)
	}
}

func TestToSamplePitSpeedOverride(t *testing.T) {
	p := physicsPage{SpeedKmh: 120.0}
	g := graphicsPage{IsInPit: 1, IsInPitLane: 1}
	sample := p.toSample(g, 100.0)
	if sample.InPit != 0 {
		t.Fatalf("expected InPit=0 at 120 km/h, got %d", sample.InPit)
	}

	pLow := physicsPage{SpeedKmh: 40.0}
	sampleLow := pLow.toSample(g, 10.0)
	if sampleLow.InPit != 1 {
		t.Fatalf("expected InPit=1 at 40 km/h with pit flags, got %d", sampleLow.InPit)
	}
}
