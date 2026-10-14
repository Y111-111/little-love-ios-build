import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { WAIT, qqAddress, recipientAddress, mailContent, mimeMessage, sendQQ } from '../lib.mjs';
test('love orders wait ten minutes', () => assert.equal(WAIT, 600000));

test('only numeric QQ addresses enter SMTP commands', () => {
  assert.equal(qqAddress('123456@qq.com'), true);
  for (const value of ['alias@qq.com', '123456@qq.com\r\nRCPT TO:<attacker@qq.com>', '123456@example.com', null]) assert.equal(qqAddress(value), false);
});
test('recipients support university mail and reject SMTP injection', () => {
  for (const address of ['student@m.scnu.edu.cn', 'person@163.com', 'first.last+tag@example.com']) assert.equal(recipientAddress(address), true);
  for (const address of ['@m.scnu.edu.cn', 'x@', 'a@b', 'a..b@example.com', 'a@-bad.com', 'a@example.com\r\nRCPT TO:<evil@qq.com>', 'a@example.com,b@example.com']) assert.equal(recipientAddress(address), false);
});
test('Chinese content and newlines stay inside encoded MIME fields', () => {
  const content = mailContent({ name: '小熊\r\nBcc: bad' }, { item: 'hug', note: '想你了\n明天见' });
  const message = mimeMessage('123456@qq.com', '654321@qq.com', content.subject, content.body);
  assert.equal(message.split('\r\n').some(line => line.startsWith('Bcc:')), false);
  const encodedBody = message.split('\r\n\r\n')[1].replaceAll('\r\n','');
  assert.equal(Buffer.from(encodedBody, 'base64').toString(), content.body);
  assert.throws(() => mailContent({}, { item: 'invalid' }));
});
function fakeSMTP(rejectAuth = false) {
  const socket = new EventEmitter(); let step = 0; const written = [];
  socket.setTimeout = () => {}; socket.destroy = () => {}; socket.end = () => {};
  socket.write = input => {
    written.push(input);
    const responses = ['250-localhost\r\n250 AUTH LOGIN\r\n','334 username\r\n','334 password\r\n',rejectAuth ? '535 denied\r\n' : '235 ok\r\n','250 ok\r\n','250 ok\r\n','354 go\r\n','250 accepted\r\n'];
    const response = responses[step++];
    // Split replies across packets to exercise SMTP buffering.
    queueMicrotask(() => { socket.emit('data',Buffer.from(response.slice(0,4))); socket.emit('data',Buffer.from(response.slice(4))); });
  };
  const connect = options => {
    assert.equal(options.rejectUnauthorized,true); assert.equal(options.host,'smtp.qq.com');
    queueMicrotask(() => socket.emit('data',Buffer.from('220 ready\r\n'))); return socket;
  };
  return { connect, written };
}
test('SMTP sends through TLS and waits for server acceptance', async () => {
  const mock = fakeSMTP();
  await sendQQ({ sender:'123456@qq.com',recipient:'654321@qq.com',auth:'abcdefghijklmnop' },{ subject:'心意',body:'你好' },mock.connect);
  assert.equal(mock.written.length,8); assert.ok(mock.written[7].endsWith('\r\n.\r\n'));
});
test('rejected authorization does not proceed to mail sending', async () => {
  const mock = fakeSMTP(true);
  await assert.rejects(sendQQ({ sender:'123456@qq.com',recipient:'654321@qq.com',auth:'abcdefghijklmnop' },{ subject:'心意',body:'你好' },mock.connect), /授权失败/);
  assert.equal(mock.written.length,4);
});
