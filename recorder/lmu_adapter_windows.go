//go:build windows

package main

import (
	"log"
	"time"
)

const (
	lmuTelemetryPageName = `$rFactor2SMMP_Telemetry$`
	lmuScoringPageName   = `$rFactor2SMMP_Scoring$`

	lmuTelemetryMapSize = 0
	lmuScoringMapSize   = 0
)

type lmuAdapter struct {
	telemetry *sharedPage
	scoring   *sharedPage
	tbuf      []byte
	sbuf      []byte
	lastID    int32
	lastLog   time.Time
	lockedID  int32
	lockedCar string
}

func newLMUAdapter() *lmuAdapter {
	return &lmuAdapter{
		lockedID: -1,
	}
}

func (a *lmuAdapter) Name() string        { return "Le Mans Ultimate" }
func (a *lmuAdapter) SimPrefix() string   { return "lmu" }
func (a *lmuAdapter) LastPacketID() int32 { return a.lastID }

func (a *lmuAdapter) Open() error {
	tPage, err := openSharedPage(lmuTelemetryPageName, lmuTelemetryMapSize)
	if err != nil {
		return err
	}
	sPage, _ := openSharedPage(lmuScoringPageName, lmuScoringMapSize)
	a.telemetry, a.scoring = tPage, sPage
	a.lockedID = -1
	a.lockedCar = ""
	log.Printf("lmu: attached to rFactor 2 shared memory plugin (%s)", lmuTelemetryPageName)
	return nil
}

func (a *lmuAdapter) Close() {
	if a.telemetry != nil {
		a.telemetry.close()
		a.telemetry = nil
	}
	if a.scoring != nil {
		a.scoring.close()
		a.scoring = nil
	}
	a.lockedID = -1
	a.lockedCar = ""
}

func (a *lmuAdapter) Read(now time.Time) (TelemetrySample, SessionMetadata, bool, error) {
	if a.telemetry == nil {
		return TelemetrySample{}, SessionMetadata{}, false, nil
	}

	// If scoring was not available during Open(), retry attaching periodically
	if a.scoring == nil {
		if sPage, err := openSharedPage(lmuScoringPageName, lmuScoringMapSize); err == nil {
			a.scoring = sPage
			log.Printf("lmu: attached to rFactor 2 shared memory plugin (%s)", lmuScoringPageName)
		}
	}

	a.tbuf = a.telemetry.snapshot(a.tbuf)
	if a.scoring != nil {
		a.sbuf = a.scoring.snapshot(a.sbuf)
	} else {
		a.sbuf = nil
	}

	sample, meta, live, resolvedID, err := decodeLMULocked(a.tbuf, a.sbuf, a.lockedID, a.lockedCar)
	if err != nil {
		return sample, meta, false, err
	}
	if a.lockedID == -1 && resolvedID != -1 && meta.CarModel != "" {
		a.lockedID = resolvedID
		a.lockedCar = meta.CarModel
		log.Printf("lmu: locked to player vehicle ID=%d car=%q", a.lockedID, a.lockedCar)
	}
	if now.Sub(a.lastLog) >= 5*time.Second {
		a.lastLog = now
		log.Printf("lmu debug: live=%v rpm=%d speed=%.1f car=%q track=%q packet=%d (lockedID=%d)",
			live, sample.RPM, sample.SpeedKmh, meta.CarModel, meta.Track, sample.PacketID, a.lockedID)
	}
	a.lastID = sample.PacketID
	return sample, meta, live, nil
}
