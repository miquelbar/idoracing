package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestMultiSimRecording(t *testing.T) {
	tests := []struct {
		simName    string
		simPrefix  string
		wantHeader string
	}{
		{"Assetto Corsa Competizione", "acc", "# simulator: Assetto Corsa Competizione\n"},
		{"Le Mans Ultimate", "lmu", "# simulator: Le Mans Ultimate\n"},
		{"Assetto Corsa", "ac", "# simulator: Assetto Corsa\n"},
		{"Assetto Corsa Rally", "acrally", "# simulator: Assetto Corsa Rally\n"},
		{"Assetto Corsa EVO", "acevo", "# simulator: Assetto Corsa EVO\n"},
	}

	for _, tc := range tests {
		t.Run(tc.simPrefix, func(t *testing.T) {
			dir := t.TempDir()
			r := &recorder{outDir: dir}
			t0 := time.Date(2026, 10, 24, 12, 0, 0, 0, time.UTC)

			meta := SessionMetadata{
				Simulator:         tc.simName,
				SimPrefix:         tc.simPrefix,
				Track:             "monza",
				CarModel:          "gt3_car",
				TrackSplineLength: 5793.0,
			}
			sample := TelemetrySample{
				PacketID:    1,
				Lap:         2,
				LapDistance: 1200.5,
				SpeedKmh:    245.5,
				Gas:         1.0,
				Brake:       0.0,
				Gear:        5,
				SteerAngle:  0.02,
				RPM:         7800,
				LatG:        0.15,
				LongG:       0.8,
				YawRate:     0.01,
				X:           100.2,
				Y:           -200.4,
				InPit:       0,
				LapValid:    1,
			}

			live, err := r.stepSample(sample, meta, true, t0)
			if err != nil {
				t.Fatal(err)
			}
			if !live {
				t.Fatal("expected live to be true")
			}
			if err := r.close(); err != nil {
				t.Fatal(err)
			}

			files, err := filepath.Glob(filepath.Join(dir, tc.simPrefix+"_*.csv"))
			if err != nil || len(files) != 1 {
				t.Fatalf("expected 1 file with prefix %s_, got %v", tc.simPrefix, files)
			}

			data, err := os.ReadFile(files[0])
			if err != nil {
				t.Fatal(err)
			}
			content := string(data)
			if !strings.Contains(content, tc.wantHeader) {
				t.Fatalf("content missing simulator header %q:\n%s", tc.wantHeader, content)
			}
			if !strings.Contains(content, "# track: monza\n") || !strings.Contains(content, "# car: gt3_car\n") {
				t.Fatalf("content missing track/car:\n%s", content)
			}
			if !strings.Contains(content, "0.000,2,1200.50,245.50,1.000,0.000,5,0.0200,7800,0.150,0.800,0.0100,100.20,-200.40,0,1") {
				t.Fatalf("content row mismatch:\n%s", content)
			}
		})
	}
}
