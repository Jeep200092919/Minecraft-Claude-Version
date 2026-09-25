// Keyboard / mouse state and pointer-lock management.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.buttons = new Set();
    this.pressedButtons = [];
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.fallbackLook = false; // pointer lock unavailable: look by moving the mouse
    this.onKey = null; // (code, event) => void
    this.onLockChange = null; // (locked) => void

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'F1', 'F3'].includes(e.code)) e.preventDefault();
      // Ctrl is the sprint key: keep Ctrl+W (close), Ctrl+S, Ctrl+D... from
      // reaching the browser. Ctrl+W itself can only be caught while the
      // keyboard is locked in fullscreen (see lockKeyboard); otherwise the
      // page asks before closing.
      if ((e.ctrlKey || e.metaKey) && /^Key[A-Z]$/.test(e.code) && e.code !== 'KeyC' && e.code !== 'KeyV') e.preventDefault();
      if (!e.repeat) this.onKey?.(e.code, e);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.buttons.add(e.button);
      this.pressedButtons.push(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    window.addEventListener('mousemove', (e) => {
      if (this.locked || this.fallbackLook) {
        const mx = e.movementX || 0, my = e.movementY || 0;
        // Some browsers report a huge jump right after pointer lock engages.
        if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;
        this.dx += mx;
        this.dy += my;
      }
    });
    canvas.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) this.fallbackLook = false;
      this.onLockChange?.(this.locked);
    });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // Returns and clears accumulated mouse movement.
  takeMouse() {
    const d = [this.dx, this.dy];
    this.dx = this.dy = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  takePressedButtons() {
    const b = this.pressedButtons;
    this.pressedButtons = [];
    return b;
  }

  // Resolves to true if the pointer was captured.
  lock() {
    if (this.locked) return Promise.resolve(true);
    if (!this.canvas.requestPointerLock) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        resolve(ok);
      };
      const onChange = () => done(document.pointerLockElement === this.canvas);
      const onError = () => done(false);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      try {
        const p = this.canvas.requestPointerLock();
        if (p && typeof p.then === 'function') p.catch(() => done(false));
      } catch {
        done(false);
      }
      setTimeout(() => done(document.pointerLockElement === this.canvas), 1500);
    });
  }

  // Fullscreen with the keyboard locked: the game then receives shortcuts
  // like Ctrl+W instead of the browser closing the window (Chrome and Edge).
  // Must be called from a click or key press.
  lockKeyboard() {
    try {
      const done = () => navigator.keyboard?.lock?.(['KeyW', 'KeyQ', 'KeyN', 'KeyT', 'KeyR', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'KeyF', 'Tab'])?.catch?.(() => {});
      if (document.fullscreenElement) done();
      else document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.then(done, () => {});
    } catch {
      /* not supported */
    }
  }

  unlock() {
    this.fallbackLook = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  reset() {
    this.keys.clear();
    this.buttons.clear();
    this.pressedButtons = [];
    this.dx = this.dy = this.wheel = 0;
  }
}
