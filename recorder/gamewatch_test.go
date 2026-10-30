package main

import (
	"errors"
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 19, 15, 0, 0, 0, time.UTC)

func TestGameWatchExitsOnlyAfterTheGameWasSeenAndIsGone(t *testing.T) {
	up := false
	w := &gameWatch{exe: "AC2-Win64-Shipping.exe", running: func(string) (bool, error) { return up, nil }, started: t0}

	if exit, _ := w.shouldExit(t0.Add(10 * time.Second)); exit {
		t.Fatal("exited while waiting for the game to start")
	}
	up = true
	if exit, _ := w.shouldExit(t0.Add(20 * time.Second)); exit {
		t.Fatal("exited while the game is running")
	}
	up = false
	if exit, _ := w.shouldExit(t0.Add(20*time.Second + 500*time.Millisecond)); exit {
		t.Fatal("checked more often than once a second")
	}
	exit, reason := w.shouldExit(t0.Add(22 * time.Second))
	if !exit || reason != "AC2-Win64-Shipping.exe exited" {
		t.Fatalf("exit=%v reason=%q after the game closed", exit, reason)
	}
}

func TestGameWatchGivesUpIfTheGameNeverStarts(t *testing.T) {
	w := &gameWatch{exe: "AC2-Win64-Shipping.exe", running: func(string) (bool, error) { return false, nil }, started: t0}

	exit, reason := w.shouldExit(t0.Add(gameStartupTimeout + time.Second))
	if !exit || reason != "AC2-Win64-Shipping.exe did not start within 5m0s" {
		t.Fatalf("exit=%v reason=%q for a game that never started", exit, reason)
	}
}

func TestGameWatchFallsBackToFrozenDataWhenProcessesCannotBeListed(t *testing.T) {
	listErr := error(nil)
	w := &gameWatch{exe: "AC2-Win64-Shipping.exe", running: func(string) (bool, error) { return true, listErr }, started: t0}
	w.notePacket(100, t0)
	w.shouldExit(t0.Add(time.Second)) // game seen

	listErr = errors.New("snapshot failed")
	w.notePacket(100, t0.Add(30*time.Second))
	if exit, _ := w.shouldExit(t0.Add(time.Minute)); exit {
		t.Fatal("exited before the data had been frozen for long")
	}
	exit, reason := w.shouldExit(t0.Add(frozenPagesTimeout + 2*time.Second))
	if !exit || reason != "game data stopped and the process list cannot be read" {
		t.Fatalf("exit=%v reason=%q with frozen data and no process list", exit, reason)
	}
}

func TestGameWatchIsOffWithoutAnExecutable(t *testing.T) {
	w := &gameWatch{}
	if exit, _ := w.shouldExit(time.Now()); exit {
		t.Fatal("exited with no game to watch")
	}
}

func TestGameWatchStaysAliveWhilePhysicsPacketsMoveEvenIfProcessNotFound(t *testing.T) {
	// Even if processRunning returns false (e.g. process name mismatch in Wine), live physics packets
	// prove the simulator is running and must NEVER cause a 5-minute timeout.
	w := &gameWatch{exe: "acr.exe", running: func(string) (bool, error) { return false, nil }, started: t0}

	w.notePacket(1, t0.Add(4*time.Minute))
	if exit, _ := w.shouldExit(t0.Add(4*time.Minute + 5*time.Second)); exit {
		t.Fatal("exited while physics packets are actively moving")
	}

	w.notePacket(2, t0.Add(5*time.Minute + 5*time.Second))
	if exit, reason := w.shouldExit(t0.Add(5*time.Minute + 6*time.Second)); exit {
		t.Fatalf("exited with reason %q while car is actively driving past 5 minutes", reason)
	}
}
