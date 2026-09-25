// LAN multiplayer server built into the launcher.
//
// It serves the game at http://<this computer>:<port>/ so friends on the
// same network can open it in a browser, and relays players' actions over a
// WebSocket at /ws. The player who clicks "Open to LAN" uploads their world
// (seed, block edits, chests, time, weather); the server keeps it in step
// and forwards everything else. It speaks the same protocol as
// tools/server.mjs --lan.
package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	protocolVersion = 1
	defaultPort     = 25565
	wsGUID          = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	maxMessage      = 32 << 20
)

// --- WebSocket (RFC 6455) --------------------------------------------------------------

type wsConn struct {
	conn   net.Conn
	r      *bufio.Reader
	mu     sync.Mutex
	closed bool
}

func upgrade(w http.ResponseWriter, r *http.Request) (*wsConn, error) {
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" || !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		http.Error(w, "expected a WebSocket", http.StatusBadRequest)
		return nil, errors.New("not a websocket request")
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "unsupported", http.StatusInternalServerError)
		return nil, errors.New("cannot hijack")
	}
	conn, rw, err := hj.Hijack()
	if err != nil {
		return nil, err
	}
	sum := sha1.Sum([]byte(key + wsGUID))
	accept := base64.StdEncoding.EncodeToString(sum[:])
	_, err = conn.Write([]byte("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n"))
	if err != nil {
		conn.Close()
		return nil, err
	}
	return &wsConn{conn: conn, r: rw.Reader}, nil
}

// readMessage returns the next text/binary message, answering pings.
func (c *wsConn) readMessage() ([]byte, error) {
	var msg []byte
	for {
		c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		var hdr [2]byte
		if _, err := io.ReadFull(c.r, hdr[:]); err != nil {
			return nil, err
		}
		fin, op, masked := hdr[0]&0x80 != 0, hdr[0]&0x0f, hdr[1]&0x80 != 0
		n := uint64(hdr[1] & 0x7f)
		if n == 126 {
			var b [2]byte
			if _, err := io.ReadFull(c.r, b[:]); err != nil {
				return nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b[:]))
		} else if n == 127 {
			var b [8]byte
			if _, err := io.ReadFull(c.r, b[:]); err != nil {
				return nil, err
			}
			n = binary.BigEndian.Uint64(b[:])
		}
		if n > maxMessage || uint64(len(msg))+n > maxMessage {
			return nil, errors.New("message too large")
		}
		var mask [4]byte
		if masked {
			if _, err := io.ReadFull(c.r, mask[:]); err != nil {
				return nil, err
			}
		}
		payload := make([]byte, n)
		if _, err := io.ReadFull(c.r, payload); err != nil {
			return nil, err
		}
		if masked {
			for i := range payload {
				payload[i] ^= mask[i&3]
			}
		}
		switch op {
		case 0x8:
			return nil, io.EOF
		case 0x9:
			c.write(0xA, payload)
			continue
		case 0xA:
			continue
		}
		msg = append(msg, payload...)
		if fin {
			return msg, nil
		}
	}
}

func (c *wsConn) write(op byte, payload []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed {
		return errors.New("closed")
	}
	n := len(payload)
	var hdr []byte
	switch {
	case n < 126:
		hdr = []byte{0x80 | op, byte(n)}
	case n < 65536:
		hdr = []byte{0x80 | op, 126, byte(n >> 8), byte(n)}
	default:
		hdr = make([]byte, 10)
		hdr[0], hdr[1] = 0x80|op, 127
		binary.BigEndian.PutUint64(hdr[2:], uint64(n))
	}
	c.conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	_, err := c.conn.Write(append(hdr, payload...))
	return err
}

func (c *wsConn) close() {
	c.write(0x8, []byte{0x03, 0xe8})
	c.mu.Lock()
	c.closed = true
	c.mu.Unlock()
	c.conn.Close()
}

// --- Shared world ----------------------------------------------------------------------

type world struct {
	meta          map[string]any // seed, name, mode
	edits         map[string]map[int]byte
	blockEntities map[string]json.RawMessage
	ticks         float64
	weather       json.RawMessage
	playerData    map[string]json.RawMessage
}

func (w *world) setBlock(x, y, z, id int) bool {
	if y < 0 || y > 255 || id < 0 || id > 255 {
		return false
	}
	key := fmt.Sprintf("%d,%d", floorDiv(x, 16), floorDiv(z, 16))
	m := w.edits[key]
	if m == nil {
		m = map[int]byte{}
		w.edits[key] = m
	}
	m[(y<<8)|((z&15)<<4)|(x&15)] = byte(id)
	return true
}

func floorDiv(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// Same format as the game's saves: { "cx,cz": base64(idx16 id8 ...) }.
func (w *world) encodeEdits() map[string]string {
	out := map[string]string{}
	for key, m := range w.edits {
		b := make([]byte, 0, len(m)*3)
		for idx, id := range m {
			b = append(b, byte(idx>>8), byte(idx&255), id)
		}
		out[key] = base64.StdEncoding.EncodeToString(b)
	}
	return out
}

var chunkKeyRe = regexp.MustCompile(`^-?\d+,-?\d+$`)

func (w *world) loadEdits(raw map[string]string) {
	w.edits = map[string]map[int]byte{}
	for key, v := range raw {
		if !chunkKeyRe.MatchString(key) {
			continue
		}
		b, err := base64.StdEncoding.DecodeString(v)
		if err != nil {
			continue
		}
		m := map[int]byte{}
		for i := 0; i+2 < len(b); i += 3 {
			m[int(b[i])<<8|int(b[i+1])] = b[i+2]
		}
		w.edits[key] = m
	}
}

func (w *world) blockEntityList() [][2]any {
	out := [][2]any{}
	for k, d := range w.blockEntities {
		out = append(out, [2]any{k, d})
	}
	return out
}

// --- Server ---------------------------------------------------------------------------------

type client struct {
	id    string
	name  string
	state json.RawMessage
	ws    *wsConn
	out   chan []byte
}

type lanServer struct {
	mu        sync.Mutex
	clients   map[string]*client
	order     []string // join order, for handing over the simulation
	nextID    int
	authority string
	hostID    string
	world     *world
	port      int
	active    time.Time
	gameHTML  []byte
}

func newLANServer(gameHTML []byte) *lanServer {
	return &lanServer{clients: map[string]*client{}, nextID: 1, gameHTML: gameHTML, active: time.Now()}
}

// listen serves on the first free port from defaultPort up.
func (s *lanServer) listen() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/ws", s.serveWS)
	mux.HandleFunc("/api/info", s.serveInfo)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		s.touch()
		if r.URL.Path != "/" && r.URL.Path != "/index.html" && r.URL.Path != "/claudecraft.html" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Write(s.gameHTML)
	})
	var lastErr error
	for port := defaultPort; port < defaultPort+10; port++ {
		ln, err := net.Listen("tcp", ":"+strconv.Itoa(port))
		if err != nil {
			lastErr = err
			continue
		}
		s.port = port
		go http.Serve(ln, mux)
		go s.heartbeat()
		return nil
	}
	return lastErr
}

func (s *lanServer) touch() {
	s.mu.Lock()
	s.active = time.Now()
	s.mu.Unlock()
}

// idleFor reports how long nobody has been connected or loaded the page.
func (s *lanServer) idleFor() time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.clients) > 0 {
		return 0
	}
	return time.Since(s.active)
}

func (s *lanServer) heartbeat() {
	for range time.Tick(20 * time.Second) {
		s.mu.Lock()
		list := make([]*client, 0, len(s.clients))
		for _, c := range s.clients {
			list = append(list, c)
		}
		s.mu.Unlock()
		for _, c := range list {
			c.ws.write(0x9, nil)
		}
	}
}

func lanAddresses() []string {
	out := []string{}
	addrs, _ := net.InterfaceAddrs()
	for _, a := range addrs {
		if ip, ok := a.(*net.IPNet); ok && !ip.IP.IsLoopback() && ip.IP.To4() != nil {
			out = append(out, ip.IP.String())
		}
	}
	return out
}

func (s *lanServer) serveInfo(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	names := []string{}
	for _, id := range s.order {
		if c := s.clients[id]; c != nil && c.name != "" {
			names = append(names, c.name)
		}
	}
	var name any
	if s.world != nil {
		name = s.world.meta["name"]
	}
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(map[string]any{"game": "claudecraft", "protocol": protocolVersion, "name": name, "lan": true, "players": names, "addresses": lanAddresses(), "port": s.port})
}

func (s *lanServer) serveWS(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrade(w, r)
	if err != nil {
		return
	}
	s.mu.Lock()
	c := &client{id: "p" + strconv.Itoa(s.nextID), ws: ws, out: make(chan []byte, 1024)}
	s.nextID++
	s.clients[c.id] = c
	s.order = append(s.order, c.id)
	s.active = time.Now()
	s.mu.Unlock()
	go func() {
		for msg := range c.out {
			if ws.write(0x1, msg) != nil {
				ws.conn.Close()
			}
		}
	}()
	for {
		msg, err := ws.readMessage()
		if err != nil {
			break
		}
		s.handle(c, msg)
	}
	s.disconnect(c)
}

// send queues a message; a client that cannot keep up is dropped. Callers
// hold s.mu.
func (s *lanServer) send(c *client, msg any) {
	b, ok := msg.([]byte)
	if !ok {
		b, _ = json.Marshal(msg)
	}
	select {
	case c.out <- b:
	default:
		go c.ws.conn.Close()
	}
}

func (s *lanServer) broadcast(msg any, except *client) {
	b, ok := msg.([]byte)
	if !ok {
		b, _ = json.Marshal(msg)
	}
	for _, c := range s.clients {
		if c != except && c.name != "" {
			s.send(c, b)
		}
	}
}

var nameRe = regexp.MustCompile(`[^A-Za-z0-9_]`)

func (s *lanServer) handle(c *client, raw []byte) {
	var m map[string]json.RawMessage
	if json.Unmarshal(raw, &m) != nil {
		return
	}
	var t string
	json.Unmarshal(m["t"], &t)
	s.mu.Lock()
	defer s.mu.Unlock()
	s.active = time.Now()
	if c.name == "" {
		if t == "hello" {
			s.hello(c, m)
		}
		return
	}
	w := s.world
	if w == nil {
		return
	}
	switch t {
	case "pos":
		c.state = raw
		m["id"], _ = json.Marshal(c.id)
		s.broadcast(m, c)
	case "blocks":
		var list [][]float64
		json.Unmarshal(m["list"], &list)
		ok := [][4]int{}
		for _, b := range list {
			if len(b) != 4 {
				continue
			}
			v := [4]int{int(b[0]), int(b[1]), int(b[2]), int(b[3])}
			if w.setBlock(v[0], v[1], v[2], v[3]) {
				ok = append(ok, v)
			}
		}
		s.broadcast(map[string]any{"t": "blocks", "list": ok, "from": c.id}, c)
	case "be":
		var k string
		json.Unmarshal(m["k"], &k)
		d := m["d"]
		if k == "" {
			return
		}
		if len(d) == 0 || string(d) == "null" {
			delete(w.blockEntities, k)
			d = json.RawMessage("null")
		} else {
			w.blockEntities[k] = d
		}
		s.broadcast(map[string]any{"t": "be", "k": k, "d": d}, c)
	case "chat":
		var text string
		json.Unmarshal(m["text"], &text)
		text = strings.TrimSpace(text)
		if len(text) > 256 {
			text = text[:256]
		}
		if text != "" {
			s.broadcast(map[string]any{"t": "chat", "from": c.id, "name": c.name, "text": text}, nil)
		}
	case "time":
		var ticks float64
		if json.Unmarshal(m["ticks"], &ticks) == nil {
			w.ticks = ticks
			s.broadcast(map[string]any{"t": "time", "ticks": ticks}, c)
		}
	case "weather":
		w.weather = m["w"]
		s.broadcast(map[string]any{"t": "weather", "w": m["w"]}, c)
	case "ents":
		if c.id == s.authority {
			s.broadcast(raw, c)
		}
	case "to":
		var to string
		json.Unmarshal(m["to"], &to)
		if to == "auth" {
			to = s.authority
		}
		if target := s.clients[to]; target != nil && target.name != "" {
			s.send(target, map[string]any{"t": "msg", "from": c.id, "m": m["m"]})
		}
	case "bc":
		s.broadcast(map[string]any{"t": "msg", "from": c.id, "m": m["m"]}, c)
	case "save":
		if len(m["data"]) > 0 && m["data"][0] == '{' {
			w.playerData[c.name] = m["data"]
		}
	}
}

func (s *lanServer) hello(c *client, m map[string]json.RawMessage) {
	var protocol int
	json.Unmarshal(m["protocol"], &protocol)
	if protocol != protocolVersion {
		s.send(c, map[string]any{"t": "error", "text": fmt.Sprintf("This server runs a different version of ClaudeCraft (protocol %d).", protocolVersion)})
		go closeSoon(c)
		return
	}
	hostRaw, hosting := m["host"]
	hosting = hosting && len(hostRaw) > 0 && string(hostRaw) != "null"
	if hosting && s.world == nil {
		var h struct {
			Seed          float64             `json:"seed"`
			Name          string              `json:"name"`
			Mode          string              `json:"mode"`
			Edits         map[string]string   `json:"edits"`
			BlockEntities [][]json.RawMessage `json:"blockEntities"`
			Ticks         float64             `json:"ticks"`
			Weather       json.RawMessage     `json:"weather"`
		}
		if json.Unmarshal(hostRaw, &h) != nil {
			return
		}
		mode := "survival"
		if h.Mode == "creative" {
			mode = "creative"
		}
		name := h.Name
		if name == "" {
			name = "LAN World"
		}
		if len(name) > 40 {
			name = name[:40]
		}
		w := &world{meta: map[string]any{"seed": uint32(h.Seed), "name": name, "mode": mode}, blockEntities: map[string]json.RawMessage{}, ticks: h.Ticks, weather: h.Weather, playerData: map[string]json.RawMessage{}}
		w.loadEdits(h.Edits)
		for _, e := range h.BlockEntities {
			var k string
			if len(e) == 2 && json.Unmarshal(e[0], &k) == nil {
				w.blockEntities[k] = e[1]
			}
		}
		s.world = w
		s.hostID = c.id
		s.authority = c.id
	} else if s.world == nil {
		s.send(c, map[string]any{"t": "error", "text": "Nobody is hosting a world on this server yet."})
		go closeSoon(c)
		return
	} else if hosting {
		s.send(c, map[string]any{"t": "error", "text": "This server is already running a world."})
		go closeSoon(c)
		return
	}
	var name string
	json.Unmarshal(m["name"], &name)
	name = nameRe.ReplaceAllString(name, "")
	if len(name) > 16 {
		name = name[:16]
	}
	if name == "" {
		name = "Player"
	}
	taken := map[string]bool{}
	for _, o := range s.clients {
		taken[o.name] = true
	}
	base := name
	for i := 2; taken[name]; i++ {
		if len(base) > 13 {
			base = base[:13]
		}
		name = base + strconv.Itoa(i)
	}
	c.name = name
	if a := s.clients[s.authority]; a == nil || a.name == "" {
		s.authority = c.id
	}
	players := []map[string]any{}
	for _, id := range s.order {
		if o := s.clients[id]; o != nil && o != c && o.name != "" {
			players = append(players, map[string]any{"id": o.id, "name": o.name, "state": o.state})
		}
	}
	w := s.world
	var you any
	if d, ok := w.playerData[name]; ok {
		you = d
	}
	s.send(c, map[string]any{
		"t": "welcome", "id": c.id, "name": name, "authority": s.authority, "world": w.meta, "edits": w.encodeEdits(),
		"blockEntities": w.blockEntityList(), "ticks": w.ticks, "weather": w.weather, "you": you, "lan": true,
		"addresses": lanAddresses(), "port": s.port, "players": players,
	})
	s.broadcast(map[string]any{"t": "join", "id": c.id, "name": name}, c)
}

func closeSoon(c *client) {
	time.Sleep(200 * time.Millisecond)
	c.ws.close()
}

func (s *lanServer) disconnect(c *client) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.clients[c.id]; !ok {
		return
	}
	delete(s.clients, c.id)
	for i, id := range s.order {
		if id == c.id {
			s.order = append(s.order[:i], s.order[i+1:]...)
			break
		}
	}
	close(c.out)
	c.ws.conn.Close()
	s.active = time.Now()
	if c.name == "" {
		return
	}
	s.broadcast(map[string]any{"t": "leave", "id": c.id, "name": c.name}, nil)
	if c.id == s.hostID {
		// The host closed their game: the world goes with them.
		for _, o := range s.clients {
			s.send(o, map[string]any{"t": "error", "text": "The host closed the game."})
			go closeSoon(o)
		}
		s.world, s.hostID, s.authority = nil, "", ""
		return
	}
	if c.id == s.authority {
		s.authority = ""
		for _, id := range s.order {
			if o := s.clients[id]; o != nil && o.name != "" {
				s.authority = o.id
				break
			}
		}
		if s.authority != "" {
			s.broadcast(map[string]any{"t": "authority", "id": s.authority}, nil)
		}
	}
}
