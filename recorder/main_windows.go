//go:build windows

package main

import (
	"encoding/binary"
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"time"
)

const (
	idlePoll      = time.Second
	reconnectWait = 2 * time.Second
)

func main() {
	out := flag.String("out", defaultOutDir(), "folder where session CSV files are written")
	hz := flag.Int("hz", 30, "samples per second while driving")
	exitWith := flag.String("exit-with", "", "exit once this game executable has stopped (e.g. AC2-Win64-Shipping.exe)")
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
	log.Printf("idoracing-recorder %s: writing to %s at %d Hz; waiting for ACC", version, *out, *hz)

	rec := &recorder{outDir: *out}
	watch := &gameWatch{exe: *exitWith, running: processRunning, started: time.Now()}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	go func() {
		<-stop
		finish(rec, "interrupted")
	}()

	for {
		if err := record(rec, watch, time.Second/time.Duration(*hz)); err != nil {
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

// record reads ACC's shared memory until the pages can no longer be opened.
func record(rec *recorder, watch *gameWatch, livePoll time.Duration) error {
	physics, err := openSharedPage(physicsPageName, binary.Size(physicsPage{}))
	if err != nil {
		return nil // ACC not running yet
	}
	defer physics.close()
	graphics, err := openSharedPage(graphicsPageName, binary.Size(graphicsPage{}))
	if err != nil {
		return err
	}
	defer graphics.close()
	static, err := openSharedPage(staticPageName, staticMinimumPageLength)
	if err != nil {
		return err
	}
	defer static.close()

	var pbuf, gbuf, sbuf []byte
	for {
		pbuf, gbuf = physics.snapshot(pbuf), graphics.snapshot(gbuf)
		p, err := decodePhysics(pbuf)
		if err != nil {
			return err
		}
		g, err := decodeGraphics(gbuf)
		if err != nil {
			return err
		}
		sbuf = static.snapshot(sbuf)
		now := time.Now()
		live, err := rec.step(p, g, decodeStatic(sbuf), now)
		if err != nil {
			return err
		}
		watch.notePacket(p.PacketID, now)
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
