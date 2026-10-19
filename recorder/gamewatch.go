package main

import "time"

const (
	gameCheckEvery = time.Second
	// How long to wait for the game to appear before giving up, when started alongside it.
	gameStartupTimeout = 5 * time.Minute
)

// gameWatch tells the recorder to stop once the game it was launched with has exited, so a recorder
// started from Steam's launch options does not keep the Proton prefix (and the game's session) alive.
type gameWatch struct {
	exe       string
	running   func(exe string) (bool, error)
	started   time.Time
	seen      bool
	lastCheck time.Time
}

func (w *gameWatch) shouldExit(now time.Time) bool {
	if w.exe == "" || now.Sub(w.lastCheck) < gameCheckEvery {
		return false
	}
	w.lastCheck = now
	up, err := w.running(w.exe)
	if err != nil {
		return false
	}
	if up {
		w.seen = true
		return false
	}
	return w.seen || now.Sub(w.started) > gameStartupTimeout
}
