//go:build windows

// fakelmu publishes LMU's $rFactor2SMMP_Telemetry$ and $rFactor2SMMP_Scoring$ shared memory pages
// with a car driving in a circle, so the recorder can be tested under Wine/Proton without the game.
package main

import (
	"bytes"
	"encoding/binary"
	"flag"
	"log"
	"math"
	"syscall"
	"time"
	"unsafe"
)

var (
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	procCreateFileMappingW = kernel32.NewProc("CreateFileMappingW")
)

const (
	pageReadWrite        = 0x04
	fileMapWrite         = 0x0002
	lmuPageSize          = 2 * 1024 * 1024
	lmuTelemetryPageName = "$rFactor2SMMP_Telemetry$"
	lmuScoringPageName   = "$rFactor2SMMP_Scoring$"
	radius               = 200.0
	speedKmh             = 144.0
)

func createPage(name string, size int) []byte {
	namePtr, _ := syscall.UTF16PtrFromString(name)
	invalidHandle := ^uintptr(0)
	h, _, err := procCreateFileMappingW.Call(invalidHandle, 0, pageReadWrite, 0, uintptr(size), uintptr(unsafe.Pointer(namePtr)))
	if h == 0 {
		log.Fatalf("create %s: %v", name, err)
	}
	addr, err := syscall.MapViewOfFile(syscall.Handle(h), fileMapWrite, 0, 0, uintptr(size))
	if err != nil {
		log.Fatalf("map %s: %v", name, err)
	}
	return unsafe.Slice((*byte)(unsafe.Pointer(addr)), size)
}

type rF2Vec3 struct {
	X float64
	Y float64
	Z float64
}

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

func main() {
	seconds := flag.Int("seconds", 20, "how long to publish data")
	flag.Parse()

	telemetry := createPage(lmuTelemetryPageName, lmuPageSize)
	scoring := createPage(lmuScoringPageName, lmuPageSize)

	lapLength := 2 * math.Pi * radius
	speedMs := speedKmh / 3.6

	var carName [64]byte
	copy(carName[:], "Ferrari 499P")
	var trackName [64]byte
	copy(trackName[:], "Circuit de la Sarthe")

	start := time.Now()
	for packet := 1; time.Since(start) < time.Duration(*seconds)*time.Second; packet++ {
		elapsed := time.Since(start).Seconds()
		driven := elapsed * speedMs
		angle := driven / radius
		lapNum := int32(driven/lapLength) + 1

		v := uint32(packet * 2)

		// Setup scoring page
		binary.LittleEndian.PutUint32(scoring[0:4], v)
		binary.LittleEndian.PutUint32(scoring[4:8], v)
		copy(scoring[12:76], trackName[:])
		binary.LittleEndian.PutUint64(scoring[100:108], math.Float64bits(lapLength))

		// Setup vehicle telemetry
		veh := rF2VehicleTelemetryHeader{
			ID:                 1,
			DeltaTime:          0.02,
			ElapsedTime:        elapsed,
			LapNumber:          lapNum,
			VehicleName:        carName,
			TrackName:          trackName,
			Pos:                rF2Vec3{X: radius * math.Cos(angle), Y: 0, Z: radius * math.Sin(angle)},
			LocalVel:           rF2Vec3{X: 0, Y: 0, Z: speedMs},
			LocalAccel:         rF2Vec3{X: 0.8 * 9.80665, Y: 0, Z: 0},
			Gear:               4,
			EngineRPM:          7800,
			FilteredThrottle:   1.0,
			UnfilteredThrottle: 1.0,
		}

		var buf bytes.Buffer
		binary.Write(&buf, binary.LittleEndian, &veh)
		vehBytes := buf.Bytes()

		// Write telemetry page with version lock
		binary.LittleEndian.PutUint32(telemetry[0:4], v-1) // writing
		binary.LittleEndian.PutUint32(telemetry[12:16], 1)  // numVehicles = 1
		copy(telemetry[16:], vehBytes)
		binary.LittleEndian.PutUint32(telemetry[4:8], v)   // versionEnd
		binary.LittleEndian.PutUint32(telemetry[0:4], v)   // versionBegin

		time.Sleep(20 * time.Millisecond) // 50 Hz
	}
}
