const test = require('node:test');
const assert = require('node:assert/strict');
const { VaultClient, vaultOrigin } = require('../src/main/velaApi/vaultClient');
const { encryptVault, decryptVault } = require('../features/src/lib/vault/crypto.ts');

const origin = 'https://vela.example.test';
const token = `vela-vault.${Buffer.from(origin).toString('base64url')}.${'a'.repeat(43)}`;
const secret = 'fictional vault password';
const master = 'fixture master password';
const now = Date.parse('2026-11-25T03:00:00Z');
const products = [{ id: 'p', name: 'Demo', url: '', tags: [], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), accounts: [{
  id: 'a', label: 'Personal', createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
  fields: [{ id: 'f', type: 'password', label: 'Password', value: secret }],
}] }];

function fixture() {
  let record = null;
  let network = true;
  let time = now;
  let host = origin;
  let expiry = new Date(now + 120_000).toISOString();
  let handler;
  const requests = [];
  const identity = () => ({ sub: 'alice', username: 'Alice', expiresAt: expiry });
  const create = () => new VaultClient({
    now: () => time,
    getOrigin: () => host,
    isOnline: () => network,
    store: { read: () => structuredClone(record), write: value => { record = structuredClone(value); }, clear: () => { record = null; } },
    request: async (url, init) => {
      requests.push({ url, ...init });
      return handler(url, init);
    },
    onInvalidated() {},
  });
  return { create, requests, identity, record: () => record,
    handler: fn => { handler = fn; }, offline: value => { network = !value; },
    time: value => { time = value; }, origin: value => { host = value; },
  };
}

test('persisted encrypted snapshot unlocks after client restart and stays read-only offline', async () => {
  const f = fixture();
  const vault = await encryptVault(products, master);
  const snapshot = { kind: 'ready', revision: 1, vault };
  f.handler(() => Response.json({ identity: f.identity(), snapshot }));
  const client = f.create();
  assert.equal((await client.connect(token)).mode, 'online');
  assert.doesNotMatch(JSON.stringify(f.record()), /fictional vault password|fixture master password/);
  f.offline(true);
  const restarted = f.create();
  const offline = await restarted.load();
  assert.equal(offline.mode, 'offline');
  assert.deepEqual(await decryptVault(offline.snapshot.vault, master), products);
  await assert.rejects(decryptVault(offline.snapshot.vault, 'wrong password'));
  await assert.rejects(restarted.save(1, vault), { status: 0 });
  assert.equal(f.requests.length, 1);
  f.offline(false);
  f.handler(() => Response.json({}, { status: 401 }));
  assert.equal((await restarted.load()).mode, 'unlinked');
  assert.equal(f.record(), null);
});

test('saves send ciphertext and revision, and conflicts preserve the confirmed cache', async () => {
  const f = fixture();
  const vault = await encryptVault(products, master);
  const client = f.create();
  f.handler(() => Response.json({ identity: f.identity(), snapshot: { kind: 'empty', revision: 0 } }));
  await client.connect(token);
  f.handler((_url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.deepEqual(JSON.parse(init.body), { revision: 0, vault });
    assert.doesNotMatch(init.body, /fictional vault password|fixture master password/);
    return Response.json({ identity: f.identity(), snapshot: { kind: 'ready', revision: 1, vault } });
  });
  await client.save(0, { ...vault, master, products });
  f.handler(() => Response.json({}, { status: 409 }));
  await assert.rejects(client.save(1, vault), { status: 409 });
  assert.equal(f.record().cache.snapshot.revision, 1);
});

test('rejects tokens for a different server and clears cache at expiry and server change', async () => {
  const f = fixture();
  const client = f.create();
  f.handler(() => Response.json({ identity: f.identity(), snapshot: { kind: 'empty', revision: 0 } }));
  await assert.rejects(client.connect(`vela-vault.${Buffer.from('https://elsewhere.test').toString('base64url')}.${'b'.repeat(43)}`), /configured Vela server/);
  assert.equal(f.requests.length, 0);
  await client.connect(token);
  f.offline(true);
  f.time(now + 120_001);
  assert.deepEqual(await f.create().load(), { mode: 'unlinked' });
  assert.equal(f.record(), null);
  f.offline(false);
  f.time(now);
  await client.connect(token);
  f.origin('https://elsewhere.test');
  assert.deepEqual(await client.load(), { mode: 'unlinked' });
  assert.equal(f.record(), null);
  assert.throws(() => vaultOrigin('https://me:secret@vela.example.test'), /HTTPS Vela server/);
});
