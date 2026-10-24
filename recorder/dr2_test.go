package main

import (
	"encoding/binary"
	"math"
	"net"
	"testing"
	"time"
)

func TestDR2AdapterPacketDecoding(t *testing.T) {
	adapter := newDR2Adapter()
	if err := adapter.Open(); err != nil {
		t.Fatalf("Open failed: %v", err)
	}
	defer adapter.Close()

	// Synthesize a 264-byte DR2 packet
	var packet [264]byte
	putF32 := func(idx int, val float32) {
		binary.LittleEndian.PutUint32(packet[idx*4:(idx+1)*4], math.Float32bits(val))
	}

	putF32(0, 120.0) // run_time
	putF32(1, 45.2)  // lap_time
	putF32(2, 1250.0) // distance
	putF32(3, 0.45)  // progress
	putF32(4, 150.0) // pos_x
	putF32(5, 12.0)  // pos_y (elevation)
	putF32(6, 320.0) // pos_z (ground plane second axis)
	putF32(7, 30.0)  // speed_ms (108 km/h)
	putF32(29, 0.95) // throttle
	putF32(30, -0.2) // steer
	putF32(31, 0.0)  // brake
	putF32(33, 3.0)  // gear 3
	putF32(34, 1.2)  // latG
	putF32(35, 0.4)  // longG
	putF32(36, 0.0)  // lap count
	putF32(37, 550.0) // rpm / 10 -> 5500 RPM

	// Send packet to local UDP listener
	client, err := net.Dial("udp", "127.0.0.1:20777")
	if err != nil {
		t.Fatalf("Dial failed: %v", err)
	}
	defer client.Close()

	if _, err := client.Write(packet[:]); err != nil {
		t.Fatalf("Write failed: %v", err)
	}

	time.Sleep(10 * time.Millisecond)

	sample, meta, live, err := adapter.Read(time.Now())
	if err != nil {
		t.Fatalf("Read failed: %v", err)
	}
	if !live {
		t.Errorf("Expected live=true while driving")
	}
	if math.Abs(float64(sample.SpeedKmh-108.0)) > 0.01 {
		t.Errorf("Expected speed 108 km/h, got %.2f", sample.SpeedKmh)
	}
	if sample.Gear != 3 {
		t.Errorf("Expected gear 3, got %d", sample.Gear)
	}
	if sample.RPM != 5500 {
		t.Errorf("Expected RPM 5500, got %d", sample.RPM)
	}
	if sample.X != 150.0 || sample.Y != 320.0 {
		t.Errorf("Expected position (150, 320), got (%.1f, %.1f)", sample.X, sample.Y)
	}
	if meta.Simulator != "DiRT Rally 2.0" {
		t.Errorf("Expected simulator DiRT Rally 2.0, got %s", meta.Simulator)
	}
}
