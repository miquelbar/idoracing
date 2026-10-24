package main

import (
	"bytes"
	"encoding/binary"
	"math"
	"testing"
)

func TestLMUTelemetryOffsets(t *testing.T) {
	buf := make([]byte, 1024)

	// Header: versionBegin, versionEnd, bytesHint, numVehicles
	binary.LittleEndian.PutUint32(buf[0:4], 2)
	binary.LittleEndian.PutUint32(buf[4:8], 2)
	binary.LittleEndian.PutUint32(buf[8:12], 1024)
	binary.LittleEndian.PutUint32(buf[12:16], 1)

	veh := rF2VehicleTelemetryHeader{
		ID:          42,
		DeltaTime:   0.02,
		ElapsedTime: 120.5,
		LapNumber:   4,
		Pos: rF2Vec3{
			X: 125.5,
			Y: 5.0,
			Z: -450.2,
		},
		LocalVel: rF2Vec3{
			X: 0,
			Y: 0,
			Z: 50.0, // 50 m/s = 180 km/h
		},
		LocalAccel: rF2Vec3{
			X: 9.80665 * 1.5,
			Y: 0,
			Z: -9.80665 * 0.8,
		},
		LocalRot: rF2Vec3{
			X: 0,
			Y: 0.35,
			Z: 0,
		},
		Gear:             4,
		EngineRPM:        8200,
		FilteredThrottle: 0.95,
		FilteredBrake:    0.10,
		FilteredSteering: -0.25,
	}
	copy(veh.VehicleName[:], "Ferrari 499P")
	copy(veh.TrackName[:], "Sebring")

	var vehBuf bytes.Buffer
	if err := binary.Write(&vehBuf, binary.LittleEndian, &veh); err != nil {
		t.Fatal(err)
	}
	copy(buf[16:], vehBuf.Bytes())

	// Decode using the same logic
	var decoded rF2VehicleTelemetryHeader
	if err := binary.Read(bytes.NewReader(buf[16:]), binary.LittleEndian, &decoded); err != nil {
		t.Fatal(err)
	}

	if decoded.ID != 42 || decoded.LapNumber != 4 || decoded.Gear != 4 {
		t.Fatalf("mismatched basic fields: %+v", decoded)
	}
	if cString(decoded.VehicleName[:]) != "Ferrari 499P" {
		t.Fatalf("car name = %q; want Ferrari 499P", cString(decoded.VehicleName[:]))
	}
	if cString(decoded.TrackName[:]) != "Sebring" {
		t.Fatalf("track name = %q; want Sebring", cString(decoded.TrackName[:]))
	}
	speedMs := math.Sqrt(decoded.LocalVel.X*decoded.LocalVel.X + decoded.LocalVel.Y*decoded.LocalVel.Y + decoded.LocalVel.Z*decoded.LocalVel.Z)
	speedKmh := float32(speedMs * 3.6)
	if math.Abs(float64(speedKmh-180.0)) > 0.1 {
		t.Fatalf("speedKmh = %v; want 180.0", speedKmh)
	}
	latG := float32(decoded.LocalAccel.X / 9.80665)
	if math.Abs(float64(latG-1.5)) > 0.01 {
		t.Fatalf("latG = %v; want 1.5", latG)
	}
	if decoded.FilteredThrottle != 0.95 || decoded.FilteredBrake != 0.10 || decoded.FilteredSteering != -0.25 {
		t.Fatalf("pedals/steering mismatch: throttle=%v, brake=%v, steer=%v",
			decoded.FilteredThrottle, decoded.FilteredBrake, decoded.FilteredSteering)
	}
}
