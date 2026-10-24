package main

import (
	"encoding/binary"
	"math"
	"net"
	"time"
)

const (
	dr2PacketSize = 264
	dr2Port       = 20777
)

type dr2Adapter struct {
	conn       *net.UDPConn
	buf        [1024]byte
	packetID   int32
	lastTime   float32
	stageDist  float32
	currentLap int32
}

func newDR2Adapter() SimAdapter {
	return &dr2Adapter{
		currentLap: 1,
	}
}

func (a *dr2Adapter) Name() string {
	return "DiRT Rally 2.0 / EA SPORTS WRC"
}

func (a *dr2Adapter) SimPrefix() string {
	return "dr2"
}

func (a *dr2Adapter) LastPacketID() int32 {
	return a.packetID
}

func (a *dr2Adapter) Open() error {
	addr := &net.UDPAddr{
		IP:   net.ParseIP("127.0.0.1"),
		Port: dr2Port,
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return err
	}
	a.conn = conn
	return nil
}

func (a *dr2Adapter) Read(now time.Time) (TelemetrySample, SessionMetadata, bool, error) {
	if a.conn == nil {
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}

	// Read packet with short deadline so recorder stays responsive
	a.conn.SetReadDeadline(now.Add(40 * time.Millisecond))
	n, _, err := a.conn.ReadFrom(a.buf[:])
	if err != nil {
		// Timeout or temporary read error: game is paused or waiting at menu
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}

	if n < dr2PacketSize {
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}

	b := a.buf[:]

	// Unpack 66 float32 values (little-endian)
	lapTime := math.Float32frombits(binary.LittleEndian.Uint32(b[4:8]))
	distance := math.Float32frombits(binary.LittleEndian.Uint32(b[8:12]))
	progress := math.Float32frombits(binary.LittleEndian.Uint32(b[12:16]))
	posX := math.Float32frombits(binary.LittleEndian.Uint32(b[16:20]))
	posZ := math.Float32frombits(binary.LittleEndian.Uint32(b[24:28]))
	speedMs := math.Float32frombits(binary.LittleEndian.Uint32(b[28:32]))
	throttle := math.Float32frombits(binary.LittleEndian.Uint32(b[116:120]))
	steer := math.Float32frombits(binary.LittleEndian.Uint32(b[120:124]))
	brake := math.Float32frombits(binary.LittleEndian.Uint32(b[124:128]))
	gearRaw := int32(math.Float32frombits(binary.LittleEndian.Uint32(b[132:136])))
	latG := math.Float32frombits(binary.LittleEndian.Uint32(b[136:140]))
	longG := math.Float32frombits(binary.LittleEndian.Uint32(b[140:144]))
	lapCount := int32(math.Float32frombits(binary.LittleEndian.Uint32(b[144:148])))
	rpmRaw := math.Float32frombits(binary.LittleEndian.Uint32(b[148:152]))

	gear := gearRaw
	if gearRaw == 10 {
		gear = -1 // Reverse in DR2 is 10
	}

	speedKmh := speedMs * 3.6
	rpm := int32(rpmRaw * 10)

	// In rally, a stage run is considered a lap. If stage restarted, increment lap or track progress.
	lap := lapCount + 1
	if lap <= 0 {
		lap = 1
	}

	a.packetID++
	if distance > a.stageDist {
		a.stageDist = distance
	}

	// Live driving state: moving or throttle applied
	live := (speedMs > 0.5 || throttle > 0.05 || brake > 0.05) && (lapTime > 0.0 || progress > 0.0)

	sample := TelemetrySample{
		PacketID:    a.packetID,
		Lap:         lap,
		LapDistance: distance,
		SpeedKmh:    speedKmh,
		Gas:         throttle,
		Brake:       brake,
		Gear:        gear,
		SteerAngle:  steer,
		RPM:         rpm,
		LatG:        latG,
		LongG:       longG,
		YawRate:     0.0,
		X:           posX,
		Y:           posZ,
		InPit:       0,
		LapValid:    1,
	}

	meta := SessionMetadata{
		Simulator:         "DiRT Rally 2.0",
		Track:             "Rally Stage",
		CarModel:          "Rally Car",
		TrackSplineLength: a.stageDist,
		SimPrefix:         "dr2",
	}

	return sample, meta, live, nil
}

func (a *dr2Adapter) Close() {
	if a.conn != nil {
		a.conn.Close()
		a.conn = nil
	}
}
