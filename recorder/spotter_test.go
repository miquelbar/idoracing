package main

import (
	"bytes"
	"strings"
	"testing"
	"time"
)

func newTestSpotterWithBuffer() (*Spotter, *bytes.Buffer) {
	buf := &bytes.Buffer{}
	s := NewSpotter()
	s.Out = buf
	s.KeyChecker = nil // manual key control in tests
	return s, buf
}

func TestSpotterUncalibratedPitExit(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	meta := SessionMetadata{Track: "Unknown Desert Circuit", TrackSplineLength: 4000.0}

	now := time.Now()
	// Step 1: In pits
	sample := TelemetrySample{InPit: 1, Lap: 1, LapDistance: 10.0}
	s.Step(sample, meta, true, now)
	if strings.Contains(buf.String(), "PEP_PLAY") {
		t.Fatalf("unexpected cue while still in pit: %s", buf.String())
	}

	// Step 2: Exit pits to track
	buf.Reset()
	sample.InPit = 0
	sample.LapDistance = 150.0
	now = now.Add(time.Second)
	s.Step(sample, meta, true, now)

	out := buf.String()
	if !strings.Contains(out, "PEP_PLAY|radio_start_nodata") {
		t.Fatalf("expected PEP_PLAY|radio_start_nodata on pit exit, got: %s", out)
	}
}

func TestSpotterUncalibratedLapPB(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	meta := SessionMetadata{Track: "Unknown Circuit", TrackSplineLength: 4000.0}
	now := time.Now()

	// Exit pit
	s.Step(TelemetrySample{InPit: 0, Lap: 1, LapDistance: 100.0}, meta, true, now)
	buf.Reset()

	// Lap 1 completes, Lap 2 starts with valid lap time 90000ms
	now = now.Add(12 * time.Second) // past cooldown
	s.Step(TelemetrySample{InPit: 0, Lap: 2, LapDistance: 10.0, LapValid: 1, LastLapTimeMs: 90000}, meta, true, now)

	out := buf.String()
	if !strings.Contains(out, "PEP_PLAY|lap_pb") {
		t.Fatalf("expected PEP_PLAY|lap_pb on new personal best lap, got: %s", out)
	}

	// Lap 2 completes, Lap 3 is slower (92000ms) -> no PB cue
	buf.Reset()
	now = now.Add(12 * time.Second)
	s.Step(TelemetrySample{InPit: 0, Lap: 3, LapDistance: 10.0, LapValid: 1, LastLapTimeMs: 92000}, meta, true, now)
	if strings.Contains(buf.String(), "PEP_PLAY|lap_pb") {
		t.Fatalf("unexpected lap_pb on slower lap: %s", buf.String())
	}
}

func TestSpotterUncalibratedTyrePressureWarning(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	meta := SessionMetadata{Track: "Unknown Circuit", TrackSplineLength: 4000.0}
	now := time.Now()

	// Exit pit
	s.Step(TelemetrySample{InPit: 0, Lap: 1, LapDistance: 100.0}, meta, true, now)
	buf.Reset()

	// Overheat front left tyre (> 27.3 psi)
	now = now.Add(12 * time.Second)
	sample := TelemetrySample{
		InPit:          0,
		Lap:            1,
		LapDistance:    300.0,
		WheelsPressure: [4]float32{27.8, 26.8, 26.5, 26.7},
	}
	s.Step(sample, meta, true, now)

	out := buf.String()
	if !strings.Contains(out, "PEP_PLAY|tyre_hot_fl") {
		t.Fatalf("expected PEP_PLAY|tyre_hot_fl on high front-left tyre pressure, got: %s", out)
	}
}

func TestSpotterCalibratedValenciaFlow(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	meta := SessionMetadata{Track: "Ricardo Tormo de Valencia", TrackSplineLength: 4005.0}

	// Manually inject manifest for Valencia test
	s.Manifest = &SpotterManifest{
		TrackSlug:   "valencia",
		PBLapMs:     98000,
		BubotaLapMs: 97000,
		Hotspots: []SpotterHotspot{
			{
				Slot:          1,
				CornerID:      1,
				CornerName:    "Curva Aspar",
				TriggerDistM:  110.0,
				CornerStartM:  360.0,
				CornerEndM:    640.0,
				TargetBrakeM:  166,
				TargetVMinKmh: 140.0,
				ClipID:        "hotspot_1",
			},
		},
	}
	s.Calibrated = true
	s.ManifestLoaded = true
	s.TrackSlug = "valencia"

	now := time.Now()

	// Step 1: Pit exit in calibrated mode
	s.Step(TelemetrySample{InPit: 0, Lap: 1, LapDistance: 50.0, SpeedKmh: 120.0}, meta, true, now)
	out := buf.String()
	if !strings.Contains(out, "PEP_PLAY|radio_start_guided") {
		t.Fatalf("expected radio_start_guided in calibrated mode, got: %s", out)
	}

	// Step 2: Cross trigger_dist_m (110m) -> Pre-aviso
	buf.Reset()
	now = now.Add(12 * time.Second) // past cooldown
	s.prevDist = 105.0
	s.Step(TelemetrySample{InPit: 0, Lap: 1, LapDistance: 115.0, SpeedKmh: 210.0}, meta, true, now)
	out = buf.String()
	if !strings.Contains(out, "PEP_PLAY|hotspot_1") {
		t.Fatalf("expected PEP_PLAY|hotspot_1 at trigger distance, got: %s", out)
	}

	// Step 3: Inside corner (between 360m and 640m)
	now = now.Add(2 * time.Second)
	s.prevDist = 450.0
	s.Step(TelemetrySample{InPit: 0, Lap: 1, LapDistance: 480.0, SpeedKmh: 142.0}, meta, true, now)

	// Step 4: Exit corner (cross 640m) with vmin 142 km/h >= target (140 - 2 = 138) -> corner_gain
	buf.Reset()
	now = now.Add(12 * time.Second) // past cooldown
	s.prevDist = 635.0
	s.Step(TelemetrySample{InPit: 0, Lap: 1, LapDistance: 645.0, SpeedKmh: 165.0}, meta, true, now)
	out = buf.String()
	if !strings.Contains(out, "PEP_PLAY|corner_gain") {
		t.Fatalf("expected PEP_PLAY|corner_gain on strong corner exit, got: %s", out)
	}
}

func TestSpotterCooldownPreventsDoubleCues(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	now := time.Now()

	// First emit
	ok1 := s.emitWithCooldown("radio_on", now)
	if !ok1 {
		t.Fatal("expected first emit to succeed")
	}

	// Second emit 3 seconds later (< 10s cooldown)
	buf.Reset()
	ok2 := s.emitWithCooldown("hotspot_1", now.Add(3*time.Second))
	if ok2 {
		t.Fatal("expected second emit within 3s to be blocked by cooldown")
	}
	if buf.Len() > 0 {
		t.Fatalf("unexpected output during cooldown: %s", buf.String())
	}

	// Third emit 11 seconds later (> 10s cooldown)
	ok3 := s.emitWithCooldown("hotspot_1", now.Add(11*time.Second))
	if !ok3 {
		t.Fatal("expected third emit after 11s to succeed")
	}
	if !strings.Contains(buf.String(), "PEP_PLAY|hotspot_1") {
		t.Fatalf("expected hotspot_1 after cooldown, got: %s", buf.String())
	}
}

func TestSpotterF9HotkeyMuteToggle(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	now := time.Now()

	// Initial unmuted state
	if s.Muted {
		t.Fatal("spotter should start unmuted")
	}

	// Press F9 -> mute
	s.ToggleMute(now)
	if !s.Muted {
		t.Fatal("expected spotter to be muted after ToggleMute")
	}
	if !strings.Contains(buf.String(), "PEP_PLAY|radio_off") {
		t.Fatalf("expected radio_off on mute, got: %s", buf.String())
	}

	// While muted, normal cues must be suppressed
	buf.Reset()
	ok := s.emitWithCooldown("corner_gain", now.Add(15*time.Second))
	if ok || buf.Len() > 0 {
		t.Fatalf("expected cue to be suppressed while muted, got: %s", buf.String())
	}

	// Press F9 again -> unmute (uncalibrated -> radio_unmute_nodata)
	buf.Reset()
	s.ToggleMute(now.Add(16 * time.Second))
	if s.Muted {
		t.Fatal("expected spotter to be unmuted after second ToggleMute")
	}
	if !strings.Contains(buf.String(), "PEP_PLAY|radio_unmute_nodata") {
		t.Fatalf("expected radio_unmute_nodata on unmute without manifest, got: %s", buf.String())
	}

	// Calibrate and toggle again -> radio_unmute_guided
	s.Calibrated = true
	s.Manifest = &SpotterManifest{
		Hotspots: []SpotterHotspot{{Slot: 1}},
	}
	s.ToggleMute(now.Add(20 * time.Second)) // mute
	buf.Reset()
	s.ToggleMute(now.Add(25 * time.Second)) // unmute
	if !strings.Contains(buf.String(), "PEP_PLAY|radio_unmute_guided") {
		t.Fatalf("expected radio_unmute_guided on unmute with manifest, got: %s", buf.String())
	}
}

func TestSpotterCustomToggleKey(t *testing.T) {
	s := NewSpotter()
	s.ToggleKey = "F10"
	s.VKCode = parseVKCode("F10")
	if s.VKCode != 0x79 {
		t.Fatalf("expected VKCode 0x79 for F10, got 0x%X", s.VKCode)
	}

	pressedKey := uintptr(0)
	s.KeyChecker = func(vk uintptr) bool {
		return vk == pressedKey
	}

	now := time.Now()
	// Pressing F9 should do nothing
	pressedKey = 0x78
	s.Step(TelemetrySample{}, SessionMetadata{}, false, now)
	if s.Muted {
		t.Fatal("F9 should not toggle mute when configured for F10")
	}

	// Pressing F10 should toggle mute
	pressedKey = 0x79
	s.Step(TelemetrySample{}, SessionMetadata{}, false, now)
	if !s.Muted {
		t.Fatal("F10 should toggle mute")
	}
}

func TestSpotterGenericTurnFallback(t *testing.T) {
	s := NewSpotter()
	s.TrackSlug = "custom_unknown_track_123"

	// When track-specific audio does not exist, resolveHotspotClip must fallback to turn_{corner_id}
	h := SpotterHotspot{
		Slot:     1,
		CornerID: 7,
		ClipID:   "hotspot_1",
	}
	clip := s.resolveHotspotClip(h)
	if clip != "turn_7" {
		t.Fatalf("expected fallback clip 'turn_7', got: %s", clip)
	}

	// If corner_id is invalid (0), fallback to slot
	h0 := SpotterHotspot{
		Slot:     4,
		CornerID: 0,
		ClipID:   "hotspot_4",
	}
	clip0 := s.resolveHotspotClip(h0)
	if clip0 != "turn_4" {
		t.Fatalf("expected fallback clip 'turn_4', got: %s", clip0)
	}
}

func TestSpotterParseVKCodeMappings(t *testing.T) {
	cases := []struct {
		keyName string
		wantVK  uintptr
	}{
		{"F9", 120},
		{"f9", 120},
		{"F1", 112},
		{"F12", 123},
		{"A", 65},
		{"z", 90},
		{"0", 48},
		{"9", 57},
		{"Num 0", 96},
		{"NUM *", 106},
		{"SPACE", 32},
		{"Tab", 9},
		{"INS", 45},
		{"DEL", 46},
		{"HOME", 36},
		{"END", 35},
		{"PGUP", 33},
		{"PGDN", 34},
	}

	for _, c := range cases {
		got := parseVKCode(c.keyName)
		if got != c.wantVK {
			t.Errorf("parseVKCode(%q) = %d; want %d", c.keyName, got, c.wantVK)
		}
	}
}
