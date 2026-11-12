//go:build (!linux && !windows) || (linux && !cgo)

package main

import (
	"fmt"
	"time"
)

func runOSWindow(app *HUDApp, width, height int) error {
	fmt.Printf("[HUD] Graphical window is not supported on this OS, running headless monitor\n")
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-app.quitChan:
			return nil
		case <-ticker.C:
			pkt, has, trail := app.GetLatest()
			if has {
				fmt.Printf("[HUD] Gas: %.2f | Brake: %.2f | Trail: %v | Speed: %.1f\n", pkt.Gas, pkt.Brake, trail, pkt.SpeedKmh)
			}
		}
	}
}
