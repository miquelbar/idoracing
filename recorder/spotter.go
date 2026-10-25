package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// SpotterManifest represents the track coaching plan exported from the analytics backend.
type SpotterManifest struct {
	TrackSlug    string           `json:"track_slug"`
	TrackLengthM float32          `json:"track_length_m,omitempty"`
	PBLapMs      int              `json:"pb_lap_ms"`
	BubotaLapMs  int              `json:"bubota_lap_ms"`
	Hotspots     []SpotterHotspot `json:"hotspots"`
}

// SpotterHotspot defines a critical corner zone where the driver loses time vs Bubota.
type SpotterHotspot struct {
	Slot          int     `json:"slot"`
	CornerID      int     `json:"corner_id"`
	CornerName    string  `json:"corner_name"`
	TriggerDistM  float32 `json:"trigger_dist_m"`
	CornerStartM  float32 `json:"corner_start_m"`
	CornerEndM    float32 `json:"corner_end_m"`
	TargetBrakeM  int     `json:"target_brake_m"`
	TargetVMinKmh float32 `json:"target_vmin_kmh"`
	ClipID        string  `json:"clip_id"`
}

// Spotter monitors live car telemetry in memory and prints PEP_PLAY|<clip_id> lines to stdout.
type Spotter struct {
	Out       io.Writer
	VoicesDir string
	TrackSlug string

	Manifest       *SpotterManifest
	ManifestLoaded bool
	Calibrated     bool
	Muted          bool

	// State
	inRealtime       bool
	inPit            bool
	pitExitAnnounced bool
	lastEmittedAt    time.Time
	f9WasPressed     bool
	roastCounter     int

	// Lap evaluation
	currentLap int32
	prevDist   float32
	bestLapMs  int32

	// Hotspots tracking
	hotspotsFired map[int]bool
	measuredVmins map[int]float32
	inCorner      map[int]bool

	// Tyre alert state: track whether an alert has fired for each tyre [FL, FR, RL, RR]
	tyreAlertFired [4]bool

	// Toggle key configuration
	ToggleKey string
	VKCode    uintptr

	// Hook for key detection (allows unit testing on Linux)
	KeyChecker func(vk uintptr) bool
}

var vkCodeMap = map[string]uintptr{
	// Function keys
	"F1": 112, "F2": 113, "F3": 114, "F4": 115, "F5": 116, "F6": 117,
	"F7": 118, "F8": 119, "F9": 120, "F10": 121, "F11": 122, "F12": 123,
	// Letters
	"A": 65, "B": 66, "C": 67, "D": 68, "E": 69, "F": 70, "G": 71,
	"H": 72, "I": 73, "J": 74, "K": 75, "L": 76, "M": 77, "N": 78,
	"O": 79, "P": 80, "Q": 81, "R": 82, "S": 83, "T": 84, "U": 85,
	"V": 86, "W": 87, "X": 88, "Y": 89, "Z": 90,
	// Digits
	"0": 48, "1": 49, "2": 50, "3": 51, "4": 52,
	"5": 53, "6": 54, "7": 55, "8": 56, "9": 57,
	// Numpad
	"NUM 0": 96, "NUM 1": 97, "NUM 2": 98, "NUM 3": 99, "NUM 4": 100,
	"NUM 5": 101, "NUM 6": 102, "NUM 7": 103, "NUM 8": 104, "NUM 9": 105,
	"NUM *": 106, "NUMPADMULTIPLY": 106,
	"NUM +": 107, "NUMPADADD": 107,
	"NUM -": 109, "NUMPADSUBTRACT": 109,
	"NUM .": 110, "NUMPADDECIMAL": 110,
	"NUM /": 111, "NUMPADDIVIDE": 111,
	// Control / Navigation
	"SPACE": 32,
	"TAB":   9,
	"`":     192, "BACKQUOTE": 192,
	"INS": 45, "INSERT": 45,
	"DEL": 46, "DELETE": 46,
	"HOME": 36,
	"END":  35,
	"PGUP": 33, "PAGEUP": 33,
	"PGDN": 34, "PAGEDOWN": 34,
}

func parseVKCode(keyName string) uintptr {
	k := strings.ToUpper(strings.TrimSpace(keyName))
	if vk, ok := vkCodeMap[k]; ok {
		return vk
	}
	return 120 // Default to VK_F9 (0x78)
}

func loadSpotterConfigKey() (keyName string, vkCode uintptr, enabled bool) {
	keyName = "F9"
	vkCode = 120
	enabled = true

	candidates := []string{
		filepath.Join("data", "spotter_config.json"),
		filepath.Join("..", "data", "spotter_config.json"),
		filepath.Join("..", "..", "data", "spotter_config.json"),
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "data", "spotter_config.json"),
			filepath.Join(exeDir, "..", "data", "spotter_config.json"),
			filepath.Join(exeDir, "..", "..", "data", "spotter_config.json"),
		)
	}

	for _, p := range candidates {
		data, err := os.ReadFile(p)
		if err == nil {
			var cfg struct {
				Enabled      bool   `json:"enabled"`
				ToggleKey    string `json:"toggle_key"`
				ToggleVKCode int    `json:"toggle_vk_code"`
			}
			if err := json.Unmarshal(data, &cfg); err == nil {
				if cfg.ToggleKey != "" {
					keyName = cfg.ToggleKey
				}
				if cfg.ToggleVKCode > 0 {
					vkCode = uintptr(cfg.ToggleVKCode)
				} else {
					vkCode = parseVKCode(keyName)
				}
				enabled = cfg.Enabled
				return keyName, vkCode, enabled
			}
		}
	}
	return keyName, vkCode, enabled
}

// NewSpotter initializes an active spotter instance.
func NewSpotter() *Spotter {
	keyName, vkCode, enabled := loadSpotterConfigKey()
	return &Spotter{
		Out:           os.Stdout,
		ToggleKey:     keyName,
		VKCode:        vkCode,
		Muted:         !enabled,
		hotspotsFired: make(map[int]bool),
		measuredVmins: make(map[int]float32),
		inCorner:      make(map[int]bool),
		KeyChecker:    checkKey,
	}
}

// Step evaluates a single telemetry frame.
func (s *Spotter) Step(sample TelemetrySample, meta SessionMetadata, live bool, now time.Time) {
	// 1. Hotkey mute/unmute toggle check
	if s.KeyChecker != nil {
		vk := s.VKCode
		if vk == 0 {
			vk = 0x78
		}
		pressed := s.KeyChecker(vk)
		if pressed && !s.f9WasPressed {
			s.ToggleMute(now)
		}
		s.f9WasPressed = pressed
	}

	// 2. Simulator live state check
	if !live {
		s.inRealtime = false
		return
	}

	// Entering track (first realtime frame or track change)
	slug := normalizeTrackSlug(meta.Track)
	if !s.ManifestLoaded || slug != s.TrackSlug {
		s.loadTrackManifest(meta.Track)
	}
	s.inRealtime = true

	trackLen := meta.TrackSplineLength
	if trackLen <= 0 && s.Manifest != nil && s.Manifest.TrackLengthM > 0 {
		trackLen = s.Manifest.TrackLengthM
	}
	if trackLen <= 0 {
		trackLen = 4500.0
	}

	// 3. Pit status & Pit exit detection
	isPit := sample.InPit != 0
	if isPit {
		s.inPit = true
		s.pitExitAnnounced = false
	} else {
		// Car is on track
		if !s.pitExitAnnounced {
			s.pitExitAnnounced = true
			s.inPit = false
			hasManifest := s.Calibrated && s.Manifest != nil && len(s.Manifest.Hotspots) > 0
			if hasManifest {
				s.emitWithCooldown("radio_start_guided", now)
			} else {
				s.emitWithCooldown("radio_start_nodata", now)
			}
		}
	}

	// 4. Lap transition and session PB tracking
	if s.currentLap == 0 {
		s.currentLap = sample.Lap
		s.resetLapHotspots()
	} else if sample.Lap != s.currentLap {
		// Check personal best in uncalibrated mode (or when a valid lap completed)
		if sample.LapValid != 0 && sample.LastLapTimeMs > 20000 {
			if s.bestLapMs <= 0 || sample.LastLapTimeMs < s.bestLapMs {
				s.bestLapMs = sample.LastLapTimeMs
				if !s.Calibrated {
					s.emitWithCooldown("lap_pb", now)
				}
			}
		}
		s.currentLap = sample.Lap
		s.resetLapHotspots()
	}

	// 5. Hotspots pre-aviso and post-corner speed evaluation (Calibrated mode)
	if s.Calibrated && s.Manifest != nil && !isPit {
		for _, h := range s.Manifest.Hotspots {
			slot := h.Slot

			// Pre-aviso: when crossing trigger_dist_m
			if !s.hotspotsFired[slot] {
				if crossedDistance(s.prevDist, sample.LapDistance, h.TriggerDistM, trackLen) {
					s.hotspotsFired[slot] = true
					s.measuredVmins[slot] = 9999.0
					s.inCorner[slot] = false
					clip := s.resolveHotspotClip(h)
					s.emitWithCooldown(clip, now)
				}
			}

			// In corner: monitor apex/minimum speed
			if isInsideCorner(sample.LapDistance, h.CornerStartM, h.CornerEndM, trackLen) {
				s.inCorner[slot] = true
				if sample.SpeedKmh > 10.0 && sample.SpeedKmh < s.measuredVmins[slot] {
					s.measuredVmins[slot] = sample.SpeedKmh
				}
			}

			// Post-corner evaluation: when crossing corner_end_m
			if s.inCorner[slot] && crossedDistance(s.prevDist, sample.LapDistance, h.CornerEndM, trackLen) {
				s.inCorner[slot] = false
				vmin := s.measuredVmins[slot]
				if vmin < 9000.0 {
					diff := vmin - h.TargetVMinKmh
					if diff >= -2.0 {
						s.emitWithCooldown("corner_gain", now)
					} else if diff > -6.0 {
						s.emitWithCooldown("corner_early_brake", now)
					} else {
						s.roastCounter++
						roasts := []string{
							"corner_overshoot",
							"bubota_roast_01",
							"bubota_roast_02",
							"bubota_roast_03",
						}
						clip := roasts[(s.roastCounter-1)%len(roasts)]
						s.emitWithCooldown(clip, now)
					}
				}
			}
		}
	}

	// 6. Tyre pressure warnings (> 27.3 psi) in uncalibrated mode (or both)
	if !s.Calibrated && !isPit {
		names := [4]string{"tyre_hot_fl", "tyre_hot_fr", "tyre_hot_rl", "tyre_hot_rr"}
		for i := 0; i < 4; i++ {
			p := sample.WheelsPressure[i]
			if p > 27.3 && !s.tyreAlertFired[i] {
				s.tyreAlertFired[i] = true
				s.emitWithCooldown(names[i], now)
			}
		}
	}

	s.prevDist = sample.LapDistance
}

// ToggleMute toggles the radio mute state immediately, overriding normal cooldown.
func (s *Spotter) ToggleMute(now time.Time) {
	s.Muted = !s.Muted
	if s.Muted {
		s.emit("radio_off", now)
	} else {
		hasManifest := s.Calibrated && s.Manifest != nil && len(s.Manifest.Hotspots) > 0
		if hasManifest {
			s.emit("radio_unmute_guided", now)
		} else {
			s.emit("radio_unmute_nodata", now)
		}
	}
}

// emitWithCooldown emits an audio event respecting the strict 10s cooldown.
func (s *Spotter) emitWithCooldown(clipID string, now time.Time) bool {
	if s.Muted {
		return false
	}
	if !s.lastEmittedAt.IsZero() && now.Sub(s.lastEmittedAt) < 10*time.Second {
		return false
	}
	s.emit(clipID, now)
	return true
}

func (s *Spotter) emit(clipID string, now time.Time) {
	s.lastEmittedAt = now
	line := fmt.Sprintf("PEP_PLAY|%s", clipID)
	if s.Out != nil {
		fmt.Fprintln(s.Out, line)
	} else {
		fmt.Println(line)
	}
	log.Printf("spotter: %s", line)
}

func (s *Spotter) resetLapHotspots() {
	for k := range s.hotspotsFired {
		delete(s.hotspotsFired, k)
	}
	for k := range s.measuredVmins {
		delete(s.measuredVmins, k)
	}
	for k := range s.inCorner {
		delete(s.inCorner, k)
	}
}

func (s *Spotter) loadTrackManifest(trackName string) {
	slug := normalizeTrackSlug(trackName)
	if slug == "" {
		s.TrackSlug = ""
		s.Manifest = nil
		s.Calibrated = false
		s.ManifestLoaded = true
		return
	}
	s.TrackSlug = slug
	s.Manifest = nil
	s.Calibrated = false
	s.ManifestLoaded = true

	// Announce track slug on stdout so shell wrappers know the circuit directory
	trackLine := fmt.Sprintf("PEP_TRACK|%s", slug)
	if s.Out != nil {
		fmt.Fprintln(s.Out, trackLine)
	} else {
		fmt.Println(trackLine)
	}
	log.Printf("spotter: %s", trackLine)

	candidates := []string{}
	if s.VoicesDir != "" {
		candidates = append(candidates, filepath.Join(s.VoicesDir, "tracks", slug, "manifest.json"))
	}
	candidates = append(candidates,
		filepath.Join("recorder", "voices", "tracks", slug, "manifest.json"),
		filepath.Join("voices", "tracks", slug, "manifest.json"),
		filepath.Join("..", "recorder", "voices", "tracks", slug, "manifest.json"),
		filepath.Join("..", "voices", "tracks", slug, "manifest.json"),
	)
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, "voices", "tracks", slug, "manifest.json"),
			filepath.Join(exeDir, "..", "voices", "tracks", slug, "manifest.json"),
			filepath.Join(exeDir, "..", "recorder", "voices", "tracks", slug, "manifest.json"),
		)
	}

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err == nil {
			var m SpotterManifest
			if err := json.Unmarshal(data, &m); err == nil && len(m.Hotspots) > 0 {
				s.Manifest = &m
				s.Calibrated = true
				log.Printf("spotter: loaded manifest from %s (%d hotspots)", path, len(m.Hotspots))
				return
			}
		}
	}
	log.Printf("spotter: no manifest found for track %s (%s)", trackName, slug)
}

// crossedDistance detects whether the car traversed target during the frame transition.
func crossedDistance(prev, curr, target, trackLen float32) bool {
	if prev < 0 || curr < 0 || trackLen <= 0 {
		return false
	}
	// Normal forward motion without crossing finish line
	if curr >= prev && (curr-prev) < trackLen*0.5 {
		return prev < target && curr >= target
	}
	// Crossing finish line: prev is near trackLen, curr is near 0
	if curr < prev && (prev-curr) > trackLen*0.5 {
		return prev < target || curr >= target
	}
	return false
}

func (s *Spotter) hasTrackClip(clipID string) bool {
	slug := s.TrackSlug
	if slug == "" || clipID == "" {
		return false
	}
	langs := []string{"es", "en"}
	filename := fmt.Sprintf("%s.ogg", clipID)
	candidates := []string{}
	for _, lang := range langs {
		candidates = append(candidates,
			filepath.Join("recorder", "voices", "tracks", slug, lang, filename),
			filepath.Join("voices", "tracks", slug, lang, filename),
			filepath.Join("..", "recorder", "voices", "tracks", slug, lang, filename),
			filepath.Join("..", "voices", "tracks", slug, lang, filename),
		)
		if s.VoicesDir != "" {
			candidates = append(candidates, filepath.Join(s.VoicesDir, "tracks", slug, lang, filename))
		}
		if exe, err := os.Executable(); err == nil {
			exeDir := filepath.Dir(exe)
			candidates = append(candidates,
				filepath.Join(exeDir, "voices", "tracks", slug, lang, filename),
				filepath.Join(exeDir, "..", "voices", "tracks", slug, lang, filename),
				filepath.Join(exeDir, "..", "recorder", "voices", "tracks", slug, lang, filename),
			)
		}
	}
	for _, p := range candidates {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() && fi.Size() > 0 {
			return true
		}
	}
	return false
}

// resolveHotspotClip returns track-specific clip if present, or falls back to turn_{corner_id}
func (s *Spotter) resolveHotspotClip(h SpotterHotspot) string {
	clip := h.ClipID
	if clip == "" {
		clip = fmt.Sprintf("hotspot_%d", h.Slot)
	}
	if s.hasTrackClip(clip) {
		return clip
	}
	cornerID := h.CornerID
	if cornerID <= 0 {
		cornerID = h.Slot
	}
	if cornerID > 0 && cornerID <= 20 {
		return fmt.Sprintf("turn_%d", cornerID)
	}
	return clip
}

// isInsideCorner reports whether dist lies inside [start, end], handling lap wraps.
func isInsideCorner(dist, start, end, trackLen float32) bool {
	if trackLen <= 0 {
		trackLen = 4005.0
	}
	if start <= end {
		return dist >= start && dist <= end
	}
	return dist >= start || dist <= end
}

// normalizeTrackSlug produces a clean directory slug matching backend track names.
func normalizeTrackSlug(track string) string {
	lower := strings.ToLower(strings.TrimSpace(track))
	if strings.Contains(lower, "valencia") || strings.Contains(lower, "ricardo tormo") || strings.Contains(lower, "cheste") {
		return "valencia"
	}
	if strings.Contains(lower, "sebring") {
		return "sebring"
	}
	if strings.Contains(lower, "monza") {
		return "monza"
	}
	if strings.Contains(lower, "spa") {
		return "spa"
	}
	if strings.Contains(lower, "zandvoort") {
		return "zandvoort"
	}
	if strings.Contains(lower, "red bull") || strings.Contains(lower, "spielberg") {
		return "red_bull_ring"
	}
	if strings.Contains(lower, "nurburgring") || strings.Contains(lower, "nuerburgring") {
		return "nurburgring"
	}
	reg := regexp.MustCompile(`[^a-z0-9]+`)
	slug := strings.Trim(reg.ReplaceAllString(lower, "_"), "_")
	if slug == "" {
		return ""
	}
	return slug
}
