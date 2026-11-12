package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// TelemetryPacket matches the JSON structure emitted by the Go broadcaster on port 10824.
type TelemetryPacket struct {
	Timestamp float64 `json:"timestamp"`
	Gas       float64 `json:"gas"`
	Brake     float64 `json:"brake"`
	Gear      int     `json:"gear"`
	SpeedKmh  float64 `json:"speed_kmh"`
	RPM       int     `json:"rpm"`
	MaxRPM    int     `json:"max_rpm"`
	Clutch    float64 `json:"clutch"`
	Steer     float64 `json:"steer"`
}

// Sample represents a single point in the oscilloscope history.
type Sample struct {
	Gas   float64
	Brake float64
	Trail bool
}

// TraceBuffer stores a fixed-capacity sliding window of pedal samples.
type TraceBuffer struct {
	mu         sync.Mutex
	samples    []Sample
	maxSamples int
	lastPeak   float64
	lastPeakTs time.Time
}

// NewTraceBuffer creates a buffer for the given number of samples.
func NewTraceBuffer(maxSamples int) *TraceBuffer {
	if maxSamples <= 0 {
		maxSamples = 200
	}
	return &TraceBuffer{
		samples:    make([]Sample, 0, maxSamples),
		maxSamples: maxSamples,
	}
}

// Push adds a new sample and computes whether trail braking is currently active.
func (tb *TraceBuffer) Push(gas, brake float64) bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	gas = math.Max(0.0, math.Min(1.0, gas))
	brake = math.Max(0.0, math.Min(1.0, brake))

	now := time.Now()
	if brake > 0.60 {
		tb.lastPeak = brake
		tb.lastPeakTs = now
	}

	// Trail braking detection: gas released, brake released progressively between 5% and 65%
	// following a recent strong braking application.
	trail := false
	if gas < 0.05 && brake >= 0.05 && brake <= 0.65 {
		if now.Sub(tb.lastPeakTs) < 2*time.Second || brake < tb.lastPeak {
			trail = true
		}
	}

	sample := Sample{
		Gas:   gas,
		Brake: brake,
		Trail: trail,
	}

	if len(tb.samples) >= tb.maxSamples {
		copy(tb.samples, tb.samples[1:])
		tb.samples[len(tb.samples)-1] = sample
	} else {
		tb.samples = append(tb.samples, sample)
	}

	return trail
}

// Snapshot returns a copy of current samples for thread-safe rendering.
func (tb *TraceBuffer) Snapshot() []Sample {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	out := make([]Sample, len(tb.samples))
	copy(out, tb.samples)
	return out
}

// SpotterConfig matches data/spotter_config.json.
type SpotterConfig struct {
	Enabled      bool   `json:"enabled"`
	Language     string `json:"language"`
	Volume       int    `json:"volume"`
	ToggleKey    string `json:"toggle_key,omitempty"`
	ToggleVkCode int    `json:"toggle_vk_code,omitempty"`
}

// SpotterManager manages reading and atomically updating the spotter configuration.
type SpotterManager struct {
	mu         sync.Mutex
	filePath   string
	config     SpotterConfig
	lastLoaded time.Time
}

// FindSpotterConfigFile locates spotter_config.json searching standard repo candidates.
func FindSpotterConfigFile(overridePath string) string {
	if overridePath != "" {
		if _, err := os.Stat(overridePath); err == nil {
			return overridePath
		}
	}

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

	for _, cand := range candidates {
		if _, err := os.Stat(cand); err == nil {
			abs, err := filepath.Abs(cand)
			if err == nil {
				return abs
			}
			return cand
		}
	}

	return filepath.Join("data", "spotter_config.json")
}

// NewSpotterManager initializes config from disk or fallback defaults.
func NewSpotterManager(path string) *SpotterManager {
	sm := &SpotterManager{
		filePath: path,
		config: SpotterConfig{
			Enabled:  true,
			Language: "es",
			Volume:   85,
		},
	}
	sm.Load()
	return sm
}

// Load reads config from disk if it exists.
func (sm *SpotterManager) Load() SpotterConfig {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	data, err := os.ReadFile(sm.filePath)
	if err == nil {
		var parsed SpotterConfig
		if json.Unmarshal(data, &parsed) == nil {
			sm.config = parsed
			sm.lastLoaded = time.Now()
		}
	}
	return sm.config
}

// Save writes config to disk atomically.
func (sm *SpotterManager) Save() error {
	data, err := json.MarshalIndent(sm.config, "", "  ")
	if err != nil {
		return err
	}

	dir := filepath.Dir(sm.filePath)
	if dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}

	tmpFile := sm.filePath + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmpFile, sm.filePath)
}

// ToggleMute switches spotter enabled status and persists to disk.
func (sm *SpotterManager) ToggleMute() bool {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sm.config.Enabled = !sm.config.Enabled
	_ = sm.Save()
	return sm.config.Enabled
}

// AdjustVolume increases or decreases volume by delta clamped between 0 and 100.
func (sm *SpotterManager) AdjustVolume(delta int) int {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	sm.config.Volume += delta
	if sm.config.Volume < 0 {
		sm.config.Volume = 0
	} else if sm.config.Volume > 100 {
		sm.config.Volume = 100
	}
	_ = sm.Save()
	return sm.config.Volume
}

// Get returns the current config snapshot.
func (sm *SpotterManager) Get() SpotterConfig {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.config
}

// HUDApp represents the runtime state of the HUD.
type HUDApp struct {
	trace     *TraceBuffer
	spotter   *SpotterManager
	addr      string
	latestPkt TelemetryPacket
	latestMu  sync.RWMutex
	hasData   bool
	isTrail   bool
	quitChan  chan struct{}
}

// NewHUDApp creates a new application instance.
func NewHUDApp(addr, cfgPath string) *HUDApp {
	resolvedCfg := FindSpotterConfigFile(cfgPath)
	return &HUDApp{
		trace:    NewTraceBuffer(200),
		spotter:  NewSpotterManager(resolvedCfg),
		addr:     addr,
		quitChan: make(chan struct{}),
	}
}

// StartUDPListener begins listening on the specified UDP address for telemetry packets.
func (app *HUDApp) StartUDPListener() error {
	uaddr, err := net.ResolveUDPAddr("udp", app.addr)
	if err != nil {
		return fmt.Errorf("resolve udp %s: %w", app.addr, err)
	}

	conn, err := net.ListenUDP("udp", uaddr)
	if err != nil {
		return fmt.Errorf("listen udp %s: %w", app.addr, err)
	}

	go func() {
		defer conn.Close()
		buf := make([]byte, 2048)
		for {
			select {
			case <-app.quitChan:
				return
			default:
			}

			_ = conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
			n, _, err := conn.ReadFromUDP(buf)
			if err != nil {
				continue
			}

			var pkt TelemetryPacket
			if err := json.Unmarshal(buf[:n], &pkt); err == nil {
				trail := app.trace.Push(pkt.Gas, pkt.Brake)
				app.latestMu.Lock()
				app.latestPkt = pkt
				app.hasData = true
				app.isTrail = trail
				app.latestMu.Unlock()
			}
		}
	}()

	return nil
}

// GetLatest returns a snapshot of latest car telemetry.
func (app *HUDApp) GetLatest() (TelemetryPacket, bool, bool) {
	app.latestMu.RLock()
	defer app.latestMu.RUnlock()
	return app.latestPkt, app.hasData, app.isTrail
}

func main() {
	addr := flag.String("addr", "127.0.0.1:10824", "UDP address to listen for telemetry")
	cfgPath := flag.String("config", "", "Path to spotter_config.json")
	width := flag.Int("width", 560, "Overlay window width")
	height := flag.Int("height", 240, "Overlay window height")
	testMode := flag.Bool("test", false, "Test mode without opening a graphical window")
	flag.Parse()

	app := NewHUDApp(*addr, *cfgPath)
	if err := app.StartUDPListener(); err != nil {
		log.Printf("[HUD] Warning: UDP listener on %s: %v", *addr, err)
	} else {
		log.Printf("[HUD] Listening for telemetry on UDP %s", *addr)
	}

	if *testMode {
		log.Printf("[HUD] Test mode enabled, running headless check")
		return
	}

	// Launch native OS graphical window (Linux X11 or Windows GDI)
	if err := runOSWindow(app, *width, *height); err != nil {
		log.Fatalf("[HUD] Window error: %v", err)
	}
}
