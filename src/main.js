// Entry point.
import { Game } from './game.js';
import { loadPixelFont } from './font.js';

function fail(message) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const screen = document.getElementById('screen-error');
  document.getElementById('error-text').textContent = message;
  screen.classList.add('active');
}

function start() {
  try {
    const game = new Game(document.getElementById('game'));
    // Handy for debugging from the browser console.
    window.claudecraft = game;
  } catch (err) {
    console.error(err);
    fail(
      /WebGL2/.test(String(err))
        ? 'Your browser or graphics driver does not support WebGL2, which ClaudeCraft needs. Try a recent Chrome, Edge or Firefox.'
        : String(err && err.stack ? err.stack : err),
    );
  }
}

// The pixel font is built in memory; start as soon as it's registered.
loadPixelFont().finally(start);
