package main

import "time"

// SessionMetadata carries identifying information about the current driving session.
type SessionMetadata struct {
	Simulator         string
	SimPrefix         string
	Track             string
	CarModel          string
	TrackSplineLength float32
}

// TelemetrySample is a single normalized physics/graphics frame ready to be recorded into CSV.
type TelemetrySample struct {
	PacketID    int32
	Lap         int32
	LapDistance float32
	SpeedKmh    float32
	Gas         float32
	Brake       float32
	Gear        int32 // -1 = Reverse, 0 = Neutral, 1 = First, etc.
	SteerAngle  float32
	RPM         int32
	LatG        float32
	LongG       float32
	YawRate     float32
	X           float32
	Y           float32
	InPit       int32 // 0 or 1
	LapValid    int32 // 0 or 1
	WheelsPressure [4]float32 // Tyre pressures in PSI (FL, FR, RL, RR)
	LastLapTimeMs  int32      // Last completed lap time in ms
}

// SimAdapter abstracts live telemetry access for any racing simulator.
type SimAdapter interface {
	// Name returns the user-facing name of the simulator (e.g. "Assetto Corsa Competizione").
	Name() string
	// SimPrefix returns the prefix used in recorded CSV filenames (e.g. "acc", "lmu", "ac", "acevo").
	SimPrefix() string
	// Open connects to or maps the simulator's shared memory pages.
	Open() error
	// Close releases any mapped pages or handles.
	Close()
	// Read reads one synchronized telemetry frame.
	Read(now time.Time) (sample TelemetrySample, meta SessionMetadata, live bool, err error)
	// LastPacketID returns the latest packet sequence number to check for pauses.
	LastPacketID() int32
}
