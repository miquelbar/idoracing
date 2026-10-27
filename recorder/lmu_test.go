package main

import (
	"bytes"
	"encoding/binary"
	"math"
	"os"
	"strings"
	"testing"
	"time"
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

	// Verify exact struct offsets match MSVC #pragma pack(push, 4) from rF2State.h
	if off := binary.Size(decoded.ID); off != 4 {
		t.Fatalf("ID size = %d; want 4", off)
	}
	if sz := binary.Size(rF2VehicleTelemetryHeader{}); sz != 460 {
		t.Fatalf("rF2VehicleTelemetryHeader binary size = %d; want 460 (MSVC pack=4)", sz)
	}
}

func TestLMUNativeTelemetry(t *testing.T) {
	buf := make([]byte, lmuNativeMapSize)

	// Scoring header: track name & spline length
	copy(buf[lmuNativeScoringOffset:lmuNativeScoringOffset+64], "Circuit de la Sarthe")
	binary.LittleEndian.PutUint64(buf[lmuNativeScoringOffset+96:lmuNativeScoringOffset+104], math.Float64bits(13626.0))

	// Vehicle scoring at index 0: lapDist, lastLap, inPits
	vehScoringOffset := lmuNativeVehScoringOffset
	binary.LittleEndian.PutUint64(buf[vehScoringOffset+108:vehScoringOffset+116], math.Float64bits(1250.5))
	binary.LittleEndian.PutUint64(buf[vehScoringOffset+172:vehScoringOffset+180], math.Float64bits(215.42))
	buf[vehScoringOffset+202] = 0 // not in pit

	// Telemetry header
	buf[lmuNativeTelemOffset] = 1   // activeVehicles
	buf[lmuNativeTelemOffset+1] = 0 // playerVehicleIdx
	buf[lmuNativeTelemOffset+2] = 1 // playerHasVehicle

	// Telemetry vehicle at index 0 (starts at lmuNativeTelemVehOffset)
	telemOffset := lmuNativeTelemVehOffset
	veh := rF2VehicleTelemetryHeader{
		ID:          1,
		DeltaTime:   0.02,
		ElapsedTime: 45.2,
		LapNumber:   2,
		LocalVel: rF2Vec3{
			X: 0,
			Y: 0,
			Z: 60.0, // 60 m/s = 216 km/h
		},
		LocalAccel: rF2Vec3{
			X: 9.80665 * 1.8,
			Y: 0,
			Z: 9.80665 * 0.5,
		},
		LocalRot: rF2Vec3{
			X: 0,
			Y: 0.12,
			Z: 0,
		},
		Gear:             5,
		EngineRPM:        7500,
		FilteredThrottle: 0.90,
		FilteredBrake:    0.0,
		FilteredSteering: 0.10,
	}
	copy(veh.VehicleName[:], "Porsche 911 GT3 R LMGT3")
	copy(veh.TrackName[:], "Le Mans")

	var vehBuf bytes.Buffer
	if err := binary.Write(&vehBuf, binary.LittleEndian, &veh); err != nil {
		t.Fatal(err)
	}
	copy(buf[telemOffset:], vehBuf.Bytes())

	// Set brake bias: 0.46 rear -> 54% front
	binary.LittleEndian.PutUint64(buf[telemOffset+680:telemOffset+688], math.Float64bits(0.46))

	// Set ABS and TC dials
	buf[telemOffset+766] = 3 // TC dial
	buf[telemOffset+772] = 4 // ABS dial

	// Set tyre pressures in kPa (e.g. 190 kPa ~ 27.56 PSI)
	binary.LittleEndian.PutUint64(buf[telemOffset+984:telemOffset+992], math.Float64bits(190.0))
	binary.LittleEndian.PutUint64(buf[telemOffset+1244:telemOffset+1252], math.Float64bits(192.0))
	binary.LittleEndian.PutUint64(buf[telemOffset+1504:telemOffset+1512], math.Float64bits(185.0))
	binary.LittleEndian.PutUint64(buf[telemOffset+1764:telemOffset+1772], math.Float64bits(186.0))

	sample, meta, live, err := decodeLMUNative(buf)
	if err != nil {
		t.Fatalf("decodeLMUNative error: %v", err)
	}
	if !live {
		t.Fatalf("expected live == true")
	}

	if meta.Simulator != "Le Mans Ultimate" || meta.SimPrefix != "lmu" {
		t.Fatalf("unexpected meta: %+v", meta)
	}
	if meta.CarModel != "Porsche 911 GT3 R LMGT3" {
		t.Fatalf("car model = %q; want Porsche 911 GT3 R LMGT3", meta.CarModel)
	}
	if meta.Track != "Le Mans" {
		t.Fatalf("track = %q; want Le Mans", meta.Track)
	}
	if meta.TrackSplineLength != 13626.0 {
		t.Fatalf("spline length = %v; want 13626.0", meta.TrackSplineLength)
	}

	if math.Abs(float64(sample.SpeedKmh-216.0)) > 0.1 {
		t.Fatalf("speedKmh = %v; want 216.0", sample.SpeedKmh)
	}
	if sample.Gear != 5 || sample.RPM != 7500 {
		t.Fatalf("gear=%d, rpm=%d; want 5, 7500", sample.Gear, sample.RPM)
	}
	if math.Abs(float64(sample.Gas-0.90)) > 0.001 {
		t.Fatalf("gas = %v; want 0.90", sample.Gas)
	}
	if math.Abs(float64(sample.BrakeBias-54.0)) > 0.01 {
		t.Fatalf("brakeBias = %v; want 54.0", sample.BrakeBias)
	}
	if sample.TC != 3.0 || sample.ABS != 4.0 {
		t.Fatalf("TC=%v, ABS=%v; want 3, 4", sample.TC, sample.ABS)
	}
	if sample.LapDistance != 1250.5 {
		t.Fatalf("lapDistance = %v; want 1250.5", sample.LapDistance)
	}
	if sample.LastLapTimeMs != 215420 {
		t.Fatalf("lastLapTimeMs = %v; want 215420", sample.LastLapTimeMs)
	}
	if sample.WheelsPressure[0] < 27.5 || sample.WheelsPressure[0] > 27.6 {
		t.Fatalf("pressure_fl = %v; want ~27.56 PSI", sample.WheelsPressure[0])
	}
}

func TestLMUNativeBufferTooShort(t *testing.T) {
	buf := make([]byte, 100)
	sample, meta, live, err := decodeLMUNative(buf)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if live {
		t.Fatalf("expected live == false for truncated buffer")
	}
	if sample.SpeedKmh != 0 || meta.Simulator != "" {
		t.Fatalf("expected empty sample and meta")
	}
}

func TestLMUNativeRecorderPipeline(t *testing.T) {
	buf := make([]byte, lmuNativeMapSize)

	copy(buf[lmuNativeScoringOffset:lmuNativeScoringOffset+64], "Circuit de la Sarthe")
	binary.LittleEndian.PutUint64(buf[lmuNativeScoringOffset+96:lmuNativeScoringOffset+104], math.Float64bits(13626.0))

	vehScoringOffset := lmuNativeVehScoringOffset
	binary.LittleEndian.PutUint64(buf[vehScoringOffset+108:vehScoringOffset+116], math.Float64bits(500.0))
	buf[vehScoringOffset+202] = 0

	buf[lmuNativeTelemOffset] = 1
	buf[lmuNativeTelemOffset+1] = 0
	buf[lmuNativeTelemOffset+2] = 1

	telemOffset := lmuNativeTelemVehOffset
	veh := rF2VehicleTelemetryHeader{
		ID:          10,
		DeltaTime:   0.02,
		ElapsedTime: 10.0,
		LapNumber:   1,
		LocalVel:    rF2Vec3{Z: 50.0}, // 180 km/h
		Gear:        4,
		EngineRPM:   7200,
	}
	copy(veh.VehicleName[:], "Ferrari 499P")
	copy(veh.TrackName[:], "Circuit de la Sarthe")

	var vehBuf bytes.Buffer
	binary.Write(&vehBuf, binary.LittleEndian, &veh)
	copy(buf[telemOffset:], vehBuf.Bytes())

	binary.LittleEndian.PutUint64(buf[telemOffset+680:telemOffset+688], math.Float64bits(0.48)) // 52% front brake bias
	buf[telemOffset+766] = 5                                                                    // TC
	buf[telemOffset+772] = 6                                                                    // ABS
	binary.LittleEndian.PutUint64(buf[telemOffset+984:telemOffset+992], math.Float64bits(195.0))

	sample, meta, live, err := decodeLMUNative(buf)
	if err != nil || !live {
		t.Fatalf("decode failed: live=%v err=%v", live, err)
	}

	dir := t.TempDir()
	rec := &recorder{outDir: dir}
	t0 := time.Date(2026, 10, 26, 15, 30, 0, 0, time.UTC)

	if _, err := rec.stepSample(sample, meta, true, t0); err != nil {
		t.Fatal(err)
	}
	if err := rec.close(); err != nil {
		t.Fatal(err)
	}

	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 1 {
		t.Fatalf("expected 1 file in %s, got %v", dir, files)
	}

	csvData, err := os.ReadFile(dir + "/" + files[0].Name())
	if err != nil {
		t.Fatal(err)
	}
	csvStr := string(csvData)

	if !strings.Contains(csvStr, "# simulator: Le Mans Ultimate\n") {
		t.Fatalf("missing LMU simulator header:\n%s", csvStr)
	}
	if !strings.Contains(csvStr, "# car: Ferrari 499P\n") {
		t.Fatalf("missing car header:\n%s", csvStr)
	}
	if !strings.Contains(csvStr, "5.0,6.0,52.00\n") {
		t.Fatalf("expected TC=5.0, ABS=6.0, brakeBias=52.00 at end of row:\n%s", csvStr)
	}
}

func TestLMUMultiVehiclePlayerSelection(t *testing.T) {
	// Telemetry buffer with 2 vehicles
	tbuf := make([]byte, 16+2*lmuTelemInfoSize)
	binary.LittleEndian.PutUint32(tbuf[0:4], 1)
	binary.LittleEndian.PutUint32(tbuf[4:8], 1)
	binary.LittleEndian.PutUint32(tbuf[12:16], 2) // numVehicles = 2

	// Vehicle 0 (AI: McLaren)
	veh0 := rF2VehicleTelemetryHeader{
		ID:          100,
		DeltaTime:   0.02,
		ElapsedTime: 15.0,
		LocalVel:    rF2Vec3{Z: 27.78}, // 100 km/h
		Gear:        3,
		EngineRPM:   6000,
	}
	copy(veh0.VehicleName[:], "Garage 59 2026 #10:WEC")
	copy(veh0.TrackName[:], "Algarve International Circuit")
	var v0Buf bytes.Buffer
	binary.Write(&v0Buf, binary.LittleEndian, &veh0)
	copy(tbuf[16:], v0Buf.Bytes())

	// Vehicle 1 (Player: Porsche)
	v1Offset := 16 + lmuTelemInfoSize
	veh1 := rF2VehicleTelemetryHeader{
		ID:          200,
		DeltaTime:   0.02,
		ElapsedTime: 15.0,
		LocalVel:    rF2Vec3{Z: 55.56}, // 200 km/h
		Gear:        5,
		EngineRPM:   8500,
	}
	copy(veh1.VehicleName[:], "Porsche 911 GT3 R LMGT3")
	copy(veh1.TrackName[:], "Algarve International Circuit")
	var v1Buf bytes.Buffer
	binary.Write(&v1Buf, binary.LittleEndian, &veh1)
	copy(tbuf[v1Offset:], v1Buf.Bytes())

	// Scoring buffer with 2 vehicles
	sbuf := make([]byte, 572+2*592)
	binary.LittleEndian.PutUint32(sbuf[0:4], 1)
	binary.LittleEndian.PutUint32(sbuf[4:8], 1)
	copy(sbuf[12:12+64], "Algarve International Circuit")
	copy(sbuf[136:136+32], "Miquel Barba")

	// Scoring Vehicle 0 (AI)
	s0 := 572
	binary.LittleEndian.PutUint32(sbuf[s0:s0+4], 100)
	copy(sbuf[s0+4:s0+36], "Antares Au")
	copy(sbuf[s0+36:s0+100], "Garage 59 2026 #10:WEC")
	sbuf[s0+196] = 0 // mIsPlayer = 0
	sbuf[s0+197] = 1 // mControl = AI

	// Scoring Vehicle 1 (Player)
	s1 := 572 + 592
	binary.LittleEndian.PutUint32(sbuf[s1:s1+4], 200)
	copy(sbuf[s1+4:s1+36], "Miquel Barba")
	copy(sbuf[s1+36:s1+100], "Porsche 911 GT3 R LMGT3")
	sbuf[s1+196] = 1 // mIsPlayer = 1
	sbuf[s1+197] = 0 // mControl = Player
	binary.LittleEndian.PutUint64(sbuf[s1+104:s1+112], math.Float64bits(1250.0)) // lapDist

	sample, meta, live, err := decodeLMU(tbuf, sbuf)
	if err != nil || !live {
		t.Fatalf("decodeLMU failed: live=%v err=%v", live, err)
	}

	if meta.CarModel != "Porsche 911 GT3 R LMGT3" {
		t.Errorf("CarModel = %q; want Porsche 911 GT3 R LMGT3", meta.CarModel)
	}
	if math.Abs(float64(sample.SpeedKmh-200.0)) > 1.0 {
		t.Errorf("SpeedKmh = %v; want ~200.0 (got McLaren AI speed instead of Player Porsche)", sample.SpeedKmh)
	}
	if sample.LapDistance != 1250.0 {
		t.Errorf("LapDistance = %v; want 1250.0", sample.LapDistance)
	}
}

func TestLMUSinglePlayerSlotZero(t *testing.T) {
	// In single player practice / hotlap sessions, Player is in slot 0 with ID = 0
	tbuf := make([]byte, 16+lmuTelemInfoSize)
	binary.LittleEndian.PutUint32(tbuf[0:4], 10)
	binary.LittleEndian.PutUint32(tbuf[4:8], 10)
	binary.LittleEndian.PutUint32(tbuf[12:16], 1) // numVehicles = 1

	veh := rF2VehicleTelemetryHeader{
		ID:          0, // ID 0
		DeltaTime:   0.02,
		ElapsedTime: 12.0,
		LocalVel:    rF2Vec3{Z: 40.0}, // 144 km/h
		Gear:        4,
		EngineRPM:   8200,
	}
	copy(veh.VehicleName[:], "Porsche 911 GT3 R LMGT3")
	copy(veh.TrackName[:], "Algarve International Circuit")
	var vBuf bytes.Buffer
	binary.Write(&vBuf, binary.LittleEndian, &veh)
	copy(tbuf[16:], vBuf.Bytes())

	sbuf := make([]byte, 572+592)
	binary.LittleEndian.PutUint32(sbuf[0:4], 10)
	binary.LittleEndian.PutUint32(sbuf[4:8], 10)
	copy(sbuf[12:12+64], "Algarve International Circuit")

	s0 := 572
	binary.LittleEndian.PutUint32(sbuf[s0:s0+4], 0) // ID = 0
	copy(sbuf[s0+4:s0+36], "Miquel Barba")
	copy(sbuf[s0+36:s0+100], "Porsche 911 GT3 R LMGT3")
	sbuf[s0+196] = 1 // mIsPlayer = 1
	sbuf[s0+197] = 0 // mControl = Player
	binary.LittleEndian.PutUint64(sbuf[s0+104:s0+112], math.Float64bits(850.0))

	sample, meta, live, err := decodeLMU(tbuf, sbuf)
	if err != nil || !live {
		t.Fatalf("decodeLMU failed: live=%v err=%v", live, err)
	}

	if meta.CarModel != "Porsche 911 GT3 R LMGT3" {
		t.Errorf("CarModel = %q; want Porsche 911 GT3 R LMGT3", meta.CarModel)
	}
	if math.Abs(float64(sample.SpeedKmh-144.0)) > 1.0 {
		t.Errorf("SpeedKmh = %v; want ~144.0", sample.SpeedKmh)
	}
	if sample.RPM != 8200 {
		t.Errorf("RPM = %d; want 8200", sample.RPM)
	}
	if sample.LapDistance != 850.0 {
		t.Errorf("LapDistance = %v; want 850.0", sample.LapDistance)
	}
}

func TestLMULockedVehicleSession(t *testing.T) {
	// Telemetry buffer with 2 vehicles: Slot 0 = AI Lexus, Slot 1 = Player Porsche
	tbuf := make([]byte, 16+2*lmuTelemInfoSize)
	binary.LittleEndian.PutUint32(tbuf[0:4], 1)
	binary.LittleEndian.PutUint32(tbuf[4:8], 1)
	binary.LittleEndian.PutUint32(tbuf[12:16], 2)

	// Vehicle 0 (AI Lexus, revving)
	veh0 := rF2VehicleTelemetryHeader{
		ID:        100,
		EngineRPM: 5000,
		LocalVel:  rF2Vec3{Z: 20.0},
	}
	copy(veh0.VehicleName[:], "Akkodis ASP Team 2026 #87:WEC")
	var v0 bytes.Buffer
	binary.Write(&v0, binary.LittleEndian, &veh0)
	copy(tbuf[16:], v0.Bytes())

	// Vehicle 1 (Player Porsche)
	veh1 := rF2VehicleTelemetryHeader{
		ID:        200,
		EngineRPM: 8200,
		LocalVel:  rF2Vec3{Z: 50.0},
	}
	copy(veh1.VehicleName[:], "Manthey DK Engineering 2026 #91:LM")
	var v1 bytes.Buffer
	binary.Write(&v1, binary.LittleEndian, &veh1)
	copy(tbuf[16+lmuTelemInfoSize:], v1.Bytes())

	// Call with lockedID = 200 (Player Porsche)
	sample, meta, live, resolvedID, err := decodeLMULocked(tbuf, nil, 200, "Manthey DK Engineering 2026 #91:LM")
	if err != nil || !live {
		t.Fatalf("decodeLMULocked failed: live=%v err=%v", live, err)
	}
	if resolvedID != 200 {
		t.Fatalf("resolvedID = %d; want 200", resolvedID)
	}
	if meta.CarModel != "Manthey DK Engineering 2026 #91:LM" {
		t.Fatalf("CarModel = %q; want Manthey Porsche", meta.CarModel)
	}
	if sample.RPM != 8200 {
		t.Fatalf("RPM = %d; want 8200 (must NOT read AI Lexus at 5000 RPM)", sample.RPM)
	}
}
