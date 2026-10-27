package main

import (
	"bytes"
	"encoding/binary"
	"math"
	"strings"
)

type rF2Vec3 struct {
	X float64
	Y float64
	Z float64
}

// rF2VehicleTelemetryHeader represents the start of TelemInfoV01 / rF2VehicleTelemetry up to driver inputs.
// Layout matches #pragma pack(push, 4) from InternalsPlugin.hpp / rF2State.h.
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

const (
	lmuNativeMapSize = 328192

	// Layout offsets in Studio 397 LMU_Data (SharedMemoryObjectOut)
	lmuNativeScoringOffset    = 1656
	lmuNativeVehScoringOffset = 2232 // vehScoringInfo[104], 600 bytes each
	lmuNativeTelemOffset      = 130168
	lmuNativeTelemVehOffset   = 130172 // telemInfo[104], 1904 bytes each

	// Sizes of sub-structures in native LMU_Data vs rF2 shared memory plugin
	lmuNativeTelemInfoSize = 1904
	lmuTelemInfoSize       = 1888 // sizeof(TelemInfoV01) from InternalsPlugin.hpp with #pragma pack(push, 4)
	lmuVehScoringInfoSize  = 592  // sizeof(VehicleScoringInfoV01) from InternalsPlugin.hpp

	// Conversion constant from kPa to PSI
	kpaToPsi = 0.14503774
)

// decodeLMUNative decodes the native Studio 397 "LMU_Data" shared memory layout.
func decodeLMUNative(buf []byte) (sample TelemetrySample, meta SessionMetadata, live bool, err error) {
	if len(buf) < lmuNativeTelemVehOffset+lmuTelemInfoSize {
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}

	activeVehicles := buf[lmuNativeTelemOffset]
	playerVehicleIdx := int(buf[lmuNativeTelemOffset+1])
	playerHasVehicle := buf[lmuNativeTelemOffset+2] != 0

	if activeVehicles == 0 || playerVehicleIdx >= int(activeVehicles) {
		playerVehicleIdx = 0
	}

	telemStart := lmuNativeTelemVehOffset + playerVehicleIdx*lmuTelemInfoSize
	if telemStart+lmuTelemInfoSize > len(buf) {
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}
	telemBuf := buf[telemStart : telemStart+lmuTelemInfoSize]

	var veh rF2VehicleTelemetryHeader
	if err := binary.Read(bytes.NewReader(telemBuf[:binary.Size(rF2VehicleTelemetryHeader{})]), binary.LittleEndian, &veh); err != nil {
		return TelemetrySample{}, SessionMetadata{}, false, err
	}

	trackName := strings.TrimSpace(cString(veh.TrackName[:]))
	carName := strings.TrimSpace(cString(veh.VehicleName[:]))
	splineLen := float32(0.0)
	lapDist := float32(0.0)
	inPit := int32(0)
	lastLapTimeMs := int32(0)

	// Read scoring data if available
	if len(buf) >= lmuNativeScoringOffset+104 {
		sTrack := strings.TrimSpace(cString(buf[lmuNativeScoringOffset : lmuNativeScoringOffset+64]))
		if sTrack != "" && (trackName == "" || trackName == "Unknown track") {
			trackName = sTrack
		}
		splineLen = float32(math.Float64frombits(binary.LittleEndian.Uint64(buf[lmuNativeScoringOffset+96 : lmuNativeScoringOffset+104])))
	}

	vehScoringStart := lmuNativeVehScoringOffset + playerVehicleIdx*lmuVehScoringInfoSize
	if vehScoringStart+lmuVehScoringInfoSize <= len(buf) {
		vScoring := buf[vehScoringStart : vehScoringStart+lmuVehScoringInfoSize]
		rawDist := math.Float64frombits(binary.LittleEndian.Uint64(vScoring[108:116]))
		if !math.IsNaN(rawDist) && rawDist >= 0 {
			lapDist = float32(rawDist)
		}
		rawLastLap := math.Float64frombits(binary.LittleEndian.Uint64(vScoring[172:180]))
		if !math.IsNaN(rawLastLap) && rawLastLap > 0 {
			lastLapTimeMs = int32(rawLastLap * 1000.0)
		}
		if vScoring[202] != 0 {
			inPit = 1
		}
	}

	speedMs := math.Sqrt(veh.LocalVel.X*veh.LocalVel.X + veh.LocalVel.Y*veh.LocalVel.Y + veh.LocalVel.Z*veh.LocalVel.Z)
	speedKmh := float32(speedMs * 3.6)
	latG := float32(veh.LocalAccel.X / 9.80665)
	longG := float32(veh.LocalAccel.Z / 9.80665)

	// Extra vehicle channels from TelemInfoV01
	rearBrakeBias := math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[680:688]))
	brakeBiasPct := float32(0.0)
	if rearBrakeBias > 0.0 && rearBrakeBias < 1.0 {
		brakeBiasPct = float32((1.0 - rearBrakeBias) * 100.0)
	}

	absActive := telemBuf[762] != 0
	tcActive := telemBuf[763] != 0
	tcDial := float32(telemBuf[766])
	absDial := float32(telemBuf[772])

	tcVal := tcDial
	if tcVal == 0 && tcActive {
		tcVal = 1.0
	}
	absVal := absDial
	if absVal == 0 && absActive {
		absVal = 1.0
	}

	var pressures [4]float32
	pressures[0] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[984:992]))) * kpaToPsi
	pressures[1] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[1244:1252]))) * kpaToPsi
	pressures[2] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[1504:1512]))) * kpaToPsi
	pressures[3] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[1764:1772]))) * kpaToPsi

	lastID := int32(math.Round(veh.ElapsedTime * 1000.0))
	if lastID == 0 {
		lastID = veh.ID
	}
	live = (playerHasVehicle || activeVehicles > 0) && (veh.EngineRPM > 50 || speedKmh > 1.0)

	sample = TelemetrySample{
		PacketID:       lastID,
		Lap:            veh.LapNumber,
		LapDistance:    lapDist,
		SpeedKmh:       speedKmh,
		Gas:            float32(veh.FilteredThrottle),
		Brake:          float32(veh.FilteredBrake),
		Gear:           veh.Gear,
		SteerAngle:     float32(veh.FilteredSteering),
		RPM:            int32(veh.EngineRPM),
		LatG:           latG,
		LongG:          longG,
		YawRate:        float32(veh.LocalRot.Y),
		X:              float32(veh.Pos.X),
		Y:              float32(veh.Pos.Z),
		InPit:          inPit,
		LapValid:       1,
		WheelsPressure: pressures,
		TC:             tcVal,
		ABS:            absVal,
		BrakeBias:      brakeBiasPct,
		LastLapTimeMs:  lastLapTimeMs,
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

// decodeLMU decodes legacy rFactor 2 shared memory plugin pages ($rFactor2SMMP_Telemetry$ and $rFactor2SMMP_Scoring$).
func decodeLMU(tbuf []byte, sbuf []byte) (sample TelemetrySample, meta SessionMetadata, live bool, err error) {
	s, m, l, _, err := decodeLMULocked(tbuf, sbuf, -1, "")
	return s, m, l, err
}

// decodeLMULocked decodes rFactor 2 shared memory pages locked to a specific player vehicle ID.
func decodeLMULocked(tbuf []byte, sbuf []byte, lockedID int32, lockedCar string) (sample TelemetrySample, meta SessionMetadata, live bool, resolvedID int32, err error) {
	if len(tbuf) < 16+binary.Size(rF2VehicleTelemetryHeader{}) {
		return TelemetrySample{}, SessionMetadata{}, false, -1, nil
	}

	versionBegin := binary.LittleEndian.Uint32(tbuf[0:4])
	versionEnd := binary.LittleEndian.Uint32(tbuf[4:8])
	numVehicles := int32(binary.LittleEndian.Uint32(tbuf[12:16]))

	// Torn-read protection: if versionBegin != versionEnd, write is in progress
	if versionBegin != versionEnd || numVehicles <= 0 {
		return TelemetrySample{}, SessionMetadata{}, false, -1, nil
	}

	trackName := ""
	carName := ""
	splineLen := float32(0.0)
	lapDist := float32(0.0)
	inPit := int32(0)
	lastLapTimeMs := int32(0)

	playerID := lockedID
	playerCarName := lockedCar

	// 1. Process scoring page ($rFactor2SMMP_Scoring$) if available to locate player
	if len(sbuf) >= 12+64+24 {
		sVerBegin := binary.LittleEndian.Uint32(sbuf[0:4])
		sVerEnd := binary.LittleEndian.Uint32(sbuf[4:8])
		if sVerBegin == sVerEnd {
			sTrack := strings.TrimSpace(cString(sbuf[12 : 12+64]))
			if sTrack != "" {
				trackName = sTrack
			}
			if len(sbuf) >= 116 {
				bits := binary.LittleEndian.Uint64(sbuf[108:116])
				splineLen = float32(math.Float64frombits(bits))
			}

			var playerName string
			if len(sbuf) >= 168 {
				playerName = strings.TrimSpace(cString(sbuf[136:168]))
			}

			// Scan vehicle scoring array starting at offset 572 (rF2Scoring header 12 + rF2ScoringInfo 560)
			// Each vehicle scoring struct (VehicleScoringInfoV01) has:
			//   mID: int32 at offset 0
			//   mDriverName: [32]byte at offset 4..36
			//   mVehicleName: [64]byte at offset 36..100
			//   mLapDist: float64 at offset 104..112
			//   mLastLapTime: float64 at offset 168..176
			//   mIsPlayer: uint8 at offset 196
			//   mControl: int8 at offset 197 (0 = player)
			//   mInPits: uint8 at offset 198
			// Stride is 592 bytes (sizeof(VehicleScoringInfoV01)).
			scoringVehOffset := 572
			vehStride := lmuVehScoringInfoSize
			if len(sbuf) >= scoringVehOffset+vehStride {
				sNumVehicles := int(numVehicles)
				if len(sbuf) >= 128 {
					sn := int(binary.LittleEndian.Uint32(sbuf[124:128]))
					if sn > 0 && sn <= 128 {
						sNumVehicles = sn
					}
				}

				for v := 0; v < sNumVehicles; v++ {
					vOffset := scoringVehOffset + v*vehStride
					if vOffset+200 > len(sbuf) {
						break
					}
					vID := int32(binary.LittleEndian.Uint32(sbuf[vOffset : vOffset+4]))
					isPlayer := sbuf[vOffset+196] != 0
					driverName := strings.TrimSpace(cString(sbuf[vOffset+4 : vOffset+36]))

					matched := false
					if playerID != -1 {
						matched = (vID == playerID)
					} else {
						matched = isPlayer
						if !matched && playerName != "" && driverName == playerName {
							matched = true
						}
					}

					if matched {
						playerID = vID
						playerCarName = strings.TrimSpace(cString(sbuf[vOffset+36 : vOffset+100]))

						rawDist := math.Float64frombits(binary.LittleEndian.Uint64(sbuf[vOffset+104 : vOffset+112]))
						if !math.IsNaN(rawDist) && rawDist >= 0 {
							lapDist = float32(rawDist)
						}
						rawLastLap := math.Float64frombits(binary.LittleEndian.Uint64(sbuf[vOffset+168 : vOffset+176]))
						if !math.IsNaN(rawLastLap) && rawLastLap > 0 {
							lastLapTimeMs = int32(rawLastLap * 1000.0)
						}
						if sbuf[vOffset+198] != 0 {
							inPit = 1
						}
						break
					}
				}
			}
		}
	}

	// 2. Select vehicle in telemetry buffer ($rFactor2SMMP_Telemetry$)
	playerTelemIdx := -1
	telemStride := lmuTelemInfoSize
	if numVehicles > 0 {
		for v := 0; v < int(numVehicles); v++ {
			vOffset := 16 + v*telemStride
			if vOffset+binary.Size(rF2VehicleTelemetryHeader{}) > len(tbuf) {
				break
			}
			vID := int32(binary.LittleEndian.Uint32(tbuf[vOffset : vOffset+4]))
			vName := strings.TrimSpace(cString(tbuf[vOffset+32 : vOffset+96]))

			if playerID != -1 && vID == playerID {
				playerTelemIdx = v
				break
			}
			if playerCarName != "" && vName == playerCarName {
				playerTelemIdx = v
				break
			}
		}
	}

	// Active car fallback: if scoring did not match, identify the car actively being driven
	if playerTelemIdx == -1 {
		for v := 0; v < int(numVehicles); v++ {
			vOffset := 16 + v*telemStride
			if vOffset+binary.Size(rF2VehicleTelemetryHeader{}) > len(tbuf) {
				break
			}
			var vHead rF2VehicleTelemetryHeader
			if err := binary.Read(bytes.NewReader(tbuf[vOffset:]), binary.LittleEndian, &vHead); err == nil {
				vSpeed := math.Sqrt(vHead.LocalVel.X*vHead.LocalVel.X + vHead.LocalVel.Y*vHead.LocalVel.Y + vHead.LocalVel.Z*vHead.LocalVel.Z)
				if vHead.EngineRPM > 50 || vSpeed > 0.5 || vHead.FilteredThrottle > 0.05 {
					playerTelemIdx = v
					playerID = vHead.ID
					break
				}
			}
		}
	}
	if playerTelemIdx == -1 {
		playerTelemIdx = 0
	}

	telemStart := 16 + playerTelemIdx*telemStride
	if telemStart+binary.Size(rF2VehicleTelemetryHeader{}) > len(tbuf) {
		telemStart = 16
	}

	var veh rF2VehicleTelemetryHeader
	r := bytes.NewReader(tbuf[telemStart:])
	if err := binary.Read(r, binary.LittleEndian, &veh); err != nil {
		return TelemetrySample{}, SessionMetadata{}, false, playerID, err
	}

	if trackName == "" {
		trackName = strings.TrimSpace(cString(veh.TrackName[:]))
	}
	carName = strings.TrimSpace(cString(veh.VehicleName[:]))
	if playerCarName != "" {
		carName = playerCarName
	}

	speedMs := math.Sqrt(veh.LocalVel.X*veh.LocalVel.X + veh.LocalVel.Y*veh.LocalVel.Y + veh.LocalVel.Z*veh.LocalVel.Z)
	speedKmh := float32(speedMs * 3.6)
	latG := float32(veh.LocalAccel.X / 9.80665)
	longG := float32(veh.LocalAccel.Z / 9.80665)

	var pressures [4]float32
	brakeBiasPct := float32(0.0)
	tcVal := float32(0.0)
	absVal := float32(0.0)

	// If tbuf contains full TelemInfoV01
	if telemStart+lmuTelemInfoSize <= len(tbuf) {
		telemBuf := tbuf[telemStart : telemStart+lmuTelemInfoSize]
		rearBrakeBias := math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[664:672]))
		if rearBrakeBias > 0.0 && rearBrakeBias < 1.0 {
			brakeBiasPct = float32((1.0 - rearBrakeBias) * 100.0)
		}

		absActive := telemBuf[746] != 0
		tcActive := telemBuf[747] != 0
		tcDial := float32(telemBuf[750])
		absDial := float32(telemBuf[756])

		tcVal = tcDial
		if tcVal == 0 && tcActive {
			tcVal = 1.0
		}
		absVal = absDial
		if absVal == 0 && absActive {
			absVal = 1.0
		}

		pressures[0] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[968:976]))) * kpaToPsi
		pressures[1] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[1228:1236]))) * kpaToPsi
		pressures[2] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[1488:1496]))) * kpaToPsi
		pressures[3] = float32(math.Float64frombits(binary.LittleEndian.Uint64(telemBuf[1748:1756]))) * kpaToPsi
	}

	lastID := int32(versionBegin)
	live = (veh.EngineRPM > 50 || speedKmh > 1.0 || veh.DeltaTime > 0)

	sample = TelemetrySample{
		PacketID:       lastID,
		Lap:            veh.LapNumber,
		LapDistance:    lapDist,
		SpeedKmh:       speedKmh,
		Gas:            float32(veh.FilteredThrottle),
		Brake:          float32(veh.FilteredBrake),
		Gear:           veh.Gear,
		SteerAngle:     float32(veh.FilteredSteering),
		RPM:            int32(veh.EngineRPM),
		LatG:           latG,
		LongG:          longG,
		YawRate:        float32(veh.LocalRot.Y),
		X:              float32(veh.Pos.X),
		Y:              float32(veh.Pos.Z),
		InPit:          inPit,
		LapValid:       1,
		WheelsPressure: pressures,
		TC:             tcVal,
		ABS:            absVal,
		BrakeBias:      brakeBiasPct,
		LastLapTimeMs:  lastLapTimeMs,
	}

	meta = SessionMetadata{
		Simulator:         "Le Mans Ultimate",
		SimPrefix:         "lmu",
		Track:             trackName,
		CarModel:          carName,
		TrackSplineLength: splineLen,
	}

	return sample, meta, live, playerID, nil
}

func cString(b []byte) string {
	n := bytes.IndexByte(b, 0)
	if n == -1 {
		n = len(b)
	}
	return string(b[:n])
}
