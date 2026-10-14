import test from 'node:test';
import assert from 'node:assert/strict';
import { createMailService, WAIT, mailContent, validRecipient } from '../mobile/service.js';
import { mailContent as originalMail, recipientAddress } from '../lib.mjs';

function fixture() {
  const files = new Map(); let time = 1000000, calls = 0, failSend = null, failWrite = false;
  let profile = { name: '小熊', sender: '123456@qq.com', recipient: 'student@m.scnu.edu.cn', ready: true };
  const native = {
    profile: async () => ({ ...profile }),
    read: async ({ key }) => ({ value: files.get(key) || null }),
    write: async ({ key, value }) => { if (failWrite) throw new Error('disk full'); files.set(key, value); },
    configure: async value => { profile = { ...value, ready: true }; delete profile.auth; },
    send: async () => { calls++; if (failSend) throw failSend; }
  };
  return { native, files, service: () => createMailService(native, () => time), advance: () => { time += WAIT; }, calls: () => calls, sendError: value => { failSend = value; }, writeError: value => { failWrite = value; } };
}
test('mobile email text and accepted address formats match the web app', () => {
  for (const item of ['miss','kiss','hug','date','care','love']) {
    const config = { name:'小熊' }, order = { item, note: '想你了\n明天见' };
    assert.deepEqual(mailContent(config, order), originalMail(config, order));
  }
  for (const address of ['student@m.scnu.edu.cn','someone@163.com','a..b@example.com','a@example.com\r\nRCPT TO:<bad@qq.com>','a@-bad.com','a@b','a@x.example']) assert.equal(validRecipient(address), recipientAddress(address));
  assert.throws(() => mailContent({}, { item:'__proto__' }));
});
test('success adds exactly one heart and cooldown survives restart', async () => {
  const f = fixture(), service = f.service(); await service.initialize(); await service.order({item:'hug'});
  assert.equal(service.state().hearts, 1); assert.equal(service.state().history.length, 1);
  const restarted = f.service(); await restarted.initialize();
  await assert.rejects(restarted.order({item:'kiss'}), /10 分钟/); assert.equal(f.calls(), 1);
  f.advance(); await restarted.order({item:'kiss'}); assert.equal(restarted.state().hearts, 2);
});
test('rejected mail neither adds hearts nor starts a cooldown', async () => {
  const f = fixture(), service = f.service(); await service.initialize();
  f.sendError(Object.assign(new Error('auth failed'), {code:'REQUEST_FAILED'}));
  await assert.rejects(service.order({item:'hug'})); assert.equal(service.state().hearts, 0); assert.equal(service.state().nextAt, 0);
});
test('ambiguous delivery persists warning across restarts and prevents immediate retry', async () => {
  const f = fixture(), service = f.service(); await service.initialize(); f.sendError(Object.assign(new Error('unknown'), {code:'DELIVERY_UNKNOWN'}));
  await assert.rejects(service.order({item:'hug'}));
  const restarted = f.service(); await restarted.initialize(); assert.match(restarted.state().warning, /检查收件箱/);
  assert.equal(restarted.state().hearts, 0); await assert.rejects(restarted.order({item:'hug'}), /10 分钟/); assert.equal(f.calls(), 1);
});
test('cannot send if intent cannot be saved', async () => {
  const f = fixture(), service = f.service(); await service.initialize(); f.writeError(true);
  await assert.rejects(service.order({item:'hug'})); assert.equal(f.calls(), 0); assert.equal(service.state().busy, false);
});
test('unexpected native bridge interruption is treated conservatively as unconfirmed', async () => {
  const f = fixture(), service = f.service(); await service.initialize(); f.sendError(new Error('bridge interrupted'));
  await assert.rejects(service.order({item:'hug'}));
  const restarted = f.service(); await restarted.initialize(); assert.match(restarted.state().warning, /检查收件箱/);
  await assert.rejects(restarted.order({item:'hug'}), /10 分钟/);
});
test('failed final save never presents accepted email as a retryable send failure', async () => {
  const f = fixture(), service = f.service(); await service.initialize();
  f.native.send = async () => f.writeError(true);
  const result = await service.order({item:'hug'}); assert.equal(result.ok, true); assert.match(result.warning, /记录保存失败/);
  await assert.rejects(service.order({item:'hug'}), /正在处理/);
  f.writeError(false); const restarted = f.service(); await restarted.initialize(); assert.match(restarted.state().warning, /检查收件箱/);
});
test('rapid taps and settings changes cannot race a sending order', async () => {
  const f = fixture(), service = f.service(); await service.initialize(); let finish;
  f.native.send = () => new Promise(resolve => { finish = resolve; });
  const sending = service.order({item:'hug'}); await Promise.resolve(); await Promise.resolve();
  await assert.rejects(service.order({item:'kiss'}), /正在处理/);
  await assert.rejects(service.configure({sender:'123456@qq.com',recipient:'other@163.com'}), /正在处理/);
  finish(); await sending; assert.equal(service.state().hearts, 1);
});
test('changing recipient keeps heart ledger and cooldown; sender remains fixed after success', async () => {
  const f = fixture(), service = f.service(); await service.initialize(); await service.order({item:'love'});
  const before = service.state(); await service.configure({sender:'123456@qq.com',recipient:'other@163.com',auth:''});
  assert.equal(service.state().hearts, before.hearts); assert.equal(service.state().nextAt, before.nextAt);
  assert.equal(service.state().profile.recipient, 'other@163.com'); assert.equal('auth' in service.state().profile, false);
  await assert.rejects(service.configure({sender:'987654@qq.com',recipient:'other@163.com',auth:'abcdefghijklmnop'}), /原发件邮箱/);
});
test('corrupt ledger is not silently overwritten', async () => {
  const f = fixture(); f.files.set('ledger', '{broken'); await assert.rejects(f.service().initialize()); assert.equal(f.files.get('ledger'), '{broken');
});
