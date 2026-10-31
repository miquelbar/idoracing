//go:build windows

package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	idlePoll      = time.Second
	reconnectWait = 2 * time.Second
)

func main() {
	out := flag.String("out", defaultOutDir(), "folder where session CSV files are written")
	hz := flag.Int("hz", 30, "samples per second while driving")
	sim := flag.String("sim", "auto", "simulator: auto, acc, lmu, ac, acevo")
	exitWith := flag.String("exit-with", "", "exit once this game executable has stopped (e.g. AC2-Win64-Shipping.exe, Le Mans Ultimate.exe, acs.exe, AssettoCorsaEVO.exe)")
	logPath := flag.String("log", "", "file to append log messages to")
	flag.Parse()

	if *logPath != "" {
		if err := os.MkdirAll(filepath.Dir(*logPath), 0755); err == nil {
			if f, err := os.OpenFile(*logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644); err == nil {
				defer f.Close()
				log.SetOutput(f)
			}
		}
	}

	runtime.GOMAXPROCS(1)
	lowerPriority()

	adapter := selectAdapter(*sim, *exitWith)
	log.Printf("idoracing-recorder %s: writing to %s at %d Hz; waiting for %s", version, *out, *hz, adapter.Name())

	rec := &recorder{outDir: *out}
	watch := &gameWatch{exe: *exitWith, running: processRunning, started: time.Now()}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	go func() {
		<-stop
		finish(rec, "interrupted")
	}()

	for {
		if *sim == "auto" && *exitWith == "" {
			adapter = selectAdapter(*sim, *exitWith)
		}
		if err := record(rec, adapter, watch, time.Second/time.Duration(*hz)); err != nil {
			log.Print(err)
		}
		if exit, reason := watch.shouldExit(time.Now()); exit {
			finish(rec, reason)
		}
		time.Sleep(reconnectWait)
	}
}

func finish(rec *recorder, reason string) {
	if err := rec.close(); err != nil {
		log.Print(err)
	}
	log.Printf("recorder stopping: %s", reason)
	os.Exit(0)
}

// selectAdapter chooses the right simulator reader based on -sim, -exit-with, running processes or active shared memory maps.
func selectAdapter(sim string, exitWith string) SimAdapter {
	switch strings.ToLower(strings.TrimSpace(sim)) {
	case "acc":
		return newACCAdapter()
	case "lmu":
		return newLMUAdapter()
	case "ac", "assetto":
		return newACAdapter()
	case "acrally", "rally":
		return newACRallyAdapter()
	case "acevo":
		return newACEVOAdapter()
	case "dr2", "dirt", "dirtrally", "dirtrally2", "wrc":
		return newDR2Adapter()
	}

	lowerExe := strings.ToLower(exitWith)
	if strings.Contains(lowerExe, "ac2-win64-shipping.exe") || strings.Contains(lowerExe, "acc.exe") {
		return newACCAdapter()
	} else if strings.Contains(lowerExe, "le mans ultimate") || strings.Contains(lowerExe, "start_protected_game") {
		return newLMUAdapter()
	} else if strings.Contains(lowerExe, "assettocorsaevo") {
		return newACEVOAdapter()
	} else if strings.Contains(lowerExe, "acr.exe") || strings.Contains(lowerExe, "assettocorsarally") || strings.Contains(lowerExe, "acrally") {
		return newACRallyAdapter()
	} else if strings.Contains(lowerExe, "acs.exe") || strings.Contains(lowerExe, "assettocorsa.exe") {
		return newACAdapter()
	} else if strings.Contains(lowerExe, "dirtrally2.exe") || strings.Contains(lowerExe, "wrc.exe") {
		return newDR2Adapter()
	}

	// Probe running processes
	if running, _ := processRunning("dirtrally2.exe,wrc.exe"); running {
		return newDR2Adapter()
	}
	if running, _ := processRunning("Le Mans Ultimate.exe,start_protected_game.exe"); running {
		return newLMUAdapter()
	}
	if running, _ := processRunning("AssettoCorsaEVO.exe"); running {
		return newACEVOAdapter()
	}
	if running, _ := processRunning("acr.exe,AssettoCorsaRally.exe,ACR-Win64-Shipping.exe,AssettoCorsaRally-Win64-Shipping.exe,acrally.exe"); running {
		return newACRallyAdapter()
	}
	if running, _ := processRunning("acs.exe,AssettoCorsa.exe"); running {
		return newACAdapter()
	}
	if running, _ := processRunning("AC2-Win64-Shipping.exe,acc.exe"); running {
		return newACCAdapter()
	}

	// Probe active shared memory files
	if probeSharedPage(lmuTelemetryPageName) {
		return newLMUAdapter()
	}
	if probeSharedPage(`Local\acevo_pmf_physics`) {
		return newACEVOAdapter()
	}

	// Default to ACC (covers ACC and fakeacc.exe)
	return newACCAdapter()
}

// record reads simulator shared memory through the selected adapter until it closes or fails.
func record(rec *recorder, adapter SimAdapter, watch *gameWatch, livePoll time.Duration) error {
	if err := adapter.Open(); err != nil {
		return nil // Simulator not running or shared memory pages not ready yet
	}
	defer adapter.Close()

	spot := NewSpotter()

	for {
		now := time.Now()
		sample, meta, live, err := adapter.Read(now)
		if err != nil {
			spot.Alert("rec_no_sim_data", now)
			return err
		}
		spot.Step(sample, meta, live, now)
		live, err = rec.stepSample(sample, meta, live, now)
		if err != nil {
			spot.Alert("rec_write_failed", now)
			return err
		}
		watch.notePacket(sample.PacketID, now)
		if exit, reason := watch.shouldExit(now); exit {
			finish(rec, reason)
		}
		if live {
			time.Sleep(livePoll)
		} else {
			time.Sleep(idlePoll)
		}
	}
}

func defaultOutDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "recordings"
	}
	return filepath.Join(home, "Documents", "IdoRacing", "recordings")
}
