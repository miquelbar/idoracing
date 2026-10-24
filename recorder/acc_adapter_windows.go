//go:build windows

package main

import (
	"encoding/binary"
	"time"
)

// accAdapter is the frozen reference implementation for Assetto Corsa Competizione.
type accAdapter struct {
	physics  *sharedPage
	graphics *sharedPage
	static   *sharedPage
	pbuf     []byte
	gbuf     []byte
	sbuf     []byte
	lastID   int32
	dist     distanceTracker
}

func newACCAdapter() *accAdapter {
	return &accAdapter{}
}

func (a *accAdapter) Name() string        { return "Assetto Corsa Competizione" }
func (a *accAdapter) SimPrefix() string   { return "acc" }
func (a *accAdapter) LastPacketID() int32 { return a.lastID }

func (a *accAdapter) Open() error {
	p, err := openSharedPage(physicsPageName, binary.Size(physicsPage{}))
	if err != nil {
		return err
	}
	g, err := openSharedPage(graphicsPageName, binary.Size(graphicsPage{}))
	if err != nil {
		p.close()
		return err
	}
	s, err := openSharedPage(staticPageName, staticMinimumPageLength)
	if err != nil {
		p.close()
		g.close()
		return err
	}
	a.physics, a.graphics, a.static = p, g, s
	return nil
}

func (a *accAdapter) Close() {
	if a.physics != nil {
		a.physics.close()
		a.physics = nil
	}
	if a.graphics != nil {
		a.graphics.close()
		a.graphics = nil
	}
	if a.static != nil {
		a.static.close()
		a.static = nil
	}
}

func (a *accAdapter) Read(now time.Time) (TelemetrySample, SessionMetadata, bool, error) {
	a.pbuf, a.gbuf = a.physics.snapshot(a.pbuf), a.graphics.snapshot(a.gbuf)
	p, err := decodePhysics(a.pbuf)
	if err != nil {
		return TelemetrySample{}, SessionMetadata{}, false, err
	}
	g, err := decodeGraphics(a.gbuf)
	if err != nil {
		return TelemetrySample{}, SessionMetadata{}, false, err
	}
	a.sbuf = a.static.snapshot(a.sbuf)
	info := decodeStatic(a.sbuf)

	a.lastID = p.PacketID
	x, y, ok := g.playerPosition()
	lapDist := a.dist.step(x, y, ok, p.SpeedKmh, g.NormalizedCarPosition, info.TrackSplineLength, g.CompletedLaps+1, now)
	sample := p.toSample(g, lapDist)
	meta := info.toMetadata(a.Name(), a.SimPrefix())
	return sample, meta, g.Status == statusLive, nil
}
