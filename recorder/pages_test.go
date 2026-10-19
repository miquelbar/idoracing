package main

import (
	"encoding/binary"
	"math"
	"testing"
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
