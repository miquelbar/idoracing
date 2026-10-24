//go:build windows

package main

import (
	"encoding/binary"
	"time"
)

// kunosAdapter reads telemetry from Kunos shared memory pages (used by AC1 and AC EVO).
type kunosAdapter struct {
	simName    string
	simPrefix  string
	physNames  []string
	gfxNames   []string
	statNames  []string

	physics  *sharedPage
	graphics *sharedPage
	static   *sharedPage
	pbuf     []byte
	gbuf     []byte
	sbuf     []byte
	lastID   int32
	dist     distanceTracker
}

func newACAdapter() *kunosAdapter {
	return &kunosAdapter{
		simName:   "Assetto Corsa",
		simPrefix: "ac",
		physNames: []string{`Local\acpmf_physics`},
		gfxNames:  []string{`Local\acpmf_graphics`},
		statNames: []string{`Local\acpmf_static`},
	}
}

func newACEVOAdapter() *kunosAdapter {
	return &kunosAdapter{
		simName:   "Assetto Corsa EVO",
		simPrefix: "acevo",
		physNames: []string{`Local\acevo_pmf_physics`, `Local\acpmf_physics`},
		gfxNames:  []string{`Local\acevo_pmf_graphics`, `Local\acpmf_graphics`},
		statNames: []string{`Local\acevo_pmf_static`, `Local\acpmf_static`},
	}
}

func (a *kunosAdapter) Name() string        { return a.simName }
func (a *kunosAdapter) SimPrefix() string   { return a.simPrefix }
func (a *kunosAdapter) LastPacketID() int32 { return a.lastID }

func (a *kunosAdapter) Open() error {
	var p *sharedPage
	var err error
	for _, name := range a.physNames {
		p, err = openSharedPage(name, binary.Size(physicsPage{}))
		if err == nil {
			break
		}
	}
	if err != nil {
		return err
	}

	var g *sharedPage
	for _, name := range a.gfxNames {
		g, err = openSharedPage(name, binary.Size(graphicsPage{}))
		if err == nil {
			break
		}
	}
	if err != nil {
		p.close()
		return err
	}

	var s *sharedPage
	for _, name := range a.statNames {
		s, err = openSharedPage(name, staticMinimumPageLength)
		if err == nil {
			break
		}
	}
	if err != nil {
		p.close()
		g.close()
		return err
	}

	a.physics, a.graphics, a.static = p, g, s
	return nil
}

func (a *kunosAdapter) Close() {
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

func (a *kunosAdapter) Read(now time.Time) (TelemetrySample, SessionMetadata, bool, error) {
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
