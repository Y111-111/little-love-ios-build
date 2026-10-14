(async () => {
const $ = selector => document.querySelector(selector);
const mobile = window.LoveMobile;
const items = [
  { id: 'miss', title: '想你了', emoji: '💭', description: '把今天的思念，打包给你。', color: '#e9e4db' },
  { id: 'kiss', title: '想亲亲', emoji: '💋', description: '一份甜甜的亲亲，请查收。', color: '#f0dcd7' },
  { id: 'hug', title: '想抱抱', emoji: '🧸', description: '申请一个长长的拥抱。', color: '#eae0cf' },
  { id: 'date', title: '想见你', emoji: '🌷', description: '和你见面，就是我的小确幸。', color: '#e4e8da' },
  { id: 'care', title: '记得休息', emoji: '☕', description: '忙碌的时候，也有人惦记你。', color: '#e8ddd2' },
  { id: 'love', title: '喜欢你', emoji: '💗', description: '今天也比昨天多喜欢你一点。', color: '#eddde1' }
];
let accessKey = new URLSearchParams(location.hash.slice(1)).get('key') || sessionStorage.getItem('love-key') || '';
if (accessKey) { sessionStorage.setItem('love-key', accessKey); history.replaceState(null, '', location.pathname); }
let remote = null, selected = null, sending = false, toastTimer;
let data = { version: 2, memories: [], dates: [], periods: [], tasks: [], notes: [] };
try {
  if (mobile) await mobile.initialize();
  const stored = JSON.parse((mobile ? await mobile.readRecords() : localStorage.getItem('little-love-data')) || 'null');
  if (stored) data = validateBackup(stored);
} catch { toast('本地记录无法读取，已停止操作以保护数据。请保留应用数据并联系协助。'); document.querySelectorAll('button,input,textarea,select').forEach(el => el.disabled = true); return; }
function toast(message) { const node = $('#toast'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 6500); }
let savingRecords = false;
async function persist(next) {
  if (savingRecords) { toast('正在保存上一条记录，请稍后再试。'); return false; }
  savingRecords = true;
  try { if (mobile) await mobile.writeRecords(JSON.stringify(next)); else localStorage.setItem('little-love-data', JSON.stringify(next)); data = next; return true; }
  catch { toast('记录未能保存，请检查设备剩余空间并导出备份。'); return false; }
  finally { savingRecords = false; }
}
function escapeHTML(text) { return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function localToday() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function validDate(value) { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const d = new Date(value + 'T12:00:00'); return !Number.isNaN(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === value; }
function validateBackup(value) {
  if (!value || ![1,2].includes(value.version) || !Array.isArray(value.memories) || !Array.isArray(value.dates) || value.memories.length > 1000 || value.dates.length > 1000) throw new Error('备份格式不正确。');
  const memories = value.memories.map(m => {
    if (!m || typeof m.title !== 'string' || !m.title.trim() || m.title.length > 80 || typeof m.text !== 'string' || m.text.length > 3000 || !validDate(m.date)) throw new Error('回忆记录格式不正确。');
    if (m.photo && (typeof m.photo !== 'string' || m.photo.length > 22*1024*1024 || !(/^(?:data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+|\/api\/photos\/[a-f0-9-]{36}\.(?:jpg|png|webp))$/.test(m.photo)))) throw new Error('照片格式不正确。');
    return { id: newId(), title: m.title, text: m.text, date: m.date, photo: m.photo || '' };
  });
  const dates = value.dates.map(d => {
    if (!d || typeof d.title !== 'string' || !d.title.trim() || d.title.length > 80 || !validDate(d.date) || typeof d.yearly !== 'boolean') throw new Error('纪念日格式不正确。');
    return { id: newId(), title: d.title, date: d.date, yearly: d.yearly };
  });
  const collections = {};
  for (const type of ['periods','tasks','notes']) {
    const records = value[type] || [];
    if (!Array.isArray(records) || records.length > 1000) throw new Error('生活记录格式不正确。');
    collections[type] = records.map(r => {
      if (!r || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 80 || typeof r.text !== 'string' || r.text.length > 3000) throw new Error('生活记录内容格式不正确。');
      if (type !== 'notes' && ((r.start && !validDate(r.start)) || (type === 'periods' && (!r.start || (r.end && (!validDate(r.end) || r.end < r.start)))))) throw new Error('生活记录日期不正确。');
      if (type === 'notes' && !['喜欢','不喜欢','生理期偏好','饮食','日常习惯','其他'].includes(r.category)) throw new Error('偏好分类不正确。');
      return { id:newId(), title:r.title, text:r.text, start:r.start || '', end:type === 'periods' ? r.end || '' : '', category:type === 'notes' ? r.category : '', done:type === 'tasks' ? Boolean(r.done) : false };
    });
  }
  return { version: 2, memories, dates, ...collections };
}
// randomUUID is unavailable on some plain HTTP phone browsers; local IDs need no cryptographic property.
function newId() { return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
async function api(path, value) {
  if (mobile) return mobile.api(path, value);
  const response = await fetch(path, { method: value ? 'POST' : 'GET', headers: { 'X-Love-Key': accessKey, ...(value ? { 'Content-Type': 'application/json' } : {}) }, ...(value ? { body: JSON.stringify(value) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '请求失败。'); return result;
}
function page(name) {
  document.querySelectorAll('.page').forEach(p => { p.hidden = p.id !== `page-${name}`; });
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  document.querySelectorAll('.nav-item').forEach(b => b.setAttribute('aria-current', b.dataset.page === name ? 'page' : 'false'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => page(b.dataset.page)));
$('.brand').addEventListener('click', event => { event.preventDefault(); page('shop'); });
$('#today').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
$('#menu-grid').innerHTML = items.map((item, i) => `<article class="menu-card"><div class="menu-art"><small class="item-num">NO. ${String(i+1).padStart(2,'0')}</small><span aria-hidden="true">${item.emoji}</span></div><div class="menu-info"><h3>${item.title}</h3><p>${item.description}</p><div class="menu-bottom"><small>♡ ＋1 颗心心</small><button data-order="${item.id}">送给 TA ↗</button></div></div></article>`).join('');
document.querySelectorAll('.menu-art').forEach((art, i) => art.style.setProperty('--tile', items[i].color));
$('#hero-order').addEventListener('click', () => $('#menu').scrollIntoView({ behavior: 'smooth' }));
function countdown() {
  const remaining = Math.max(0, (remote?.nextAt || 0) - Date.now());
  $('#countdown').textContent = remote ? remaining ? `${String(Math.floor(remaining/3600000)).padStart(2,'0')}:${String(Math.floor(remaining/60000)%60).padStart(2,'0')}:${String(Math.floor(remaining/1000)%60).padStart(2,'0')} 后可送出` : '随时可以送出' : '等待发信助手连接';
}
function renderRemote() {
  $('#connection').textContent = remote?.ready ? '小店营业中 · QQ 邮箱已配置' : '请先配置 QQ 邮箱';
  $('#connection').classList.toggle('ready', Boolean(remote?.ready));
  $('#hearts').textContent = remote?.hearts || 0;
  $('#recipient-label').textContent = remote?.profile.recipient || '还没设置收件人';
  const form = $('#settings-form');
  for (const name of ['name', 'sender', 'recipient']) form.elements[name].value = remote?.profile[name] || '';
  const editable = remote?.canConfigure;
  form.elements.auth.required = !remote?.ready;
  form.elements.auth.placeholder = remote?.ready ? '留空沿用当前授权码；修改时填写新码' : '16 位字母，不是 QQ 密码';
  [...form.elements].forEach(el => { el.disabled = !editable; });
  $('#config-help').textContent = mobile ? '授权码由手机系统安全保管，关闭或重启后可继续使用。授权码留空可沿用已保存的授权码。' : editable ? '设置由电脑的 Windows 账号加密保存，重启后自动使用。授权码留空可沿用已保存的授权码。' : '首次请在电脑上配置一次，设置由电脑加密保存；手机网页无需重复输入，发信仍需电脑开机。';
  if (remote?.warning) $('#connection').textContent = remote.warning;
  $('#order-history').innerHTML = remote?.history.length ? remote.history.slice(0,5).map(h => {
    const item = items.find(i => i.id === h.item); if (!item) return '';
    return `<div class="history-row"><span>${item.emoji}</span><strong>${item.title}</strong><span>＋1 ♡</span><time>${new Date(h.at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>`;
  }).join('') : '还没有寄出的心意。第一封，就从今天开始吧。';
  countdown();
}
async function refresh(silent = false) {
  try { remote = await api('/api/state'); renderRemote(); }
  catch (e) { remote = null; $('#connection').textContent = '发信助手未连接'; $('#connection').classList.remove('ready'); countdown(); if (!silent) toast(e.message); }
}
$('#menu-grid').addEventListener('click', async event => {
  const button = event.target.closest('[data-order]'); if (!button || sending) return;
  await refresh(); if (!remote) return;
  if (!remote.ready) { page('settings'); toast('先配置邮箱，就可以开始寄心意啦。'); return; }
  if (remote.busy) return toast('有一份心意正在发送，请稍等。');
  if (remote.nextAt > Date.now()) return toast('上一份喜欢还在回味，成功发送满 10 分钟后再送一份吧。');
  selected = items.find(i => i.id === button.dataset.order);
  $('#order-emoji').textContent = selected.emoji; $('#order-title').textContent = selected.title; $('#order-description').textContent = selected.description;
  $('#order-form').reset(); $('#order-dialog').showModal();
});
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => { if (sending && button.closest('dialog').id === 'order-dialog') return; button.closest('dialog').close(); }));
$('#order-dialog').addEventListener('cancel', e => { if (sending) e.preventDefault(); });
$('#order-form').addEventListener('submit', async event => {
  event.preventDefault(); if (sending || !selected) return;
  sending = true; $('#send-button').disabled = true; $('#send-button').textContent = '正在寄出，请稍等…';
  try {
    const result = await api('/api/order', { item: selected.id, note: $('#order-form').elements.note.value });
    $('#order-dialog').close(); toast(result.warning || '心意已交给 QQ 邮箱发送，＋1 颗心心！'); await refresh(true);
  } catch (e) { toast(e.message); }
  finally { sending = false; $('#send-button').disabled = false; $('#send-button').textContent = '把心意寄出去 ↗'; }
});
$('#settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]'); button.disabled = true;
  try { await api('/api/config', Object.fromEntries(new FormData(form))); form.elements.auth.value = ''; await refresh(); toast('邮箱设置已加密保存，重启后也可以直接使用。'); }
  catch (e) { toast(e.message); } finally { button.disabled = false; }
});
const empty = (symbol, title, text) => `<div class="empty-state"><span>${symbol}</span><h3>${title}</h3><p>${text}</p></div>`;
function renderMemories() {
  $('#memory-list').innerHTML = data.memories.length ? [...data.memories].sort((a,b) => b.date.localeCompare(a.date)).map(m => `<article class="memory-card"><button class="memory-open" data-view-memory="${m.id}">${m.photo ? `<img src="${photoURL(m.photo)}" alt="${escapeHTML(m.title)}" loading="lazy">` : ''}<span class="card-date">${escapeHTML(m.date)}</span><h3>${escapeHTML(m.title)}</h3><p class="memory-text memory-preview-text">${escapeHTML(m.text)}</p></button><div class="card-actions"><button class="text-button" data-view-memory="${m.id}">查看回忆 ↗</button><button class="text-button" data-edit-memory="${m.id}">编辑</button><button class="text-button" data-delete-memory="${m.id}">删除</button></div></article>`).join('') : empty('▧','我们的故事，等你落笔','记下第一次约会，或今天一起吃的那顿饭。');
}
function photoURL(photo) { return mobile ? mobile.photoURL(photo) : photo.startsWith('/api/photos/') ? `${photo}?key=${encodeURIComponent(accessKey)}` : photo; }
let editingMemory = null, viewingMemory = null, removePhoto = false;
function openMemoryEditor(id = null) {
  photoSelection++; editingMemory = id; removePhoto = false;
  const memory = data.memories.find(m => m.id === id), form = $('#memory-form'); form.reset();
  form.querySelector('h2').textContent = memory ? '编辑这份回忆' : '记一件我们的小事';
  form.elements.title.value = memory?.title || ''; form.elements.date.value = memory?.date || localToday(); form.elements.text.value = memory?.text || '';
  $('#photo-preview').hidden = !memory?.photo; if (memory?.photo) $('#photo-preview').src = photoURL(memory.photo); else $('#photo-preview').removeAttribute('src');
  $('#remove-photo').hidden = !memory?.photo;
  $('#photo-status').textContent = memory?.photo ? '不选择新照片会保留原来的照片。' : mobile ? '保留照片宽高尺寸，适当降低画质，保存到这台手机。' : '保留照片宽高尺寸，适当降低画质，保存到电脑文件夹。';
  $('#memory-dialog').showModal();
}
function viewMemory(id) {
  const memory = data.memories.find(m => m.id === id); if (!memory) return;
  viewingMemory = id; $('#memory-view-title').textContent = memory.title; $('#memory-view-date').textContent = memory.date; $('#memory-view-text').textContent = memory.text;
  $('#memory-view-photo').hidden = !memory.photo; $('#download-photo').hidden = !memory.photo;
  if (memory.photo) $('#memory-view-photo').src = photoURL(memory.photo); else $('#memory-view-photo').removeAttribute('src');
  $('#memory-view').showModal();
}
$('#edit-memory').addEventListener('click',()=>{ $('#memory-view').close(); openMemoryEditor(viewingMemory); });
$('#download-photo').addEventListener('click',async()=>{
  const memory = data.memories.find(m => m.id === viewingMemory); if (!memory?.photo) return;
  if (mobile) { try { await mobile.sharePhoto(memory.photo); } catch { toast('照片未能保存，请重试并选择保存位置。'); } return; }
  try { const response = await fetch(photoURL(memory.photo)); if (!response.ok) throw new Error('照片读取失败。请确认电脑发信助手在运行。'); const url=URL.createObjectURL(await response.blob()); const anchor=document.createElement('a'); anchor.href=url; anchor.download='回忆照片.'+(memory.photo.includes('image/png')||memory.photo.endsWith('.png')?'png':memory.photo.includes('image/webp')||memory.photo.endsWith('.webp')?'webp':'jpg'); anchor.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); } catch(error){toast(error.message);}
});
function dayInfo(d) {
  const [year, month, day] = d.date.split('-').map(Number), now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let target = new Date(year, month - 1, day);
  if (d.yearly && target <= today) {
    // Celebrate a February 29 anniversary on February 28 in a non-leap year.
    const annual = y => new Date(y, month - 1, Math.min(day, new Date(y, month, 0).getDate()));
    target = annual(now.getFullYear()); if (target < today) target = annual(now.getFullYear()+1);
  }
  const utcDay = date => Date.UTC(date.getFullYear(),date.getMonth(),date.getDate());
  const delta = Math.round((utcDay(target) - utcDay(today))/86400000);
  return { days: Math.abs(delta), label: delta === 0 ? '就是今天，一起庆祝吧' : delta > 0 ? '距离这一天，还有' : '这一天已经过去', suffix: delta === 0 ? '' : '天', delta };
}
function renderDates() {
  $('#date-list').innerHTML = data.dates.length ? data.dates.map(d => {
    const info = dayInfo(d); return `<article class="date-card"><span class="card-date">${escapeHTML(d.date)} · ${d.yearly ? '每年庆祝' : '一次性的纪念'}</span><h3>${escapeHTML(d.title)}</h3><p>${info.label}</p><div class="date-count">${info.delta === 0 ? '♥' : info.days}<small>${info.suffix}</small></div><div class="card-actions"><button class="text-button" data-delete-date="${d.id}">删除纪念日</button></div></article>`;
  }).join('') : empty('◷','有些日子，值得一直记得','添加在一起的日子、生日，或下一次约会。');
  renderCare();
}
let editingCare = null, careType = null;
function renderPeriodAnalysis() {
  const analysis=PeriodAnalysis.analyze(data.periods,localToday()), content=$('#period-analysis-content');
  if(!analysis.total){content.innerHTML=empty('♡','还没有可以分析的记录','先添加开始日期，结束后再补上结束日期。');return;}
  const duration=analysis.durationStats,interval=analysis.intervalStats;
  const metric=(title,value,detail)=>`<div class="analysis-metric"><small>${title}</small><strong>${value}</strong><p>${detail}</p></div>`;
  let html=`<div class="analysis-metrics">${metric('记录总数',analysis.total+'<em>次</em>',analysis.rows.length+' 条已开始的有效日期记录')}${metric('平均持续天数',duration?duration.average+'<em>天</em>':'—',duration?'依据 '+duration.count+' 条已结束且无重复的记录':'还没有可计入的完整记录')}${metric('平均开始日期间隔',interval?interval.average+'<em>天</em>':'—',interval?'依据 '+interval.count+' 组已记录的间隔':'需要至少两次不同的开始日期')}${metric('间隔范围',interval?interval.min+'–'+interval.max+'<em>天</em>':'—',interval?'最长与最短相差 '+(interval.max-interval.min)+' 天':'记录更多日期后可查看')}</div>`;
  const observations=[];
  if(analysis.latest)observations.push(`最近一次开始日期为 ${analysis.latest.start}。${analysis.latest.duration!==null?'该条记录持续 '+analysis.latest.duration+' 天。':analysis.latest.elapsed!==null?'未填写结束日期，截至今天共 '+analysis.latest.elapsed+' 天；不计入平均持续天数。':'结束日期尚未到，不计入平均持续天数。'}`);
  if(duration)observations.push(`已结束记录的持续天数为 ${duration.min}–${duration.max} 天，中位数 ${duration.median} 天。中位数是把天数排序后位于中间的值。`);
  if(analysis.intervals.length>=2){const latest=analysis.intervals.at(-1).days,previous=analysis.intervals.at(-2).days,difference=latest-previous;observations.push(`最近的开始日期间隔为 ${latest} 天，${difference===0?'与前一组相同':difference>0?'比前一组多 '+difference+' 天':'比前一组少 '+Math.abs(difference)+' 天'}。`);}else observations.push('目前可比较的间隔不足两组，暂不描述变化趋势。');
  html+=`<div class="analysis-notes"><h3>记录情况</h3>${observations.map(text=>`<p>${escapeHTML(text)}</p>`).join('')}</div>`;
  if(analysis.warnings.length)html+=`<div class="analysis-warnings"><h3>需要核对的记录</h3>${analysis.warnings.map(text=>`<p>${escapeHTML(text)}</p>`).join('')}</div>`;
  function bars(title,records){if(!records.length)return '';const recent=records.slice(-6),max=Math.max(...recent.map(r=>r.days));return `<div class="analysis-chart"><h3>${title}<small>最近 ${recent.length} 条</small></h3>${recent.map(r=>`<div class="analysis-bar-row"><span>${escapeHTML(r.start||r.to)}</span><div class="analysis-bar-track"><div class="analysis-bar" data-percent="${Math.max(3,r.days/max*100)}"></div></div><strong>${r.days} 天</strong></div>`).join('')}</div>`;}
  html+=bars('持续天数',analysis.durations)+bars('开始日期间隔',analysis.intervals);
  html+=`<div class="analysis-detail"><h3>逐条明细</h3>${analysis.rows.length?`<div class="analysis-table-wrap"><table><thead><tr><th>开始</th><th>结束</th><th>持续</th><th>与上次开始的间隔</th></tr></thead><tbody>${[...analysis.rows].reverse().map(r=>`<tr><td>${r.start}</td><td>${r.end||'未填写'}</td><td>${r.duplicate?'日期重复':r.duration!==null?r.duration+' 天':r.elapsed!==null?'未结束':'结束日未到'}</td><td>${r.duplicate?'日期重复':r.overlap?'日期重叠':r.interval===null?'—':r.interval+' 天'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="subtle">当前没有已开始且日期有效的记录。</p>'}</div>`;
  content.innerHTML=html;
  content.querySelectorAll('[data-percent]').forEach(bar=>{bar.style.width=bar.dataset.percent+'%';});
}
$('#analyze-periods').addEventListener('click',()=>{renderPeriodAnalysis();$('#period-analysis-dialog').showModal();});
function renderCare() {
  const today=localToday(), pending=data.tasks.filter(t=>!t.done), due=pending.filter(t=>t.start&&t.start<=today), ongoing=data.periods.filter(p=>!p.end&&p.start<=today);
  $('#care-summary').innerHTML=`<span>${ongoing.length?'有 '+ongoing.length+' 条未结束的生理期记录':'用心记住她的每一天'}</span><span>${due.length?'今天及已到期：'+due.length+' 件待办':'今天暂无到期待办'}</span><span>还有 ${pending.length} 件想为她做的事</span>`;
  for(const [type,selector] of [['periods','#period-list'],['tasks','#task-list'],['notes','#note-list']]){
    const records=[...data[type]];
    if(type==='periods')records.sort((a,b)=>b.start.localeCompare(a.start));
    if(type==='tasks')records.sort((a,b)=>Number(a.done)-Number(b.done)||(a.start||'9999').localeCompare(b.start||'9999'));
    $(selector).innerHTML=records.length?records.map(r=>{
      const tag=type==='periods'?(r.end?'已结束':r.start>today?'尚未开始':'未记录结束'):type==='notes'?r.category:r.done?'已完成':r.start&&r.start<today?'已到期':r.start===today?'今天要做':'待办';
      return `<article class="care-card ${type==='tasks'&&r.done?'done':''} ${type==='tasks'&&!r.done&&r.start&&r.start<today?'overdue':''}"><span class="care-tag">${escapeHTML(tag)}</span><div class="task-top">${type==='tasks'?`<input type="checkbox" data-complete-task="${r.id}" aria-label="标记 ${escapeHTML(r.title)} 为完成" ${r.done?'checked':''}>`:''}<h3>${escapeHTML(r.title)}</h3></div>${type==='notes'?'':`<span class="card-date">${type==='periods'?escapeHTML(r.start)+' ～ '+(r.end?escapeHTML(r.end):'尚未填写结束日期'):r.start?'提醒日期：'+escapeHTML(r.start):'没有固定日期'}</span>`}<p class="care-text">${escapeHTML(r.text)}</p><div class="card-actions"><button class="text-button" data-edit-care="${r.id}" data-care-type="${type}">编辑</button><button class="text-button" data-delete-care="${r.id}" data-care-type="${type}">删除</button></div></article>`;
    }).join(''):empty(type==='periods'?'♡':type==='tasks'?'✓':'✿',type==='periods'?'这几天，多一点关心':type==='tasks'?'把想为她做的事记下来':'慢慢了解她的小习惯',type==='periods'?'记下开始和结束日期，还有她希望得到的照顾。':type==='tasks'?'例如买喜欢的零食，或下班后接她回家。':'喜欢的食物、讨厌的味道、生活习惯，都可以记录。');
  }
}
function openCare(type,id=null){
  careType=type;editingCare=id;const r=data[type].find(r=>r.id===id),form=$('#care-form');form.reset();
  $('#care-form-title').textContent=(id?'编辑':'添加')+({periods:'生理期记录',tasks:'一件待办',notes:'宝宝的小习惯'}[type]);
  form.elements.title.value=r?.title||(type==='periods'?'宝宝的生理期':'');form.elements.text.value=r?.text||'';form.elements.start.value=r?.start||(type==='periods'?localToday():'');form.elements.end.value=r?.end||'';form.elements.category.value=r?.category||'喜欢';
  form.elements.title.required=true;form.elements.start.required=type==='periods';
  $('#care-category-label').hidden=type!=='notes';$('#care-start-label').hidden=type==='notes';$('#care-end-label').hidden=type!=='periods';
  $('#care-start-label').firstChild.textContent=type==='periods'?'开始日期':'提醒日期（选填）';
  $('#care-hint').textContent=type==='periods'?'只记录实际日期，不预测下次生理期。结束日期可稍后编辑补上。':type==='tasks'?'到了这一天，在页面里提示；可以勾选完成。关闭网页后暂不发送通知。':'内容可以自由填写，例如喜欢的零食、讨厌的味道，以及相处时要记住的事。';
  $('#care-dialog').showModal();
}
document.querySelectorAll('[data-add-care]').forEach(b=>b.addEventListener('click',()=>openCare(b.dataset.addCare)));
$('#care-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget,title=form.elements.title.value.trim(),start=form.elements.start.value,end=form.elements.end.value;
  if(!title)return toast('请填写记录标题。');
  if(careType==='periods'&&(!validDate(start)||(end&&(!validDate(end)||end<start))))return toast('请填写有效开始日期，结束日期不能早于开始日期。');
  if(careType==='tasks'&&start&&!validDate(start))return toast('请填写有效的提醒日期。');
  const previous=data[careType].find(r=>r.id===editingCare);
  const record={id:editingCare||newId(),title,text:form.elements.text.value.trim(),start:careType==='notes'?'':start,end:careType==='periods'?end:'',category:careType==='notes'?form.elements.category.value:'',done:previous?.done||false};
  const records=editingCare?data[careType].map(r=>r.id===editingCare?record:r):[record,...data[careType]];
  if(await persist({...data,[careType]:records})){$('#care-dialog').close();renderCare();toast('已经记好啦。');}
});
$('#page-dates').addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit-care]'),remove=e.target.closest('[data-delete-care]');
  if(edit)return openCare(edit.dataset.careType,edit.dataset.editCare);
  if(remove&&confirm('确定删除这条生活记录？')){const type=remove.dataset.careType;if(await persist({...data,[type]:data[type].filter(r=>r.id!==remove.dataset.deleteCare)}))renderCare();}
});
$('#task-list').addEventListener('change',async e=>{const id=e.target.dataset.completeTask;if(!id)return;const tasks=data.tasks.map(r=>r.id===id?{...r,done:e.target.checked}:r);await persist({...data,tasks});renderCare();});
$('#add-memory').addEventListener('click', () => openMemoryEditor());
$('#add-date').addEventListener('click', () => { $('#date-form').reset(); $('#date-form').elements.date.value = localToday(); $('#date-dialog').showModal(); });
async function photoData(file) {
  if (!file || !file.size) return '';
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 15*1024*1024) throw new Error('请选择 15MB 以内的 JPG、PNG 或 WebP 照片。');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error('照片无法读取，请换用 JPG、PNG 或 WebP。苹果 HEIC 照片请先转换为 JPG。'); }
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    let result = canvas.toDataURL('image/jpeg',.65);
    if (result.length > 20*1024*1024) result = canvas.toDataURL('image/jpeg',.45);
    if (result.length > 20*1024*1024) throw new Error('这张照片文件过大，请选择 15MB 以内的照片。');
    return result;
  } finally { URL.revokeObjectURL(url); }
}
let photoSelection = 0;
$('#remove-photo').addEventListener('click',()=>{photoSelection++;removePhoto=true;$('#memory-form').elements.photo.value='';$('#photo-preview').hidden=true;$('#photo-preview').removeAttribute('src');$('#remove-photo').hidden=true;$('#photo-status').textContent='保存后会从这份回忆中移除照片。';});
$('#memory-form').elements.photo.addEventListener('change', async event => {
  const selection = ++photoSelection, file = event.target.files[0];
  $('#photo-preview').hidden = true; $('#photo-preview').removeAttribute('src');
  if (!file) { const memory=data.memories.find(m=>m.id===editingMemory); if(memory?.photo&&!removePhoto){$('#photo-preview').src=photoURL(memory.photo);$('#photo-preview').hidden=false;} $('#photo-status').textContent = '未选择新照片，原来的照片会保留。'; return; }
  $('#photo-status').textContent = '正在读取照片…';
  try {
    const result = await photoData(file); if (selection !== photoSelection) return;
    $('#photo-preview').src = result; $('#photo-preview').hidden = false;
    $('#photo-status').textContent = '照片已加载，可以收藏这份回忆。';
  } catch (error) { if (selection === photoSelection) { $('#photo-status').textContent = error.message; toast(error.message); event.target.value = ''; } }
});
$('#memory-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget, button = form.querySelector('[type=submit]'); button.disabled = true;
  try {
    if (!form.elements.title.value.trim() || !validDate(form.elements.date.value)) throw new Error('请填写回忆标题和有效日期。');
    const previous = data.memories.find(m=>m.id===editingMemory);
    let photo = removePhoto ? '' : previous?.photo || '';
    if(form.elements.photo.files[0]) photo = (await api('/api/photos',{photo:await photoData(form.elements.photo.files[0])})).photo;
    const memory = { id: editingMemory || newId(), title: form.elements.title.value.trim(), date: form.elements.date.value, text: form.elements.text.value.trim(), photo };
    const memories = editingMemory ? data.memories.map(m=>m.id===editingMemory?memory:m) : [memory,...data.memories];
    if (await persist({ ...data, memories })) { renderMemories(); $('#memory-dialog').close(); toast(editingMemory ? '回忆已经更新，原照片会按你的选择保留。' : '这份回忆，已经收藏好啦。'); }
  } catch (e) { toast(e.message || '照片读取失败，请换一张试试。'); } finally { button.disabled = false; }
});
$('#date-form').addEventListener('submit', async event => {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.elements.title.value.trim() || !validDate(form.elements.date.value)) return toast('请填写纪念日名称和有效日期。');
  const date = { id: newId(), title: form.elements.title.value.trim(), date: form.elements.date.value, yearly: form.elements.yearly.checked };
  if (await persist({ ...data, dates: [...data.dates,date] })) { renderDates(); $('#date-dialog').close(); toast('这个日子，我们记住了。'); }
});
$('#memory-list').addEventListener('click', async e => { const view=e.target.closest('[data-view-memory]'),edit=e.target.closest('[data-edit-memory]'); if(view)return viewMemory(view.dataset.viewMemory);if(edit)return openMemoryEditor(edit.dataset.editMemory);const button = e.target.closest('[data-delete-memory]'); if (button && confirm('确定删除这条回忆？删除后只能从已有备份恢复。') && await persist({ ...data, memories: data.memories.filter(m => m.id !== button.dataset.deleteMemory) })) renderMemories(); });
$('#date-list').addEventListener('click', async e => { const button = e.target.closest('[data-delete-date]'); if (button && confirm('确定删除这个纪念日？') && await persist({ ...data, dates: data.dates.filter(d => d.id !== button.dataset.deleteDate) })) renderDates(); });
function blobData(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('照片读取失败。'));reader.readAsDataURL(blob);});}
$('#export-data').addEventListener('click', async () => {
  const button=$('#export-data');button.disabled=true;
  try{
    const memories=[];
    for(const memory of data.memories){let photo=memory.photo;if(photo.startsWith('/api/photos/')){if(mobile)photo=await mobile.readPhoto(photo);else{const response=await fetch(photoURL(photo));if(!response.ok)throw new Error('照片读取失败，请确认电脑程序正在运行，再导出备份。');photo=await blobData(await response.blob());}}memories.push({...memory,photo});}
    if(mobile){await mobile.exportBackup(`小小心意备份-${localToday()}.json`,{...data,memories});toast('请在系统窗口选择保存位置，完成后可在那里找到备份。');return;}
    const backup={...data,memories};const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{ type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `小小心意备份-${localToday()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000); toast('备份已导出，包含照片和生活记录，请保存在安全的位置。');
  }catch(error){toast(error.message);}finally{button.disabled=false;}
});
$('#import-data').addEventListener('click', () => $('#backup-input').click());
$('#backup-input').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 256*1024*1024) throw new Error('备份文件过大，请选择 256MB 以内的文件。'); const next = validateBackup(JSON.parse(await file.text())); if (confirm('导入将替换当前设备的回忆、纪念日和生活记录，是否继续？')) { for(const memory of next.memories){if(memory.photo.startsWith('data:image/'))memory.photo=(await api('/api/photos',{photo:memory.photo})).photo;else if(mobile&&memory.photo.startsWith('/api/photos/'))await mobile.readPhoto(memory.photo);}if(await persist(next)) { renderMemories(); renderDates(); toast(mobile?'备份已恢复，照片已保存到这台手机。':'备份已恢复，照片已保存到电脑。'); } } }
  catch (e) { toast(e.message || '备份读取失败。'); } finally { event.target.value = ''; }
});
renderMemories(); renderDates(); refresh(); setInterval(countdown,1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { refresh(true); renderDates(); } });
window.addEventListener('love-resume', () => { refresh(true); renderDates(); });
window.addEventListener('love-back', () => {
  const dialog = document.querySelector('dialog[open]');
  if (dialog) { if (!(sending && dialog.id === 'order-dialog')) dialog.close(); return; }
  if ($('#page-shop').hidden) page('shop'); else if (!sending) mobile?.minimize();
});
if (window.visualViewport) {
  const resize = () => { const keyboard = window.innerHeight - visualViewport.height > 150; document.body.classList.toggle('keyboard-open', keyboard); document.documentElement.style.setProperty('--visible-height', `${visualViewport.height}px`); };
  visualViewport.addEventListener('resize', resize); resize();
}
})();
