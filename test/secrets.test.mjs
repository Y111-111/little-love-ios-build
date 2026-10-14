import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { saveConfig, loadConfig } from '../secrets.mjs';

test('mailbox is encrypted and restored in a fresh process', { skip:process.platform !== 'win32', timeout:25000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(),'little-love-secrets-'));
  const config = { sender:'123456@qq.com', recipient:'student@163.com', name:'测试小熊', auth:'abcdefghijklmnop' };
  assert.equal(await loadConfig(directory),null);
  await saveConfig(directory,config);
  const stored = await readFile(path.join(directory,'mailbox.encrypted'),'utf8');
  assert.equal(stored.includes(config.auth),false); assert.equal(stored.includes(config.sender),false);
  assert.deepEqual(await loadConfig(directory),config);
  await new Promise((resolve,reject) => {
    const code = 'import { loadConfig } from "./secrets.mjs"; const c=await loadConfig(process.env.LOVE_TEST_DIR); if(c?.auth!=="abcdefghijklmnop"||c?.recipient!=="student@163.com"||c?.name!=="测试小熊") process.exit(1);';
    const child = spawn(process.execPath,['--input-type=module','-e',code],{env:{...process.env,LOVE_TEST_DIR:directory},windowsHide:true,stdio:'ignore'});
    child.on('error',reject); child.on('close',exit => exit === 0 ? resolve() : reject(new Error('Restart failed to restore encrypted settings')));
  });
});
