import tls from 'node:tls';
import { randomUUID } from 'node:crypto';

export const WAIT = 10 * 60 * 1000;
export const ITEMS = {
  miss: { title: '想你了', emoji: '💭', text: '今天的思念，已经装不下啦。想你了！' },
  kiss: { title: '想亲亲', emoji: '💋', text: '一份甜甜的亲亲，正在向你靠近。' },
  hug: { title: '想抱抱', emoji: '🧸', text: '想钻进你的怀里，申请一个长长的拥抱。' },
  date: { title: '想见你', emoji: '🌷', text: '想和你见面，散步、吃饭，什么都好。' },
  care: { title: '记得休息', emoji: '☕', text: '忙碌的时候，也要记得喝水和休息。我在惦记你。' },
  love: { title: '喜欢你', emoji: '💗', text: '今天也很喜欢你，比昨天还多一点。' }
};
export function qqAddress(value) { return typeof value === 'string' && /^[1-9][0-9]{4,19}@qq\.com$/i.test(value); }
export function recipientAddress(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) && /^[A-Za-z]{2,63}$/.test(labels.at(-1));
}
export function cleanText(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
export function mailContent(config, order) {
  const item = ITEMS[order.item];
  if (!item) throw new Error('请选择一份心意。');
  const name = cleanText(config.name, 30) || '你的恋人';
  const note = cleanText(order.note, 1000);
  return { subject: `${name}送来一份「${item.title}」`, body: `${item.emoji} ${item.title}\n\n${item.text}${note ? `\n\n想对你说：\n${note}` : ''}\n\n来自 ${name}\n小小心意 · 每一份喜欢都算数` };
}
export function mimeMessage(from, to, subject, body) {
  const encode = s => Buffer.from(s, 'utf8').toString('base64');
  return [ `From: <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${encode(subject)}?=`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${randomUUID()}@qq.com>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', '', encode(body).match(/.{1,76}/g).join('\r\n') ].join('\r\n');
}

// Explicit TLS, fixed QQ host and port; no user-controlled mail relay.
export async function sendQQ(config, content, connect = options => tls.connect(options)) {
  const socket = connect({ host: 'smtp.qq.com', port: 465, servername: 'smtp.qq.com', rejectUnauthorized: true });
  socket.setTimeout(20000);
  let buffer = '', lines = [], queue = [], waiter, terminal;
  const fail = () => {
    terminal = new Error('无法连接 QQ 邮箱，请检查网络、SMTP 服务和授权码。');
    if (waiter) { waiter.reject(terminal); waiter = null; }
  };
  socket.on('error', fail);
  socket.on('timeout', () => { fail(); socket.destroy(); });
  socket.on('close', () => { if (!terminal) fail(); });
  socket.on('data', chunk => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 2); lines.push(line);
      if (/^\d{3} /.test(line)) {
        const result = { code: Number(line.slice(0, 3)), lines }; lines = [];
        if (waiter) { const pending = waiter; waiter = null; pending.resolve(result); } else queue.push(result);
      }
    }
  });
  const read = () => queue.length ? Promise.resolve(queue.shift()) : terminal ? Promise.reject(terminal) : new Promise((resolve, reject) => { waiter = { resolve, reject }; });
  const expect = async (codes) => {
    const result = await read();
    if (!codes.includes(result.code)) {
      if ([530, 534, 535].includes(result.code)) throw new Error('QQ 邮箱授权失败，请检查授权码，并确认已开启 SMTP 服务。');
      throw new Error('QQ 邮箱暂未接受这封邮件，请稍后重试或检查邮箱发送限制。');
    }
  };
  const command = async (line, codes) => { socket.write(line + '\r\n'); await expect(codes); };
  try {
    await expect([220]); await command('EHLO localhost', [250]);
    await command('AUTH LOGIN', [334]);
    await command(Buffer.from(config.sender).toString('base64'), [334]);
    await command(Buffer.from(config.auth).toString('base64'), [235]);
    await command(`MAIL FROM:<${config.sender}>`, [250]);
    await command(`RCPT TO:<${config.recipient}>`, [250, 251]);
    await command('DATA', [354]);
    socket.write(mimeMessage(config.sender, config.recipient, content.subject, content.body) + '\r\n.\r\n');
    await expect([250]); // QQ accepted responsibility; this does not certify delivery/read.
    socket.end('QUIT\r\n');
  } finally { socket.destroy(); }
}
