//go:build windows

package main

import (
	"fmt"
	"net"
	"syscall"
	"unsafe"
)

var (
	modws2_32       = syscall.NewLazyDLL("ws2_32.dll")
	procWSAStartup  = modws2_32.NewProc("WSAStartup")
	procSocket      = modws2_32.NewProc("socket")
	procSendTo      = modws2_32.NewProc("sendto")
	procClosesocket = modws2_32.NewProc("closesocket")
)

type sockaddrIn struct {
	sinFamily int16
	sinPort   uint16
	sinAddr   [4]byte
	sinZero   [8]byte
}

type wsaData struct {
	Version      uint16
	HighVersion  uint16
	Description  [257]byte
	SystemStatus [129]byte
	MaxSockets   uint16
	MaxUdpDg     uint16
	VendorInfo   uintptr
}

func htons(v uint16) uint16 {
	return (v << 8) | (v >> 8)
}

type winsockSender struct {
	sock uintptr
}

func (w *winsockSender) WriteToUDP(data []byte, addr *net.UDPAddr) (int, error) {
	if len(data) == 0 {
		return 0, nil
	}
	ip4 := addr.IP.To4()
	if ip4 == nil {
		return 0, fmt.Errorf("only IPv4 addresses are supported by winsock sender")
	}

	var target sockaddrIn
	target.sinFamily = 2 // AF_INET
	target.sinPort = htons(uint16(addr.Port))
	copy(target.sinAddr[:], ip4)

	r, _, err := procSendTo.Call(
		w.sock,
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)),
		0,
		uintptr(unsafe.Pointer(&target)),
		uintptr(unsafe.Sizeof(target)),
	)
	if int(r) == -1 {
		return 0, err
	}
	return int(r), nil
}

func (w *winsockSender) Close() error {
	if w.sock != 0 && int(w.sock) != -1 {
		procClosesocket.Call(w.sock)
		w.sock = 0
	}
	return nil
}

func createUDPSender() (udpSender, error) {
	// Under Wine, Go 1.25+ net.ListenUDP calls wsaioctl SIO_UDP_CONNRESET which fails with
	// WSAEOPNOTSUPP (error 10045). Try net.ListenUDP first, then fall back to direct Winsock.
	conn, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err == nil {
		return conn, nil
	}

	var wd wsaData
	procWSAStartup.Call(0x0202, uintptr(unsafe.Pointer(&wd)))

	// AF_INET=2, SOCK_DGRAM=2, IPPROTO_UDP=17
	sock, _, err := procSocket.Call(2, 2, 17)
	if int(sock) == -1 {
		return nil, fmt.Errorf("winsock socket: %w", err)
	}

	return &winsockSender{sock: sock}, nil
}
