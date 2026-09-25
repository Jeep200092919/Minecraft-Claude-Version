// ClaudeCraft launcher.
//
// The whole game is a single HTML file embedded in this executable. On start
// it is unpacked to the user's cache directory and opened in a chromeless
// Microsoft Edge / Google Chrome "app" window, falling back to the default
// web browser. Saves live in that browser profile, so they persist between
// launches.
package main

import (
	"bytes"
	_ "embed"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

//go:embed claudecraft.html
var gameHTML []byte

func main() {
	dir := appDir()
	_ = os.MkdirAll(dir, 0o755)
	page := filepath.Join(dir, "claudecraft.html")
	if current, err := os.ReadFile(page); err != nil || !bytes.Equal(current, gameHTML) {
		if err := os.WriteFile(page, gameHTML, 0o644); err != nil {
			fail("Could not write the game files to " + page + ": " + err.Error())
		}
	}
	pageURL := (&url.URL{Scheme: "file", Path: toURLPath(page)}).String()

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
			return
		}
	}
	if err := openDefault(page); err != nil {
		fail("Could not open a web browser. Open this file manually: " + page)
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
