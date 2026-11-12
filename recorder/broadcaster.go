package main

import (
	"encoding/json"
	"net"
	"strings"
	"time"
)

// TelemetryPacket is the lightweight JSON frame broadcast over UDP
// for consumption by local hardware bridges (e.g. Moza RPM shift lights)
// and live telemetry overlays (e.g. Trail Braking & Throttle HUD).
type TelemetryPacket struct {
	RPM      int32   `json:"rpm"`
	MaxRPM   int32   `json:"max_rpm"`
	Gear     int32   `json:"gear"`
	SpeedKmh float32 `json:"speed_kmh"`
	Gas      float32 `json:"gas"`
	Brake    float32 `json:"brake"`
	TC       float32 `json:"tc"`
	ABS      float32 `json:"abs"`
	InPit    int32   `json:"in_pit"`
}

// Broadcaster sends live telemetry frames over UDP.
type Broadcaster struct {
	conn     *net.UDPConn
	addrs    []*net.UDPAddr
	lastSent time.Time
	throttle time.Duration
}

// NewBroadcaster creates a UDP broadcaster for live telemetry.
// addrStr can be a comma-separated list of UDP addresses.
// If addrStr is empty, it defaults to:
//   - 127.0.0.1:10823 (Moza RPM shift lights bridge)
//   - 127.0.0.1:10824 (Native Linux Pedal HUD overlay)
//   - 127.0.0.1:10825 (FastAPI backend live WebSocket stream)
// If addrStr is "off" or "none", broadcasting is disabled.
func NewBroadcaster(addrStr string) *Broadcaster {
	if addrStr == "off" || addrStr == "none" {
		return nil
	}
	if addrStr == "" {
		addrStr = "127.0.0.1:10823,127.0.0.1:10824,127.0.0.1:10825"
	}

	var resolved []*net.UDPAddr
	for _, raw := range strings.Split(addrStr, ",") {
		target := strings.TrimSpace(raw)
		if target == "" {
			continue
		}
		if raddr, err := net.ResolveUDPAddr("udp", target); err == nil {
			resolved = append(resolved, raddr)
		}
	}
	if len(resolved) == 0 {
		return nil
	}

	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		return nil
	}
	return &Broadcaster{
		conn:     conn,
		addrs:    resolved,
		throttle: 20 * time.Millisecond, // ~50Hz max rate
	}
}

// Send broadcasts a telemetry snapshot to all configured targets.
func (b *Broadcaster) Send(sample TelemetrySample, meta SessionMetadata, now time.Time) {
	if b == nil || b.conn == nil {
		return
	}
	if !b.lastSent.IsZero() && now.Sub(b.lastSent) < b.throttle {
		return
	}
	b.lastSent = now

	maxRpm := meta.MaxRPM
	if maxRpm <= 0 {
		maxRpm = 8500
	}

	pkt := TelemetryPacket{
		RPM:      sample.RPM,
		MaxRPM:   maxRpm,
		Gear:     sample.Gear,
		SpeedKmh: sample.SpeedKmh,
		Gas:      sample.Gas,
		Brake:    sample.Brake,
		TC:       sample.TC,
		ABS:      sample.ABS,
		InPit:    sample.InPit,
	}

	data, err := json.Marshal(pkt)
	if err == nil {
		for _, addr := range b.addrs {
			_, _ = b.conn.WriteToUDP(data, addr)
		}
	}
}

// Close closes the UDP socket.
func (b *Broadcaster) Close() error {
	if b == nil || b.conn == nil {
		return nil
	}
	err := b.conn.Close()
	b.conn = nil
	return err
}
