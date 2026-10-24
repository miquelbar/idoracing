//go:build windows

package main

import "syscall"

var (
	user32              = syscall.NewLazyDLL("user32.dll")
	procGetAsyncKeyState = user32.NewProc("GetAsyncKeyState")
)

func checkKey(vk uintptr) bool {
	if vk == 0 {
		vk = 0x78 // VK_F9 default
	}
	r, _, _ := procGetAsyncKeyState.Call(vk)
	// 0x8000: key is currently down; 0x0001: key was pressed since last call
	return (r&0x8000) != 0 || (r&0x0001) != 0
}
