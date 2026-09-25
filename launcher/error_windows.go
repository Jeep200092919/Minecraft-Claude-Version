package main

import (
	"syscall"
	"unsafe"
)

// showError displays a native message box (the launcher has no console).
func showError(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	text, _ := syscall.UTF16PtrFromString(msg)
	title, _ := syscall.UTF16PtrFromString("ClaudeCraft")
	const mbIconError = 0x10
	box.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), mbIconError)
}
