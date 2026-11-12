package main

import (
	"encoding/json"
	"net"
	"time"
)

// TelemetryPacket is the lightweight JSON frame broadcast over UDP
// for consumption by local hardware bridges (e.g. Moza RPM shift lights).
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
	addr     *net.UDPAddr
	lastSent time.Time
	throttle time.Duration
}

// NewBroadcaster creates a UDP broadcaster for live telemetry.
// If addrStr is empty, it defaults to "127.0.0.1:10823".
// If addrStr is "off" or "none", broadcasting is disabled.
func NewBroadcaster(addrStr string) *Broadcaster {
	if addrStr == "off" || addrStr == "none" {
		return nil
	}
	if addrStr == "" {
		addrStr = "127.0.0.1:10823"
	}
	raddr, err := net.ResolveUDPAddr("udp", addrStr)
	if err != nil {
		return nil
	}
	conn, err := net.DialUDP("udp", nil, raddr)
	if err != nil {
		return nil
	}
	return &Broadcaster{
		conn:     conn,
		addr:     raddr,
		throttle: 20 * time.Millisecond, // ~50Hz max rate
	}
}

// Send broadcasts a telemetry snapshot. It throttles transmission to ~50Hz.
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
		_, _ = b.conn.Write(data)
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
