//go:build windows

package main

import (
	"strings"
	"syscall"
	"unsafe"
)

// processRunning reports whether a process with this executable name is running. Under Proton the
// snapshot lists the processes of the same prefix, which is where the game runs.
func processRunning(exe string) (bool, error) {
	snap, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return false, err
	}
	defer syscall.CloseHandle(snap)

	targets := strings.Split(exe, ",")
	for i := range targets {
		targets[i] = strings.TrimSpace(targets[i])
	}

	var entry syscall.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err = syscall.Process32First(snap, &entry); err == nil; err = syscall.Process32Next(snap, &entry) {
		name := syscall.UTF16ToString(entry.ExeFile[:])
		for _, target := range targets {
			if target != "" && strings.EqualFold(name, target) {
				return true, nil
			}
		}
	}
	return false, nil
}
