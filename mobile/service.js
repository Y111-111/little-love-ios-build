export const WAIT = 600000;
const ITEMS = {
  miss: ['想你了', '💭', '今天的思念，已经装不下啦。想你了！'],
  kiss: ['想亲亲', '💋', '一份甜甜的亲亲，正在向你靠近。'],
  hug: ['想抱抱', '🧸', '想钻进你的怀里，申请一个长长的拥抱。'],
  date: ['想见你', '🌷', '想和你见面，散步、吃饭，什么都好。'],
  care: ['记得休息', '☕', '忙碌的时候，也要记得喝水和休息。我在惦记你。'],
  love: ['喜欢你', '💗', '今天也很喜欢你，比昨天还多一点。']
};
const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function validRecipient(value) {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@'); if (parts.length !== 2) return false;
  const [local, domain] = parts, labels = domain.split('.');
  return Boolean(local && local.length <= 64 && /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && labels.length >= 2 && labels.every(l => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l)) && /^[A-Za-z]{2,63}$/.test(labels.at(-1)));
}
export function mailContent(profile, order) {
  if (!Object.prototype.hasOwnProperty.call(ITEMS, order.item)) throw new Error('请选择一份心意。');
  const [title, emoji, text] = ITEMS[order.item], name = clean(profile.name, 30) || '你的恋人', note = clean(order.note, 1000);
  return { subject: `${name}送来一份「${title}」`, body: `${emoji} ${title}\n\n${text}${note ? `\n\n想对你说：\n${note}` : ''}\n\n来自 ${name}\n小小心意 · 每一份喜欢都算数` };
}

// The native bridge never returns the stored authorization code to the webpage.
export function createMailService(native, now = Date.now) {
  let ledger, profile, busy = false, blocked = false;
  const save = async next => { await native.write({ key: 'ledger', value: JSON.stringify(next) }); ledger = next; };
  async function initialize() {
    profile = await native.profile();
    const { value } = await native.read({ key: 'ledger' });
    ledger = value ? JSON.parse(value) : { hearts: 0, lastOrder: 0, history: [], pending: null };
    if (!Number.isSafeInteger(ledger.hearts) || ledger.hearts < 0 || !Number.isFinite(ledger.lastOrder) || !Array.isArray(ledger.history) || (ledger.pending && !Number.isFinite(ledger.pending.at))) throw new Error('心心记录无法读取，请保留应用数据并恢复备份。');
  }
  function state() {
    return { ...ledger, busy: busy || blocked, ready: profile.ready, canConfigure: !busy && !blocked,
      profile: { name: profile.name, sender: profile.sender, recipient: profile.recipient },
      nextAt: Math.max(ledger.lastOrder, ledger.pending?.at || 0) + (ledger.lastOrder || ledger.pending ? WAIT : 0),
      warning: ledger.pending ? '上一封邮件的结果未确认，请先检查收件箱，避免重复寄出。' : '' };
  }
  async function configure(value) {
    if (busy || blocked) throw new Error('正在处理上一份心意，请稍后修改。');
    const sender = clean(value.sender, 254).toLowerCase(), recipient = clean(value.recipient, 254), auth = clean(value.auth, 64);
    if (!/^[1-9][0-9]{4,19}@qq\.com$/.test(sender)) throw new Error('发件人请填写数字 QQ 邮箱。');
    if (!validRecipient(recipient) || sender === recipient.toLowerCase()) throw new Error('请填写有效且不同于发件人的收件邮箱。');
    if (ledger.sender && ledger.sender !== sender) throw new Error('已有心心记录，请继续使用原发件邮箱；可以修改收件人。');
    if ((!profile.ready || profile.sender !== sender || auth) && !/^[A-Za-z]{16}$/.test(auth)) throw new Error('请填写 16 位字母授权码，不是 QQ 登录密码。');
    busy = true;
    try { await native.configure({ name: clean(value.name, 30), sender, recipient, auth }); profile = await native.profile(); return { ok: true }; }
    finally { busy = false; }
  }
  async function order(value) {
    if (busy || blocked) throw new Error('有一份心意正在处理，请稍等。');
    if (!profile.ready) throw new Error('请先配置 QQ 邮箱。');
    if (state().nextAt > now()) throw new Error('成功发送满 10 分钟后，再送一份心意吧。');
    const content = mailContent(profile, value);
    busy = true;
    try {
      // Durable intent is written BEFORE contacting QQ. A killed app cannot silently retry.
      await save({ ...ledger, pending: { at: now(), item: value.item } });
      try { await native.send(content); }
      catch (error) {
        if (error.code === 'REQUEST_FAILED') {
          try { await save({ ...ledger, pending: null }); } catch { blocked = true; }
        }
        throw error;
      }
      const at = now();
      const next = { ...ledger, sender: profile.sender, hearts: ledger.hearts + 1, lastOrder: at, pending: null, history: [{ item: value.item, at }, ...ledger.history].slice(0, 100) };
      try { await save(next); }
      catch { blocked = true; return { ok: true, warning: '邮件已交给 QQ 邮箱，但心心记录保存失败。请勿重复发送；先检查手机空间。' }; }
      return { ok: true };
    } finally { busy = false; }
  }
  return { initialize, state, configure, order };
}
