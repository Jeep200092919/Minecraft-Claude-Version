import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameServer, ServerWorld, PROTOCOL } from '../tools/server.mjs';
import { decodeEdits, encodeEdits } from '../src/storage.js';
import { chunkKey } from '../src/chunk.js';
import { serverUrl } from '../src/net.js';

// A tiny client that queues incoming messages.
function connect(port, hello) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    const inbox = [];
    const waiters = [];
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const i = waiters.findIndex((w) => w.pred(m));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(m);
      else inbox.push(m);
    };
    ws.onerror = reject;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL, ...hello }));
    const c = {
      ws,
      send: (m) => ws.send(JSON.stringify(m)),
      next: (pred = () => true) => {
        const i = inbox.findIndex(pred);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          waiters.push({ pred, resolve: res });
          setTimeout(() => rej(new Error('timed out')), 3000);
        });
      },
    };
    c.next((m) => m.t === 'welcome' || m.t === 'error').then((m) => resolve({ ...c, welcome: m }));
  });
}

test('server world edits use the same format as saves', () => {
  const w = new ServerWorld();
  w.setBlock(-1, 70, 17, 5);
  w.setBlock(3, 64, 3, 0);
  const edits = decodeEdits(w.encodeEdits());
  assert.equal(edits.get(chunkKey(-1, 1)).get((70 << 8) | (1 << 4) | 15), 5);
  assert.equal(edits.get(chunkKey(0, 0)).get((64 << 8) | (3 << 4) | 3), 0);
  const back = new ServerWorld();
  back.loadEdits(encodeEdits(edits));
  assert.deepEqual(back.encodeEdits(), w.encodeEdits());
});

test('server addresses', () => {
  const page = { protocol: 'http:', host: 'example:4000' };
  assert.equal(serverUrl('', page), 'ws://example:4000/ws');
  assert.equal(serverUrl('192.168.1.5', page), 'ws://192.168.1.5:25565/ws');
  assert.equal(serverUrl('http://host:8080/', page), 'ws://host:8080/ws');
  assert.equal(serverUrl('wss://secure.example', page), 'wss://secure.example:25565/ws');
  assert.equal(serverUrl('', { protocol: 'file:', host: '' }), 'ws://localhost:25565/ws');
});

test('players share one world through the server', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cc-server-'));
  const file = join(dir, 'world.json');
  const server = await new GameServer({ port: 0, host: '127.0.0.1', world: file, seed: 'abc', mode: 'survival', name: 'Test', quiet: true, discovery: false }).start();
  try {
    const a = await connect(server.port, { name: 'Alice' });
    assert.equal(a.welcome.t, 'welcome');
    assert.equal(a.welcome.authority, a.welcome.id, 'first player runs the simulation');
    const b = await connect(server.port, { name: 'Alice' });
    assert.equal(b.welcome.name, 'Alice2', 'names are unique');
    assert.deepEqual(b.welcome.players.map((p) => p.name), ['Alice']);
    assert.equal((await a.next((m) => m.t === 'join')).name, 'Alice2');

    // Blocks, chat and messages to the authority.
    a.send({ t: 'blocks', list: [[1, 60, 1, 4], [2, 999, 2, 4]] });
    assert.deepEqual((await b.next((m) => m.t === 'blocks')).list, [[1, 60, 1, 4]], 'invalid edits are dropped');
    b.send({ t: 'chat', text: '  hi  ' });
    assert.equal((await a.next((m) => m.t === 'chat')).text, 'hi');
    b.send({ t: 'to', to: 'auth', m: { t: 'mobHit', id: 3 } });
    const hit = await a.next((m) => m.t === 'msg');
    assert.equal(hit.from, b.welcome.id);
    assert.equal(hit.m.t, 'mobHit');
    b.send({ t: 'save', data: { inventory: { slots: [] } } });

    // A late joiner receives the edits; the authority passes on when Alice leaves.
    a.ws.close();
    const handover = await b.next((m) => m.t === 'authority');
    assert.equal(handover.id, b.welcome.id);
    const c = await connect(server.port, { name: 'Carol' });
    const edits = decodeEdits(c.welcome.edits);
    assert.equal(edits.get(chunkKey(0, 0)).get((60 << 8) | (1 << 4) | 1), 4);
    b.ws.close();
    c.ws.close();
    // Hosting is refused on a dedicated server.
    const d = await connect(server.port, { name: 'Dave', host: { seed: 1 } });
    assert.equal(d.welcome.t, 'error');
  } finally {
    await server.stop();
  }
  const saved = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(saved.meta.name, 'Test');
  assert.ok(saved.playerData.Alice2, 'player data is saved by name');
  await rm(dir, { recursive: true, force: true });
});

test('LAN mode waits for a host and closes with it', async () => {
  const server = await new GameServer({ port: 0, host: '127.0.0.1', lan: true, quiet: true, discovery: false }).start();
  try {
    const early = await connect(server.port, { name: 'Early' });
    assert.equal(early.welcome.t, 'error');
    const host = await connect(server.port, { name: 'Host', host: { seed: 42, name: 'Mine', mode: 'creative', edits: { '0,0': 'AAEF' }, blockEntities: [], ticks: 5000 } });
    assert.equal(host.welcome.world.seed, 42);
    const guest = await connect(server.port, { name: 'Guest' });
    assert.equal(guest.welcome.world.mode, 'creative');
    assert.equal(guest.welcome.ticks, 5000);
    assert.deepEqual(guest.welcome.edits, { '0,0': 'AAEF' });
    host.ws.close();
    assert.match((await guest.next((m) => m.t === 'error')).text, /host closed/);
  } finally {
    await server.stop();
  }
});
