// ClaudeCraft launcher.
//
// The whole game is a single HTML file embedded in this executable. On start
// it is unpacked to the user's cache directory and opened in a chromeless
// Microsoft Edge / Google Chrome "app" window, falling back to the default
// web browser. Saves live in that browser profile, so they persist between
// launches.
//
// While the game is open the launcher also runs the LAN multiplayer server
// (server.go): "Open to LAN" in the pause menu shares the world, and friends
// on the same network join by opening http://<this computer>:25565/.
package main

import (
	"bytes"
	_ "embed"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"time"
)

//go:embed claudecraft.html
var gameHTML []byte

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--server" {
		// Headless: only the LAN server (for a spare computer, or testing).
		lan := newLANServer(gameHTML)
		if err := lan.listen(); err != nil {
			fail("Could not start the server: " + err.Error())
		}
		os.Stdout.WriteString("ClaudeCraft LAN server on port " + strconv.Itoa(lan.port) + "\n")
		select {}
	}
	dir := appDir()
	_ = os.MkdirAll(dir, 0o755)
	page := filepath.Join(dir, "claudecraft.html")
	if current, err := os.ReadFile(page); err != nil || !bytes.Equal(current, gameHTML) {
		if err := os.WriteFile(page, gameHTML, 0o644); err != nil {
			fail("Could not write the game files to " + page + ": " + err.Error())
		}
	}
	pageURL := (&url.URL{Scheme: "file", Path: toURLPath(page)}).String()

	// The LAN server; the page learns its port from the URL fragment.
	lan := newLANServer(gameHTML)
	if lan.listen() == nil {
		pageURL += "#lan=" + strconv.Itoa(lan.port)
	} else {
		lan = nil
	}

	profile := filepath.Join(dir, "browser-profile")
	for _, browser := range browserCandidates() {
		if _, err := os.Stat(browser); err != nil {
			continue
		}
		cmd := exec.Command(browser,
			"--app="+pageURL,
			"--user-data-dir="+profile,
			"--no-first-run",
			"--no-default-browser-check",
			"--window-size=1280,800",
			"--disable-features=Translate",
		)
		if cmd.Start() == nil {
			if lan != nil {
				// Keep serving LAN players until the game window closes.
				cmd.Wait()
			}
			return
		}
	}
	if err := openDefault(pageURL); err != nil {
		fail("Could not open a web browser. Open this file manually: " + page)
	}
	if lan != nil {
		// We can't tell when a regular browser tab closes: stop once nobody
		// has used the server for a while.
		for lan.idleFor() < 30*time.Minute {
			time.Sleep(time.Minute)
		}
	}
}

func appDir() string {
	if base, err := os.UserCacheDir(); err == nil {
		return filepath.Join(base, "ClaudeCraft")
	}
	return filepath.Join(os.TempDir(), "ClaudeCraft")
}

func toURLPath(p string) string {
	p = filepath.ToSlash(p)
	if runtime.GOOS == "windows" {
		return "/" + p // file:///C:/Users/...
	}
	return p
}

func browserCandidates() []string {
	switch runtime.GOOS {
	case "windows":
		var list []string
		for _, env := range []string{"ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"} {
			if base := os.Getenv(env); base != "" {
				list = append(list,
					filepath.Join(base, "Microsoft", "Edge", "Application", "msedge.exe"),
					filepath.Join(base, "Google", "Chrome", "Application", "chrome.exe"),
				)
			}
		}
		return list
	case "darwin":
		return []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
		}
	default:
		var list []string
		for _, name := range []string{"google-chrome", "chromium", "chromium-browser", "microsoft-edge"} {
			if p, err := exec.LookPath(name); err == nil {
				list = append(list, p)
			}
		}
		return list
	}
}

func openDefault(path string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", path).Start()
	case "darwin":
		return exec.Command("open", path).Start()
	default:
		return exec.Command("xdg-open", path).Start()
	}
}

func fail(msg string) {
	showError(msg)
	os.Exit(1)
}
