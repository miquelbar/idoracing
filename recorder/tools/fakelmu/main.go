//go:build windows

// fakelmu publishes LMU's native "LMU_Data" and legacy $rFactor2SMMP_Telemetry$ / $rFactor2SMMP_Scoring$
// shared memory pages with a car driving in a circle, so the recorder can be tested under Wine/Proton without the game.
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
	lmuNativeSize        = 328192
	lmuNativePageName    = "LMU_Data"
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

	log.Printf("fakelmu: publishing LMU_Data (%d bytes) and legacy SMMP pages for %d seconds...", lmuNativeSize, *seconds)
	nativeData := createPage(lmuNativePageName, lmuNativeSize)
	telemetry := createPage(lmuTelemetryPageName, lmuPageSize)
	scoring := createPage(lmuScoringPageName, lmuPageSize)

	lapLength := 2 * math.Pi * radius
	speedMs := speedKmh / 3.6

	var carName [64]byte
	copy(carName[:], "Porsche 911 GT3 R LMGT3")
	var trackName [64]byte
	copy(trackName[:], "Circuit de la Sarthe")

	start := time.Now()
	for packet := 1; time.Since(start) < time.Duration(*seconds)*time.Second; packet++ {
		elapsed := time.Since(start).Seconds()
		driven := elapsed * speedMs
		angle := driven / radius
		lapNum := int32(driven/lapLength) + 1
		lapDist := driven - float64(lapNum-1)*lapLength

		v := uint32(packet * 2)

		// 1. Setup legacy scoring page
		binary.LittleEndian.PutUint32(scoring[0:4], v)
		binary.LittleEndian.PutUint32(scoring[4:8], v)
		copy(scoring[12:76], trackName[:])
		binary.LittleEndian.PutUint64(scoring[100:108], math.Float64bits(lapLength))

		// 2. Setup vehicle telemetry header
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

		// 3. Write legacy telemetry page with version lock
		binary.LittleEndian.PutUint32(telemetry[0:4], v-1) // writing
		binary.LittleEndian.PutUint32(telemetry[12:16], 1)  // numVehicles = 1
		copy(telemetry[16:], vehBytes)
		binary.LittleEndian.PutUint32(telemetry[4:8], v)   // versionEnd
		binary.LittleEndian.PutUint32(telemetry[0:4], v)   // versionBegin

		// 4. Write native Studio 397 LMU_Data page
		// Scoring: track name and lap distance
		copy(nativeData[1656:1656+64], trackName[:])
		binary.LittleEndian.PutUint64(nativeData[1656+96:1656+104], math.Float64bits(lapLength))
		binary.LittleEndian.PutUint64(nativeData[2232+108:2232+116], math.Float64bits(lapDist))
		nativeData[2232+202] = 0 // not in pits

		// Telemetry header
		nativeData[130168] = 1   // activeVehicles
		nativeData[130168+1] = 0 // playerVehicleIdx
		nativeData[130168+2] = 1 // playerHasVehicle

		// Player vehicle telemetry
		telemOff := 130172
		copy(nativeData[telemOff:], vehBytes)
		binary.LittleEndian.PutUint64(nativeData[telemOff+680:telemOff+688], math.Float64bits(0.46)) // 54% front brake bias
		nativeData[telemOff+766] = 3                                                                  // TC dial 3
		nativeData[telemOff+772] = 4                                                                  // ABS dial 4
		// Tyre pressures ~ 190 kPa = 27.56 PSI
		binary.LittleEndian.PutUint64(nativeData[telemOff+984:telemOff+992], math.Float64bits(190.0))
		binary.LittleEndian.PutUint64(nativeData[telemOff+1244:telemOff+1252], math.Float64bits(191.0))
		binary.LittleEndian.PutUint64(nativeData[telemOff+1504:telemOff+1512], math.Float64bits(185.0))
		binary.LittleEndian.PutUint64(nativeData[telemOff+1764:telemOff+1772], math.Float64bits(186.0))

		time.Sleep(20 * time.Millisecond) // 50 Hz
	}
	log.Printf("fakelmu: finished publishing.")
}
