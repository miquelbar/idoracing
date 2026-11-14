//go:build !windows

package main

import "net"

func createUDPSender() (udpSender, error) {
	return net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
}
