package main

import (
	"encoding/json"
	"net"
	"testing"
	"time"
)

func TestBroadcasterDisabled(t *testing.T) {
	if b := NewBroadcaster("off"); b != nil {
		t.Fatalf("expected nil for disabled broadcaster, got %+v", b)
	}
	if b := NewBroadcaster("none"); b != nil {
		t.Fatalf("expected nil for disabled broadcaster, got %+v", b)
	}
}

func TestBroadcasterSendAndReceive(t *testing.T) {
	// Start a local UDP listener on an ephemeral port
	addr, err := net.ResolveUDPAddr("udp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.ListenUDP("udp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	localAddr := listener.LocalAddr().String()
	bcast := NewBroadcaster(localAddr)
	if bcast == nil {
		t.Fatalf("failed to create broadcaster for %s", localAddr)
	}
	defer bcast.Close()

	now := time.Now()
	sample := TelemetrySample{
		RPM:        7800,
		Gear:       4,
		SpeedKmh:   215.5,
		Gas:        1.0,
		Brake:      0.0,
		TC:         1.0,
		ABS:        0.0,
		InPit:      0,
	}
	meta := SessionMetadata{
		Simulator: "Assetto Corsa Competizione",
		Track:     "spa",
		CarModel:  "amr_v8_vantage_gt3",
		MaxRPM:    8500,
	}

	bcast.Send(sample, meta, now)

	buf := make([]byte, 1024)
	_ = listener.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	n, _, err := listener.ReadFrom(buf)
	if err != nil {
		t.Fatalf("failed to receive UDP packet: %v", err)
	}

	var pkt TelemetryPacket
	if err := json.Unmarshal(buf[:n], &pkt); err != nil {
		t.Fatalf("failed to parse JSON packet: %v", err)
	}

	if pkt.RPM != 7800 {
		t.Errorf("RPM = %d; want 7800", pkt.RPM)
	}
	if pkt.MaxRPM != 8500 {
		t.Errorf("MaxRPM = %d; want 8500", pkt.MaxRPM)
	}
	if pkt.Gear != 4 {
		t.Errorf("Gear = %d; want 4", pkt.Gear)
	}
	if pkt.SpeedKmh != 215.5 {
		t.Errorf("SpeedKmh = %v; want 215.5", pkt.SpeedKmh)
	}

	// Test throttle: immediate next send should be suppressed
	bcast.Send(sample, meta, now.Add(5*time.Millisecond))
	_ = listener.SetReadDeadline(time.Now().Add(50 * time.Millisecond))
	_, _, err = listener.ReadFrom(buf)
	if err == nil {
		t.Errorf("expected packet to be throttled, but received one")
	}

	// Send after throttle window: should pass
	bcast.Send(sample, meta, now.Add(30*time.Millisecond))
	_ = listener.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	n, _, err = listener.ReadFrom(buf)
	if err != nil {
		t.Fatalf("expected packet after throttle window, got err: %v", err)
	}
	if err := json.Unmarshal(buf[:n], &pkt); err != nil {
		t.Fatalf("failed to parse second JSON packet: %v", err)
	}
	if pkt.RPM != 7800 {
		t.Errorf("second packet RPM = %d; want 7800", pkt.RPM)
	}
}
