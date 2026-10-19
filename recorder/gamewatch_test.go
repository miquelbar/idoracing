package main

import (
	"testing"
	"time"
)

func TestGameWatchExitsOnlyAfterTheGameWasSeenAndIsGone(t *testing.T) {
	up := false
	w := &gameWatch{exe: "AC2-Win64-Shipping.exe", running: func(string) (bool, error) { return up, nil }}
	t0 := time.Date(2026, 10, 19, 15, 0, 0, 0, time.UTC)
	w.started = t0

	if w.shouldExit(t0.Add(10 * time.Second)) {
		t.Fatal("exited while waiting for the game to start")
	}
	up = true
	if w.shouldExit(t0.Add(20 * time.Second)) {
		t.Fatal("exited while the game is running")
	}
	up = false
	if w.shouldExit(t0.Add(20*time.Second + 500*time.Millisecond)) {
		t.Fatal("checked more often than once a second")
	}
	if !w.shouldExit(t0.Add(22 * time.Second)) {
		t.Fatal("kept running after the game exited")
	}
}

func TestGameWatchGivesUpIfTheGameNeverStarts(t *testing.T) {
	w := &gameWatch{exe: "AC2-Win64-Shipping.exe", running: func(string) (bool, error) { return false, nil }}
	t0 := time.Date(2026, 10, 19, 15, 0, 0, 0, time.UTC)
	w.started = t0

	if !w.shouldExit(t0.Add(gameStartupTimeout + time.Second)) {
		t.Fatal("waited forever for a game that never started")
	}
}

func TestGameWatchIsOffWithoutAnExecutable(t *testing.T) {
	w := &gameWatch{}
	if w.shouldExit(time.Now()) {
		t.Fatal("exited with no game to watch")
	}
}
