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

func TestBroadcasterMultiTarget(t *testing.T) {
	// Start two local UDP listeners
	l1, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	defer l1.Close()

	l2, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.ParseIP("127.0.0.1"), Port: 0})
	if err != nil {
		t.Fatal(err)
	}
	defer l2.Close()

	targets := l1.LocalAddr().String() + "," + l2.LocalAddr().String()
	bcast := NewBroadcaster(targets)
	if bcast == nil {
		t.Fatalf("failed to create multi-target broadcaster for %s", targets)
	}
	defer bcast.Close()

	sample := TelemetrySample{Gas: 0.85, Brake: 0.45, RPM: 6500}
	meta := SessionMetadata{MaxRPM: 8000}
	bcast.Send(sample, meta, time.Now())

	buf := make([]byte, 512)
	_ = l1.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	n1, _, err := l1.ReadFrom(buf)
	if err != nil {
		t.Fatalf("l1 failed to receive broadcast: %v", err)
	}
	var p1 TelemetryPacket
	_ = json.Unmarshal(buf[:n1], &p1)
	if p1.Gas != 0.85 || p1.Brake != 0.45 {
		t.Errorf("l1 received unexpected packet: %+v", p1)
	}

	_ = l2.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	n2, _, err := l2.ReadFrom(buf)
	if err != nil {
		t.Fatalf("l2 failed to receive broadcast: %v", err)
	}
	var p2 TelemetryPacket
	_ = json.Unmarshal(buf[:n2], &p2)
	if p2.Gas != 0.85 || p2.Brake != 0.45 {
		t.Errorf("l2 received unexpected packet: %+v", p2)
	}
}
