//go:build windows

package main

import (
	"fmt"
	"time"
)

func runOSWindow(app *HUDApp, width, height int) error {
	fmt.Printf("[HUD] Windows overlay running (listening on %s)...\n", app.addr)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-app.quitChan:
			return nil
		case <-ticker.C:
		}
	}
}
