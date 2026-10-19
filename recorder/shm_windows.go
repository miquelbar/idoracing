//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	kernel32             = syscall.NewLazyDLL("kernel32.dll")
	procOpenFileMappingW = kernel32.NewProc("OpenFileMappingW")
	procSetPriorityClass = kernel32.NewProc("SetPriorityClass")
)

const (
	fileMapRead              = 0x0004
	belowNormalPriorityClass = 0x00004000

	physicsPageName  = `Local\acpmf_physics`
	graphicsPageName = `Local\acpmf_graphics`
	staticPageName   = `Local\acpmf_static`
)

// sharedPage is a read-only view of one of ACC's shared memory pages.
type sharedPage struct {
	handle syscall.Handle
	addr   uintptr
	view   []byte
}

func openSharedPage(name string, size int) (*sharedPage, error) {
	namePtr, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	h, _, callErr := procOpenFileMappingW.Call(fileMapRead, 0, uintptr(unsafe.Pointer(namePtr)))
	if h == 0 {
		return nil, fmt.Errorf("open %s: %w", name, callErr)
	}
	addr, err := syscall.MapViewOfFile(syscall.Handle(h), fileMapRead, 0, 0, uintptr(size))
	if err != nil {
		syscall.CloseHandle(syscall.Handle(h))
		return nil, fmt.Errorf("map %s: %w", name, err)
	}
	return &sharedPage{
		handle: syscall.Handle(h),
		addr:   addr,
		// The view lives outside Go's heap until UnmapViewOfFile, so turning its address into a pointer is safe.
		view: unsafe.Slice((*byte)(unsafe.Pointer(addr)), size),
	}, nil
}

// snapshot copies the page so a frame is decoded from one consistent read.
func (p *sharedPage) snapshot(dst []byte) []byte {
	return append(dst[:0], p.view...)
}

func (p *sharedPage) close() {
	syscall.UnmapViewOfFile(p.addr)
	syscall.CloseHandle(p.handle)
}

// lowerPriority keeps the recorder from competing with the game for CPU time.
func lowerPriority() {
	self, err := syscall.GetCurrentProcess()
	if err == nil {
		procSetPriorityClass.Call(uintptr(self), belowNormalPriorityClass)
	}
}
