//go:build windows

// fakeacc publishes ACC's three shared memory pages with a car lapping a 200 m radius circle, so the
// recorder can be tested under Wine without the game. It runs for the given number of seconds.
package main

import (
	"encoding/binary"
	"flag"
	"log"
	"math"
	"syscall"
	"time"
	"unicode/utf16"
	"unsafe"
)

var (
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	procCreateFileMappingW = kernel32.NewProc("CreateFileMappingW")
)

const (
	pageReadWrite = 0x04
	fileMapWrite  = 0x0002
	pageSize      = 4096
	radius        = 200.0
	speedKmh      = 144.0
)

func createPage(name string) []byte {
	namePtr, _ := syscall.UTF16PtrFromString(name)
	invalidHandle := ^uintptr(0)
	h, _, err := procCreateFileMappingW.Call(invalidHandle, 0, pageReadWrite, 0, pageSize, uintptr(unsafe.Pointer(namePtr)))
	if h == 0 {
		log.Fatalf("create %s: %v", name, err)
	}
	addr, err := syscall.MapViewOfFile(syscall.Handle(h), fileMapWrite, 0, 0, pageSize)
	if err != nil {
		log.Fatalf("map %s: %v", name, err)
	}
	return unsafe.Slice((*byte)(unsafe.Pointer(addr)), pageSize)
}

func putF32(b []byte, off int, v float64) {
	binary.LittleEndian.PutUint32(b[off:], math.Float32bits(float32(v)))
}
func putI32(b []byte, off int, v int) { binary.LittleEndian.PutUint32(b[off:], uint32(int32(v))) }
func putWide(b []byte, off int, s string) {
	for i, u := range utf16.Encode([]rune(s)) {
		binary.LittleEndian.PutUint16(b[off+2*i:], u)
	}
}

func main() {
	seconds := flag.Int("seconds", 20, "how long to publish data")
	flag.Parse()

	physics := createPage(`Local\acpmf_physics`)
	graphics := createPage(`Local\acpmf_graphics`)
	static := createPage(`Local\acpmf_static`)

	lapLength := 2 * math.Pi * radius
	putWide(static, 68, "fake_gt3")
	putWide(static, 134, "fake_circle")
	putF32(static, 520, lapLength)

	start := time.Now()
	for packet := 1; time.Since(start) < time.Duration(*seconds)*time.Second; packet++ {
		elapsed := time.Since(start).Seconds()
		driven := elapsed * speedKmh / 3.6
		angle := driven / radius
		putI32(physics, 0, packet)
		putF32(physics, 4, 1)  // gas
		putI32(physics, 16, 5) // fourth gear
		putI32(physics, 20, 7000)
		putF32(physics, 28, speedKmh)
		putF32(physics, 44, 0.8) // lateral G on a steady circle

		putI32(graphics, 4, 2) // live
		putI32(graphics, 132, int(driven/lapLength))
		putF32(graphics, 248, math.Mod(driven, lapLength)/lapLength)
		putI32(graphics, 252, 1) // active cars
		putF32(graphics, 256, radius*math.Cos(angle))
		putF32(graphics, 264, radius*math.Sin(angle)) // z, the ground plane's second axis
		putI32(graphics, 976, 42)                     // car id
		putI32(graphics, 1216, 42)                    // player car id
		putI32(graphics, 1408, 1)                     // lap valid
		time.Sleep(10 * time.Millisecond)
	}
}
