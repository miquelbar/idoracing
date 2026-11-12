//go:build linux

package main

/*
#cgo LDFLAGS: -lX11
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/Xatom.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

struct MWMHints {
    unsigned long flags;
    unsigned long functions;
    unsigned long decorations;
    long inputMode;
    unsigned long status;
};

static void set_mwm_borderless(Display *dpy, Window win) {
    Atom mwmHintsAtom = XInternAtom(dpy, "_MOTIF_WM_HINTS", False);
    struct MWMHints hints;
    memset(&hints, 0, sizeof(hints));
    hints.flags = 2; // MWM_HINTS_DECORATIONS
    hints.decorations = 0; // 0 = borderless
    XChangeProperty(dpy, win, mwmHintsAtom, mwmHintsAtom, 32, PropModeReplace, (unsigned char *)&hints, 5);
}

static void set_always_on_top(Display *dpy, Window win) {
    Atom wmNetWmState = XInternAtom(dpy, "_NET_WM_STATE", False);
    Atom wmStateAbove = XInternAtom(dpy, "_NET_WM_STATE_ABOVE", False);
    XChangeProperty(dpy, win, wmNetWmState, XA_ATOM, 32, PropModeReplace, (unsigned char *)&wmStateAbove, 1);
}

static unsigned long alloc_color(Display *dpy, int screen, unsigned short r, unsigned short g, unsigned short b) {
    Colormap cmap = DefaultColormap(dpy, screen);
    XColor col;
    col.red = r;
    col.green = g;
    col.blue = b;
    col.flags = DoRed | DoGreen | DoBlue;
    if (XAllocColor(dpy, cmap, &col)) {
        return col.pixel;
    }
    return BlackPixel(dpy, screen);
}

static int get_event_type(XEvent *ev) { return ev->type; }
static KeySym lookup_key(XEvent *ev) { return XLookupKeysym(&ev->xkey, 0); }
static int get_btn_button(XEvent *ev) { return ev->xbutton.button; }
static int get_btn_x(XEvent *ev) { return ev->xbutton.x; }
static int get_btn_y(XEvent *ev) { return ev->xbutton.y; }
static int get_btn_root_x(XEvent *ev) { return ev->xbutton.x_root; }
static int get_btn_root_y(XEvent *ev) { return ev->xbutton.y_root; }
static int get_motion_root_x(XEvent *ev) { return ev->xmotion.x_root; }
static int get_motion_root_y(XEvent *ev) { return ev->xmotion.y_root; }
*/
import "C"

import (
	"fmt"
	"time"
	"unsafe"
)

func runOSWindow(app *HUDApp, width, height int) error {
	dpy := C.XOpenDisplay(nil)
	if dpy == nil {
		return fmt.Errorf("cannot open X11 display (ensure DISPLAY is set)")
	}
	defer C.XCloseDisplay(dpy)

	screen := C.XDefaultScreen(dpy)
	root := C.XRootWindow(dpy, screen)

	win := C.XCreateSimpleWindow(
		dpy, root,
		C.int(40), C.int(40),
		C.uint(width), C.uint(height),
		0,
		C.alloc_color(dpy, screen, 0x1100, 0x1400, 0x1d00),
		C.alloc_color(dpy, screen, 0x0e00, 0x1100, 0x1700),
	)

	// Set window properties
	title := C.CString("IdoRacing Pedal & Trail HUD")
	defer C.free(unsafe.Pointer(title))
	C.XStoreName(dpy, win, title)
	C.set_mwm_borderless(dpy, win)
	C.set_always_on_top(dpy, win)

	C.XSelectInput(dpy, win, C.ExposureMask|C.KeyPressMask|C.ButtonPressMask|C.ButtonReleaseMask|C.PointerMotionMask)
	C.XMapWindow(dpy, win)

	// Double buffering pixmap
	depth := C.XDefaultDepth(dpy, screen)
	backbuffer := C.XCreatePixmap(dpy, C.Drawable(win), C.uint(width), C.uint(height), C.uint(depth))
	defer C.XFreePixmap(dpy, backbuffer)

	// Allocate colors
	colBg := C.alloc_color(dpy, screen, 0x0e00, 0x1100, 0x1700)
	colBox := C.alloc_color(dpy, screen, 0x1600, 0x1c00, 0x2800)
	colBorder := C.alloc_color(dpy, screen, 0x2a00, 0x3400, 0x4a00)
	colGrid := C.alloc_color(dpy, screen, 0x1e00, 0x2600, 0x3800)
	colGas := C.alloc_color(dpy, screen, 0x0000, 0xff00, 0x6600)   // Neon Green
	colBrake := C.alloc_color(dpy, screen, 0xff00, 0x2a00, 0x4b00) // Racing Red
	colTrail := C.alloc_color(dpy, screen, 0xff00, 0xb300, 0x0000) // Amber Yellow
	colWhite := C.alloc_color(dpy, screen, 0xf000, 0xf400, 0xf800)
	colMuted := C.alloc_color(dpy, screen, 0x8b00, 0x9b00, 0xb400)
	colClose := C.alloc_color(dpy, screen, 0xff00, 0x4400, 0x4400)

	// Graphic Contexts
	gc := C.XCreateGC(dpy, C.Drawable(win), 0, nil)
	defer C.XFreeGC(dpy, gc)

	gcGas := C.XCreateGC(dpy, C.Drawable(win), 0, nil)
	defer C.XFreeGC(dpy, gcGas)
	C.XSetForeground(dpy, gcGas, colGas)
	C.XSetLineAttributes(dpy, gcGas, 3, C.LineSolid, C.CapRound, C.JoinRound)

	gcBrake := C.XCreateGC(dpy, C.Drawable(win), 0, nil)
	defer C.XFreeGC(dpy, gcBrake)
	C.XSetForeground(dpy, gcBrake, colBrake)
	C.XSetLineAttributes(dpy, gcBrake, 3, C.LineSolid, C.CapRound, C.JoinRound)

	// Dragging state
	isDragging := false
	dragStartX, dragStartY := 0, 0
	winStartX, winStartY := 40, 40

	ticker := time.NewTicker(16 * time.Millisecond) // ~60 FPS
	defer ticker.Stop()

	// Points arrays for XDrawLines
	maxPts := 200
	gasPts := make([]C.XPoint, maxPts)
	brakePts := make([]C.XPoint, maxPts)

	var ev C.XEvent

	for {
		// Process pending X11 events
		for C.XPending(dpy) > 0 {
			C.XNextEvent(dpy, &ev)
			evType := C.get_event_type(&ev)
			switch evType {
			case C.KeyPress:
				keysym := C.lookup_key(&ev)
				// Esc (0xff1b) or 'q' (0x71) or 'Q' (0x51)
				if keysym == 0xff1b || keysym == 0x71 || keysym == 0x51 {
					return nil
				}

			case C.ButtonPress:
				btn := C.get_btn_button(&ev)
				if btn == C.Button1 {
					bx := int(C.get_btn_x(&ev))
					by := int(C.get_btn_y(&ev))

					// Close button [X] at top-right (x: width-35..width-8, y: 6..32)
					if bx >= width-35 && bx <= width-8 && by >= 6 && by <= 32 {
						return nil
					}

					// Pep Radio Toggle (x: 8..135, y: 6..32)
					if bx >= 8 && bx <= 135 && by >= 6 && by <= 32 {
						app.spotter.ToggleMute()
						continue
					}

					// Volume Down [-] (x: 140..166, y: 6..32)
					if bx >= 140 && bx <= 166 && by >= 6 && by <= 32 {
						app.spotter.AdjustVolume(-10)
						continue
					}

					// Volume Up [+] (x: 210..236, y: 6..32)
					if bx >= 210 && bx <= 236 && by >= 6 && by <= 32 {
						app.spotter.AdjustVolume(10)
						continue
					}

					// Otherwise start dragging window
					isDragging = true
					dragStartX = int(C.get_btn_root_x(&ev))
					dragStartY = int(C.get_btn_root_y(&ev))

					var curX, curY C.int
					var curChild C.Window
					C.XTranslateCoordinates(dpy, win, root, 0, 0, &curX, &curY, &curChild)
					winStartX = int(curX)
					winStartY = int(curY)
				}

			case C.ButtonRelease:
				btn := C.get_btn_button(&ev)
				if btn == C.Button1 {
					isDragging = false
				}

			case C.MotionNotify:
				if isDragging {
					curRootX := int(C.get_motion_root_x(&ev))
					curRootY := int(C.get_motion_root_y(&ev))
					dx := curRootX - dragStartX
					dy := curRootY - dragStartY
					C.XMoveWindow(dpy, win, C.int(winStartX+dx), C.int(winStartY+dy))
				}
			}
		}

		select {
		case <-app.quitChan:
			return nil
		case <-ticker.C:
		}

		// ---------------- Render Frame into backbuffer ----------------
		// 1. Clear Background
		C.XSetForeground(dpy, gc, colBg)
		C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 0, 0, C.uint(width), C.uint(height))

		// 2. Window outer border
		C.XSetForeground(dpy, gc, colBorder)
		C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, 0, 0, C.uint(width-1), C.uint(height-1))

		// 3. Top Control Bar (Buttons & Spotter Radio)
		spotCfg := app.spotter.Get()

		// 3a. Pep Radio Mute Button
		if spotCfg.Enabled {
			C.XSetForeground(dpy, gc, colBox)
			C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 8, 6, 126, 26)
			C.XSetForeground(dpy, gc, colGas)
			C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, 8, 6, 126, 26)
			pepText := C.CString("[#] Pep: Activo")
			C.XDrawString(dpy, C.Drawable(backbuffer), gc, 16, 23, pepText, C.int(len("[#] Pep: Activo")))
			C.free(unsafe.Pointer(pepText))
		} else {
			C.XSetForeground(dpy, gc, colBox)
			C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 8, 6, 126, 26)
			C.XSetForeground(dpy, gc, colClose)
			C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, 8, 6, 126, 26)
			pepText := C.CString("[X] Pep: MUDO")
			C.XDrawString(dpy, C.Drawable(backbuffer), gc, 20, 23, pepText, C.int(len("[X] Pep: MUDO")))
			C.free(unsafe.Pointer(pepText))
		}

		// 3b. Volume Down [-]
		C.XSetForeground(dpy, gc, colBox)
		C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 140, 6, 24, 26)
		C.XSetForeground(dpy, gc, colBorder)
		C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, 140, 6, 24, 26)
		C.XSetForeground(dpy, gc, colWhite)
		vDownText := C.CString("-")
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, 149, 23, vDownText, 1)
		C.free(unsafe.Pointer(vDownText))

		// 3c. Volume Text
		volStr := fmt.Sprintf("%d%%", spotCfg.Volume)
		volCStr := C.CString(volStr)
		C.XSetForeground(dpy, gc, colMuted)
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, 172, 23, volCStr, C.int(len(volStr)))
		C.free(unsafe.Pointer(volCStr))

		// 3d. Volume Up [+]
		C.XSetForeground(dpy, gc, colBox)
		C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 210, 6, 24, 26)
		C.XSetForeground(dpy, gc, colBorder)
		C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, 210, 6, 24, 26)
		C.XSetForeground(dpy, gc, colWhite)
		vUpText := C.CString("+")
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, 218, 23, vUpText, 1)
		C.free(unsafe.Pointer(vUpText))

		// 3e. Car Stats Readout (Gear, Speed, RPM)
		latestPkt, hasData, isTrail := app.GetLatest()
		gearStr := "N"
		if latestPkt.Gear == 0 {
			gearStr = "R"
		} else if latestPkt.Gear == 1 {
			gearStr = "N"
		} else if latestPkt.Gear > 1 {
			gearStr = fmt.Sprintf("%d", latestPkt.Gear-1)
		}
		statsStr := fmt.Sprintf("G:%s  %.0fkm/h  %drpm", gearStr, latestPkt.SpeedKmh, latestPkt.RPM)
		if !hasData {
			statsStr = "Esperando telemetria 50Hz..."
		}
		statsCStr := C.CString(statsStr)
		C.XSetForeground(dpy, gc, colWhite)
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, 246, 23, statsCStr, C.int(len(statsStr)))
		C.free(unsafe.Pointer(statsCStr))

		// 3f. Close Button [X]
		C.XSetForeground(dpy, gc, colBox)
		C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, C.int(width-35), 6, 27, 26)
		C.XSetForeground(dpy, gc, colClose)
		C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, C.int(width-35), 6, 27, 26)
		closeText := C.CString("X")
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, C.int(width-25), 23, closeText, 1)
		C.free(unsafe.Pointer(closeText))

		// 4. Oscilloscope Grid & Labels
		oscX := 45
		oscY := 45
		oscW := 455
		oscH := 150

		C.XSetForeground(dpy, gc, colGrid)
		y100 := oscY
		y75 := oscY + oscH/4
		y50 := oscY + oscH/2
		y25 := oscY + 3*oscH/4
		y0 := oscY + oscH

		C.XDrawLine(dpy, C.Drawable(backbuffer), gc, C.int(oscX), C.int(y100), C.int(oscX+oscW), C.int(y100))
		C.XDrawLine(dpy, C.Drawable(backbuffer), gc, C.int(oscX), C.int(y75), C.int(oscX+oscW), C.int(y75))
		C.XDrawLine(dpy, C.Drawable(backbuffer), gc, C.int(oscX), C.int(y50), C.int(oscX+oscW), C.int(y50))
		C.XDrawLine(dpy, C.Drawable(backbuffer), gc, C.int(oscX), C.int(y25), C.int(oscX+oscW), C.int(y25))
		C.XDrawLine(dpy, C.Drawable(backbuffer), gc, C.int(oscX), C.int(y0), C.int(oscX+oscW), C.int(y0))

		// Y-axis grid labels
		C.XSetForeground(dpy, gc, colMuted)
		l100 := C.CString("100%")
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, 8, C.int(y100+4), l100, 4)
		C.free(unsafe.Pointer(l100))

		l50 := C.CString("50%")
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, 14, C.int(y50+4), l50, 3)
		C.free(unsafe.Pointer(l50))

		l0 := C.CString("0%")
		C.XDrawString(dpy, C.Drawable(backbuffer), gc, 20, C.int(y0+4), l0, 2)
		C.free(unsafe.Pointer(l0))

		// 5. Draw Pedal Traces (Gas = Neon Green, Brake = Racing Red)
		samples := app.trace.Snapshot()
		numSamples := len(samples)
		if numSamples > 1 {
			for i := 0; i < numSamples; i++ {
				px := oscX + int(float64(i)/float64(app.trace.maxSamples-1)*float64(oscW))
				if px > oscX+oscW {
					px = oscX + oscW
				}
				pyGas := y0 - int(samples[i].Gas*float64(oscH))
				pyBrake := y0 - int(samples[i].Brake*float64(oscH))

				gasPts[i].x = C.short(px)
				gasPts[i].y = C.short(pyGas)
				brakePts[i].x = C.short(px)
				brakePts[i].y = C.short(pyBrake)
			}

			// Render lines
			C.XDrawLines(dpy, C.Drawable(backbuffer), gcGas, (*C.XPoint)(unsafe.Pointer(&gasPts[0])), C.int(numSamples), C.CoordModeOrigin)
			C.XDrawLines(dpy, C.Drawable(backbuffer), gcBrake, (*C.XPoint)(unsafe.Pointer(&brakePts[0])), C.int(numSamples), C.CoordModeOrigin)
		}

		// 6. Right Vertical Instantaneous Level Bars (Throttle & Brake)
		barGasH := int(latestPkt.Gas * float64(oscH))
		barBrakeH := int(latestPkt.Brake * float64(oscH))

		// Throttle bar (x: 512..524)
		C.XSetForeground(dpy, gc, colBox)
		C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 512, C.int(oscY), 12, C.uint(oscH))
		C.XSetForeground(dpy, gc, colGas)
		if barGasH > 0 {
			C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 512, C.int(y0-barGasH), 12, C.uint(barGasH))
		}
		C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, 512, C.int(oscY), 12, C.uint(oscH))

		// Brake bar (x: 532..544)
		C.XSetForeground(dpy, gc, colBox)
		C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 532, C.int(oscY), 12, C.uint(oscH))
		C.XSetForeground(dpy, gc, colBrake)
		if barBrakeH > 0 {
			C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, 532, C.int(y0-barBrakeH), 12, C.uint(barBrakeH))
		}
		C.XDrawRectangle(dpy, C.Drawable(backbuffer), gc, 532, C.int(oscY), 12, C.uint(oscH))

		// 7. Footer / Trail Braking Badge
		if isTrail {
			C.XSetForeground(dpy, gc, colTrail)
			C.XFillRectangle(dpy, C.Drawable(backbuffer), gc, C.int(oscX), 205, 230, 26)
			C.XSetForeground(dpy, gc, colBg)
			trailText := C.CString(">>> TRAIL BRAKING ACTIVO <<<")
			C.XDrawString(dpy, C.Drawable(backbuffer), gc, C.int(oscX+12), 222, trailText, C.int(len(">>> TRAIL BRAKING ACTIVO <<<")))
			C.free(unsafe.Pointer(trailText))
		} else {
			C.XSetForeground(dpy, gc, colMuted)
			hintText := C.CString("IdoRacing Pedal & Trail HUD  (Arrastrar con raton | Esc para salir)")
			C.XDrawString(dpy, C.Drawable(backbuffer), gc, C.int(oscX), 222, hintText, C.int(len("IdoRacing Pedal & Trail HUD  (Arrastrar con raton | Esc para salir)")))
			C.free(unsafe.Pointer(hintText))
		}

		// 8. Blit backbuffer into the window
		C.XCopyArea(dpy, backbuffer, C.Drawable(win), gc, 0, 0, C.uint(width), C.uint(height), 0, 0)
		C.XFlush(dpy)
	}
}
