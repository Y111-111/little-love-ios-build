import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('pages load and mailbox actions require local authorization', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(),'little-love-http-'));
  const child = spawn(process.execPath, ['server.mjs'], { env: { ...process.env, PORT: '0', LOVE_LAN: '0', LOVE_DATA_DIR:directory }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  try {
    const address = await new Promise((resolve,reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timeout')),5000);
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)\/#key=([a-f0-9]+)/); if (match) { clearTimeout(timer); resolve({ base: `http://127.0.0.1:${match[1]}`, key: match[2] }); } });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { if (code) { clearTimeout(timer); reject(new Error('Server failed to start')); } });
    });
    const call = (route, options = {}) => fetch(address.base+route, { ...options, signal: AbortSignal.timeout(4000) });
    for (const asset of ['/','/app.js','/style.css','/manifest.webmanifest','/icon.svg']) assert.equal((await call(asset)).status,200);
    const policy = (await call('/')).headers.get('content-security-policy');
    assert.match(policy, /img-src 'self' data: blob:/);
    assert.match(policy, /script-src 'self';/);
    assert.equal((await call('/api/state')).status,401);
    assert.equal((await call('/.local/state.json')).status,404);
    const headers = { 'X-Love-Key': address.key, 'Content-Type': 'application/json' };
    const response = await call('/api/state',{headers}); const initial = await response.json();
    assert.equal(initial.ready,false); assert.equal(initial.canConfigure,true); assert.equal('auth' in initial.profile,false);
    assert.equal((await call('/api/order',{method:'POST',headers,body:JSON.stringify({item:'hug'})})).status,400);
    assert.equal((await call('/api/config',{method:'POST',headers:{...headers, Origin:'http://example.com'},body:'{}'})).status,403);
    assert.equal((await call('/api/config',{method:'POST',headers,body:JSON.stringify({sender:'123456@qq.com',recipient:'654321@qq.com',auth:'wrong'})})).status,400);
    assert.equal((await call('/api/config',{method:'POST',headers,body:JSON.stringify({sender:initial.sender || '123456@qq.com',recipient:'student@m.scnu.edu.cn',auth:'abcdefghijklmnop'})})).status,200);
    assert.equal((await call('/api/config',{method:'POST',headers,body:JSON.stringify({sender:initial.sender || '123456@qq.com',recipient:'someone@163.com',auth:''})})).status,200);
    const changed = await (await call('/api/state',{headers})).json();
    assert.equal(changed.profile.recipient,'someone@163.com');
    assert.equal(changed.hearts,initial.hearts); assert.equal(changed.nextAt,initial.nextAt);
    assert.equal('auth' in changed.profile,false);
    const uploaded = await call('/api/photos',{method:'POST',headers,body:JSON.stringify({photo:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='})});
    assert.equal(uploaded.status,200);const photo=(await uploaded.json()).photo;
    assert.equal((await call(photo)).status,401);
    const image=await call(photo+'?key='+address.key);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
    assert.equal((await call('/api/photos',{method:'POST',headers,body:JSON.stringify({photo:'data:image/png;base64,aGVsbG8='})})).status,400);
  } finally { child.kill(); }
});
