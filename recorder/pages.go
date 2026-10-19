package main

import (
	"bytes"
	"encoding/binary"
	"math"
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
	_               [38]float32
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
