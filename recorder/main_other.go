//go:build !windows

package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "idoracing-recorder reads ACC's Windows shared memory: run the Windows build, inside ACC's Proton prefix on Linux.")
	os.Exit(1)
}
