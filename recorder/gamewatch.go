package main

import "time"

const (
	gameCheckEvery = time.Second
	// How long to wait for the game to appear before giving up, when started alongside it.
	gameStartupTimeout = 5 * time.Minute
	// Fallback when the process list cannot be read: the pages stay mapped after the game exits, frozen.
	frozenPagesTimeout = 2 * time.Minute
)

// gameWatch tells the recorder to stop once the game it was launched with has exited, so a recorder
// started from Steam's launch options does not keep the Proton prefix (and the game's session) alive.
type gameWatch struct {
	exe     string
	running func(exe string) (bool, error)
	started time.Time

	seen        bool
	lastCheck   time.Time
	lastPacket  int32
	packetMoved time.Time
}

// notePacket records the physics packet id, which only advances while the game is running.
func (w *gameWatch) notePacket(packet int32, now time.Time) {
	if packet != w.lastPacket || w.packetMoved.IsZero() {
		w.lastPacket, w.packetMoved = packet, now
		if packet > 0 {
			w.seen = true
		}
	}
}

// shouldExit reports whether to stop, and why.
func (w *gameWatch) shouldExit(now time.Time) (bool, string) {
	if w.exe == "" || now.Sub(w.lastCheck) < gameCheckEvery {
		return false, ""
	}
	w.lastCheck = now

	// If physics packets are streaming, the game is definitely alive.
	// Never exit or lag out while live physics packets are actively moving!
	if !w.packetMoved.IsZero() && now.Sub(w.packetMoved) < 10*time.Second {
		w.seen = true
		return false, ""
	}

	up, err := w.running(w.exe)
	switch {
	case err != nil:
		if w.seen && !w.packetMoved.IsZero() && now.Sub(w.packetMoved) >= frozenPagesTimeout {
			return true, "game data stopped and the process list cannot be read"
		}
		return false, ""
	case up:
		w.seen = true
		return false, ""
	case w.seen:
		if !w.packetMoved.IsZero() && now.Sub(w.packetMoved) >= 5*time.Second {
			return true, w.exe + " exited"
		} else if w.packetMoved.IsZero() {
			return true, w.exe + " exited"
		}
		return false, ""
	case now.Sub(w.started) > gameStartupTimeout:
		return true, w.exe + " did not start within " + gameStartupTimeout.String()
	}
	return false, ""
}
