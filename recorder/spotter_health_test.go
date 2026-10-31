package main

import (
	"strings"
	"testing"
	"time"
)

func TestSpotterAlertsOnGarageTeleport(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	s.Muted = false
	meta := SessionMetadata{Track: "Unknown Circuit", TrackSplineLength: 4000.0}
	now := time.Now()

	s.Step(TelemetrySample{Lap: 1, LapDistance: 500, SpeedKmh: 150, X: -292, Y: 541}, meta, true, now)
	if strings.Contains(buf.String(), "rec_lap_aborted") {
		t.Fatalf("no alert expected before the jump: %s", buf.String())
	}
	now = now.Add(50 * time.Millisecond)
	s.Step(TelemetrySample{Lap: 1, LapDistance: 553, SpeedKmh: 0, X: 188, Y: 32, InPit: 1}, meta, true, now)
	if !strings.Contains(buf.String(), "PEP_PLAY|rec_lap_aborted") {
		t.Fatalf("expected rec_lap_aborted after teleport, got: %s", buf.String())
	}

	// The same incident must not repeat within the alert interval.
	buf.Reset()
	now = now.Add(time.Second)
	s.Step(TelemetrySample{Lap: 1, LapDistance: 100, SpeedKmh: 150, X: -292, Y: 541}, meta, true, now)
	if strings.Contains(buf.String(), "rec_lap_aborted") {
		t.Fatalf("alert repeated inside the interval: %s", buf.String())
	}
}

func TestSpotterAlertsWhenLapDistanceStuck(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	s.Muted = false
	meta := SessionMetadata{Track: "Unknown Circuit", TrackSplineLength: 4000.0}
	now := time.Now()
	x := float32(0)
	for i := 0; i < 7; i++ {
		x += 10
		s.Step(TelemetrySample{Lap: 1, LapDistance: 0, SpeedKmh: 120, X: x, Y: 1}, meta, true, now)
		now = now.Add(time.Second)
	}
	if !strings.Contains(buf.String(), "PEP_PLAY|rec_no_distance") {
		t.Fatalf("expected rec_no_distance, got: %s", buf.String())
	}
}

func TestSpotterHealthAlertsRespectMute(t *testing.T) {
	s, buf := newTestSpotterWithBuffer()
	s.Muted = true
	if s.Alert("rec_write_failed", time.Now()) || buf.Len() != 0 {
		t.Fatalf("muted spotter must stay silent, got: %s", buf.String())
	}
}
