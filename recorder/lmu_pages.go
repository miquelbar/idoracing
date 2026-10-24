package main

import (
	"bytes"
	"encoding/binary"
	"math"
)

type rF2Vec3 struct {
	X float64
	Y float64
	Z float64
}

// rF2VehicleTelemetryHeader represents the start of rF2VehicleTelemetry up to driver inputs.
// Layout matches #pragma pack(push, 4) from rF2State.h / rF2Data.cs.
type rF2VehicleTelemetryHeader struct {
	ID                 int32
	DeltaTime          float64
	ElapsedTime        float64
	LapNumber          int32
	LapStartET         float64
	VehicleName        [64]byte
	TrackName          [64]byte
	Pos                rF2Vec3
	LocalVel           rF2Vec3
	LocalAccel         rF2Vec3
	Ori                [3]rF2Vec3
	LocalRot           rF2Vec3
	LocalRotAccel      rF2Vec3
	Gear               int32
	EngineRPM          float64
	EngineWaterTemp    float64
	EngineOilTemp      float64
	ClutchRPM          float64
	UnfilteredThrottle float64
	UnfilteredBrake    float64
	UnfilteredSteering float64
	UnfilteredClutch   float64
	FilteredThrottle   float64
	FilteredBrake      float64
	FilteredSteering   float64
	FilteredClutch     float64
	SteeringArmForce   float64
}

func decodeLMU(tbuf []byte, sbuf []byte) (sample TelemetrySample, meta SessionMetadata, live bool, err error) {
	if len(tbuf) < 16+binary.Size(rF2VehicleTelemetryHeader{}) {
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}

	versionBegin := binary.LittleEndian.Uint32(tbuf[0:4])
	versionEnd := binary.LittleEndian.Uint32(tbuf[4:8])
	numVehicles := int32(binary.LittleEndian.Uint32(tbuf[12:16]))

	// Torn-read protection: if versionBegin != versionEnd or odd, write is in progress
	if versionBegin != versionEnd || (versionBegin%2 != 0) || numVehicles <= 0 {
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}

	var veh rF2VehicleTelemetryHeader
	r := bytes.NewReader(tbuf[16:])
	if err := binary.Read(r, binary.LittleEndian, &veh); err != nil {
		return TelemetrySample{}, SessionMetadata{}, false, err
	}

	trackName := cString(veh.TrackName[:])
	carName := cString(veh.VehicleName[:])
	splineLen := float32(0.0)
	lapDist := float32(0.0)
	inPit := int32(0)

	if len(sbuf) >= 12+64+24 {
		sVerBegin := binary.LittleEndian.Uint32(sbuf[0:4])
		sVerEnd := binary.LittleEndian.Uint32(sbuf[4:8])
		if sVerBegin == sVerEnd && (sVerBegin%2 == 0) {
			sTrack := cString(sbuf[12 : 12+64])
			if sTrack != "" {
				trackName = sTrack
			}
			if len(sbuf) >= 108 {
				bits := binary.LittleEndian.Uint64(sbuf[100:108])
				splineLen = float32(math.Float64frombits(bits))
			}
		}
	}

	speedMs := math.Sqrt(veh.LocalVel.X*veh.LocalVel.X + veh.LocalVel.Y*veh.LocalVel.Y + veh.LocalVel.Z*veh.LocalVel.Z)
	speedKmh := float32(speedMs * 3.6)
	latG := float32(veh.LocalAccel.X / 9.80665)
	longG := float32(veh.LocalAccel.Z / 9.80665)

	lastID := int32(versionBegin / 2)
	live = veh.DeltaTime > 0 && (veh.EngineRPM > 50 || speedKmh > 1.0)

	sample = TelemetrySample{
		PacketID:    lastID,
		Lap:         veh.LapNumber,
		LapDistance: lapDist,
		SpeedKmh:    speedKmh,
		Gas:         float32(veh.FilteredThrottle),
		Brake:       float32(veh.FilteredBrake),
		Gear:        veh.Gear,
		SteerAngle:  float32(veh.FilteredSteering),
		RPM:         int32(veh.EngineRPM),
		LatG:        latG,
		LongG:       longG,
		YawRate:     float32(veh.LocalRot.Y),
		X:           float32(veh.Pos.X),
		Y:           float32(veh.Pos.Z),
		InPit:       inPit,
		LapValid:    1,
	}

	meta = SessionMetadata{
		Simulator:         "Le Mans Ultimate",
		SimPrefix:         "lmu",
		Track:             trackName,
		CarModel:          carName,
		TrackSplineLength: splineLen,
	}

	return sample, meta, live, nil
}

func cString(b []byte) string {
	n := bytes.IndexByte(b, 0)
	if n == -1 {
		n = len(b)
	}
	return string(b[:n])
}
