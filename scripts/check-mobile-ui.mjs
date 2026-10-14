import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { once } from 'node:events';

const server = createServer(async (req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  const file = route === '/' ? 'index.html' : route.slice(1);
  if (!['index.html','app.js','mobile.js','style.css','period-analysis.js','manifest.webmanifest','icon.svg'].includes(file)) { res.writeHead(404); res.end(); return; }
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.end(await readFile(`dist/${file}`));
  } catch { res.writeHead(500); res.end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  let executablePath; try { await access(edge); executablePath = edge; } catch {}
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  await mkdir('artifacts/screenshots', {recursive:true});
  const errors = [];
  for (const width of [320, 390, 430, 844]) {
    const context = await browser.newContext({ viewport: { width, height: width === 844 ? 390 : 844 }, isMobile:true, hasTouch:true, deviceScaleFactor:1 });
    await context.addInitScript(() => {
      const initial = {hearts:0,lastOrder:0,history:[],ready:true,canConfigure:true,nextAt:0,profile:{name:'小熊',sender:'123456@qq.com',recipient:'someone@163.com'}};
      window.mobileCalls = []; window.photos = {}; window.failRecordSave = false;
      window.LoveMobile = {
        initialize: async () => {},
        readRecords: async () => localStorage.getItem('mock-records'),
        writeRecords: async value => { if(window.failRecordSave) throw new Error('disk full'); localStorage.setItem('mock-records', value); },
        api: async (path, value) => {
          window.mobileCalls.push(path);
          if(path === '/api/state') return initial;
          if(path === '/api/config') { initial.profile = {...value}; delete initial.profile.auth; return {ok:true}; }
          if(path === '/api/order') { initial.hearts++; initial.history.unshift({item:value.item,at:Date.now()}); initial.nextAt=Date.now()+600000; return {ok:true}; }
          if(path === '/api/photos') { const id='/api/photos/11111111-1111-4111-8111-111111111111.jpg'; window.photos[id]=value.photo; return {photo:id}; }
          throw new Error('Unexpected route');
        },
        photoURL: photo => window.photos[photo] || photo,
        readPhoto: async photo => { if(!window.photos[photo]) throw new Error('missing photo'); return window.photos[photo]; },
        sharePhoto: async photo => { window.sharedPhoto=photo; },
        exportBackup: async (name, value) => {window.exported={name,value};},
        minimize: async () => {window.minimized=true;}
      };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url); await page.locator('#menu-grid .menu-card').first().waitFor();
    const checkOverflow = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${width}px ${name} must not scroll sideways`);
    };
    await checkOverflow('shop');
    if(width===390) await page.screenshot({path:'artifacts/screenshots/mobile-shop.png',fullPage:true,animations:'disabled'});
    await page.locator('[data-order="hug"]').click(); await page.locator('#order-form textarea').fill('今天也想抱抱你');
    await page.locator('#send-button').click(); await page.locator('#order-dialog').waitFor({state:'hidden'});
    assert.equal(await page.locator('#hearts').textContent(),'1');
    await page.locator('[data-page="memories"]').click(); await page.locator('#add-memory').click();
    await page.locator('#memory-form input[name="title"]').fill('手机里的第一份回忆');
    await page.locator('#memory-form textarea').fill('照片和文字都留在手机里。');
    await page.locator('#memory-form input[name="photo"]').setInputFiles({name:'tiny.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});
    await page.locator('#photo-status').filter({hasText:'照片已加载'}).waitFor();
    await page.locator('#memory-form [type="submit"]').click(); await page.locator('#memory-dialog').waitFor({state:'hidden'});
    await page.locator('.memory-open').click(); await page.locator('#download-photo').click();
    assert.ok(await page.evaluate(()=>window.sharedPhoto)); await page.evaluate(()=>window.dispatchEvent(new Event('love-back')));
    await page.locator('#memory-view').waitFor({state:'hidden'});
    await checkOverflow('memories');
    await page.locator('[data-page="dates"]').click(); await page.locator('[data-add-care="tasks"]').click();
    await page.locator('#care-form input[name="title"]').fill('给宝宝买喜欢的甜点');
    await page.locator('#care-form [type="submit"]').click(); await page.locator('#care-dialog').waitFor({state:'hidden'});
    await page.locator('#task-list input[type="checkbox"]').check();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('mock-records')).tasks[0].done);
    await page.locator('[data-add-care="periods"]').click();
    await page.locator('#care-form input[name="start"]').fill('2026-09-01'); await page.locator('#care-form input[name="end"]').fill('2026-09-05');
    await page.locator('#care-form [type="submit"]').click(); await page.locator('#care-dialog').waitFor({state:'hidden'});
    await page.locator('#analyze-periods').click(); await page.locator('#period-analysis-content').getByText('平均持续天数').waitFor();
    if(width===390) await page.screenshot({path:'artifacts/screenshots/mobile-analysis.png'});
    await page.evaluate(()=>window.dispatchEvent(new Event('love-back'))); await checkOverflow('dates');
    await page.locator('[data-page="settings"]').click(); await page.locator('#export-data').click();
    await page.waitForFunction(()=>window.exported); const exported=await page.evaluate(()=>window.exported);
    assert.ok(exported.value.memories[0].photo.startsWith('data:image/')); assert.equal(exported.value.tasks[0].done,true);
    assert.equal(JSON.stringify(exported).includes('auth'),false);
    if(width===390) await page.screenshot({path:'artifacts/screenshots/mobile-settings.png',fullPage:true});
    await checkOverflow('settings');
    // Exercise replacement import and storage failure without claiming a successful save.
    page.on('dialog', dialog => dialog.accept());
    await page.locator('#backup-input').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported.value))});
    await page.locator('#toast').filter({hasText:'备份已恢复'}).waitFor();
    await page.locator('[data-page="dates"]').click(); await page.evaluate(()=>window.failRecordSave=true);
    await page.locator('#add-date').click(); await page.locator('#date-form input[name="title"]').fill('不应保存成功');
    await page.locator('#date-form [type="submit"]').click(); await page.locator('#toast').filter({hasText:'未能保存'}).waitFor();
    assert.equal(await page.locator('#date-dialog').evaluate(el=>el.open),true);
    await context.close(); console.log(`PASS phone UI ${width}px: navigation, order, photos, records, analysis, backup, failed save`);
  }
  assert.deepEqual(errors, []);
  // Convert the existing vector heart logo to app icon sizes using the browser.
  const iconPage = await browser.newPage();
  const svg = await readFile('public/icon.svg','utf8');
  await iconPage.setContent('<style>html,body{margin:0;background:#f8e8e5}svg{width:100vw;height:100vh;display:block}</style>'+svg);
  for (const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})) {
    await iconPage.setViewportSize({width:size,height:size}); const png=await iconPage.screenshot();
    for(const name of ['ic_launcher','ic_launcher_round','ic_launcher_foreground']) await writeFile(`android/app/src/main/res/mipmap-${density}/${name}.png`,png);
  }
  await iconPage.setViewportSize({width:1024,height:1024}); await iconPage.screenshot({path:'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'});
  console.log('PASS existing heart icon exported for Android and iOS');
} finally { if(browser) await browser.close(); server.close(); }
