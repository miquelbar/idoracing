//go:build windows

package main

import (
	"time"
)

const (
	lmuTelemetryPageName = `$rFactor2SMMP_Telemetry$`
	lmuScoringPageName   = `$rFactor2SMMP_Scoring$`

	lmuTelemetryMapSize = 16 * 1024
	lmuScoringMapSize   = 16 * 1024
)

type lmuAdapter struct {
	telemetry *sharedPage
	scoring   *sharedPage
	tbuf      []byte
	sbuf      []byte
	lastID    int32
}

func newLMUAdapter() *lmuAdapter {
	return &lmuAdapter{}
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
}

func (a *lmuAdapter) Read(now time.Time) (TelemetrySample, SessionMetadata, bool, error) {
	a.tbuf = a.telemetry.snapshot(a.tbuf)
	if a.scoring != nil {
		a.sbuf = a.scoring.snapshot(a.sbuf)
	} else {
		a.sbuf = nil
	}

	sample, meta, live, err := decodeLMU(a.tbuf, a.sbuf)
	if err != nil {
		return sample, meta, false, err
	}
	a.lastID = sample.PacketID
	return sample, meta, live, nil
}
