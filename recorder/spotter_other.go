//go:build !windows

package main

func checkKey(vk uintptr) bool {
	return false
}
