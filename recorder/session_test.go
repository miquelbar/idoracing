package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func liveFrame(packet, completedLaps int32, position float32) (physicsPage, graphicsPage) {
	p := physicsPage{PacketID: packet, Gas: 1, SpeedKmh: 200, Gear: 6, RPM: 8000}
	p.AccG[0], p.AccG[2] = 1.2, -0.4
	g := graphicsPage{Status: statusLive, CompletedLaps: completedLaps, NormalizedCarPosition: position,
		ActiveCars: 1, PlayerCarID: 3, IsValidLap: 1}
	g.CarID[0] = 3
	g.CarCoordinates[0] = [3]float32{10, 2, -20}
	return p, g
}

var spa = staticInfo{CarModel: "bmw_m4_gt3", Track: "spa", TrackSplineLength: 7000}

func readOnlyFile(t *testing.T, dir string) string {
	t.Helper()
	files, _ := filepath.Glob(filepath.Join(dir, "*.csv"))
	if len(files) != 1 {
		t.Fatalf("want one session file, got %v", files)
	}
	data, err := os.ReadFile(files[0])
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestRecordsOneRowPerNewPhysicsPacket(t *testing.T) {
	dir := t.TempDir()
	r := &recorder{outDir: dir}
	t0 := time.Date(2026, 10, 19, 15, 0, 0, 0, time.UTC)

	for i, packet := range []int32{10, 11, 11, 12} { // 11 repeats: game paused
		p, g := liveFrame(packet, 0, 0.5)
		if _, err := r.step(p, g, spa, t0.Add(time.Duration(i)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.close(); err != nil {
		t.Fatal(err)
	}

	content := readOnlyFile(t, dir)
	if !strings.Contains(content, "# track: spa\n") || !strings.Contains(content, "# track_length_m: 7000.0\n") {
		t.Fatalf("missing metadata:\n%s", content)
	}
	lines := strings.Split(strings.TrimSpace(content), "\n")
	rows := lines[len(lines)-3:]
	if len(lines) != 9 {
		t.Fatalf("want 5 header lines, the column line and 3 rows, got %d:\n%s", len(lines), content)
	}
	if rows[0] != "0.000,1,3500.00,200.00,1.000,0.000,5,0.0000,8000,1.200,-0.400,0.0000,10.00,-20.00,0,1,0.00,0.00,0.00,0.00,0.0,0.0,0.00" {
		t.Fatalf("unexpected row: %s", rows[0])
	}
}

func TestIdleSessionIsClosedAndANewOneOpensWhenLiveAgain(t *testing.T) {
	dir := t.TempDir()
	r := &recorder{outDir: dir}
	t0 := time.Date(2026, 10, 19, 15, 0, 0, 0, time.UTC)

	p, g := liveFrame(1, 0, 0.1)
	r.step(p, g, spa, t0)
	idle := graphicsPage{Status: 0}
	if live, _ := r.step(p, idle, spa, t0.Add(time.Second)); live {
		t.Fatal("status 0 reported as live")
	}
	r.step(p, idle, spa, t0.Add(time.Second+idleCloseAfter))
	if r.file != nil {
		t.Fatal("file still open after the idle timeout")
	}

	p, g = liveFrame(2, 0, 0.1)
	r.step(p, g, spa, t0.Add(2*idleCloseAfter))
	r.close()
	files, _ := filepath.Glob(filepath.Join(dir, "*.csv"))
	if len(files) != 2 {
		t.Fatalf("want two session files, got %v", files)
	}
}
