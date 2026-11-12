package main

import (
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestTraceBuffer(t *testing.T) {
	tb := NewTraceBuffer(50)
	if len(tb.Snapshot()) != 0 {
		t.Fatalf("expected empty snapshot, got %d", len(tb.Snapshot()))
	}

	// Push 100 samples into buffer of capacity 50
	for i := 0; i < 100; i++ {
		tb.Push(float64(i)/100.0, 1.0-float64(i)/100.0)
	}

	snap := tb.Snapshot()
	if len(snap) != 50 {
		t.Fatalf("expected 50 samples in sliding window, got %d", len(snap))
	}

	// Verify last sample is index 99
	last := snap[len(snap)-1]
	if last.Gas < 0.98 || last.Gas > 1.0 {
		t.Errorf("expected last gas ~0.99, got %f", last.Gas)
	}
}

func TestTrailBrakingDetection(t *testing.T) {
	tb := NewTraceBuffer(50)

	// Step 1: Initial hard braking (e.g. 85%)
	tb.Push(0.0, 0.85)

	// Step 2: Trail braking phase: driver progressive release (30% brake, 0% gas)
	isTrail := tb.Push(0.0, 0.30)
	if !isTrail {
		t.Errorf("expected trail braking to be detected during progressive release")
	}

	// Step 3: Corner exit: on throttle
	isTrail = tb.Push(0.50, 0.0)
	if isTrail {
		t.Errorf("expected trail braking false while on throttle")
	}

	// Step 4: Straight: off pedals
	isTrail = tb.Push(0.0, 0.0)
	if isTrail {
		t.Errorf("expected trail braking false when pedals are zero")
	}
}

func TestSpotterConfigManager(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "spotter-test-*")
	if err != nil {
		t.Fatalf("mkdir temp: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	cfgPath := filepath.Join(tmpDir, "spotter_config.json")
	initialJSON := `{
  "enabled": true,
  "language": "es",
  "volume": 80
}`
	if err := os.WriteFile(cfgPath, []byte(initialJSON), 0644); err != nil {
		t.Fatalf("write initial json: %v", err)
	}

	sm := NewSpotterManager(cfgPath)
	cfg := sm.Get()
	if !cfg.Enabled || cfg.Volume != 80 || cfg.Language != "es" {
		t.Fatalf("unexpected initial config: %+v", cfg)
	}

	// Test Toggle Mute
	newEnabled := sm.ToggleMute()
	if newEnabled {
		t.Errorf("expected enabled=false after mute toggle")
	}
	// Verify written to disk
	reloaded := sm.Load()
	if reloaded.Enabled {
		t.Errorf("expected disk file to reflect enabled=false")
	}

	// Test Volume Adjust
	newVol := sm.AdjustVolume(15)
	if newVol != 95 {
		t.Errorf("expected volume 95, got %d", newVol)
	}
	// Test clamping to 100
	newVol = sm.AdjustVolume(20)
	if newVol != 100 {
		t.Errorf("expected volume clamped to 100, got %d", newVol)
	}
	// Test clamping to 0
	newVol = sm.AdjustVolume(-150)
	if newVol != 0 {
		t.Errorf("expected volume clamped to 0, got %d", newVol)
	}
}

func TestUDPListener(t *testing.T) {
	testAddr := "127.0.0.1:10899"
	app := NewHUDApp(testAddr, "")
	if err := app.StartUDPListener(); err != nil {
		t.Fatalf("failed to start udp listener: %v", err)
	}
	defer close(app.quitChan)

	// Send packet via UDP
	raddr, err := net.ResolveUDPAddr("udp", testAddr)
	if err != nil {
		t.Fatalf("resolve udp: %v", err)
	}
	sender, err := net.DialUDP("udp", nil, raddr)
	if err != nil {
		t.Fatalf("dial udp: %v", err)
	}
	defer sender.Close()

	pkt := TelemetryPacket{
		Timestamp: 100.5,
		Gas:       0.0,
		Brake:     0.75,
		Gear:      3,
		SpeedKmh:  125.4,
		RPM:       6500,
		MaxRPM:    8000,
	}
	raw, _ := json.Marshal(pkt)
	_, _ = sender.Write(raw)

	// Give a few ms for UDP read loop to process
	time.Sleep(50 * time.Millisecond)

	latest, hasData, _ := app.GetLatest()
	if !hasData {
		t.Fatalf("expected hasData true after sending packet")
	}
	if latest.Gear != 3 || latest.RPM != 6500 || latest.Brake != 0.75 {
		t.Errorf("unexpected packet data: %+v", latest)
	}
}
