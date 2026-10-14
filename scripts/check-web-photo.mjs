// Check the retained computer website through its UI, without relying on app globals.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('.tooling', {recursive:true});
const directory = await mkdtemp(path.resolve('.tooling/web-photo-qa-'));
const server = spawn(process.execPath, ['server.mjs'], {env:{...process.env,PORT:'0',LOVE_LAN:'0',LOVE_DATA_DIR:directory},windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try {
  const url=await new Promise((resolve,reject)=>{
    let output=''; const timer=setTimeout(()=>reject(new Error('Server timeout')),10000);
    server.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+\/#key=[a-f0-9]+/);if(match){clearTimeout(timer);resolve(match[0]);}});
    server.on('error',reject);
  });
  browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(url); await page.locator('#menu-grid .menu-card').first().waitFor();
  await page.evaluate(()=>localStorage.setItem('little-love-data',JSON.stringify({version:1,memories:[{title:'旧版回忆',date:'2020-01-01',text:'旧内容',photo:''}],dates:[{title:'旧纪念日',date:'2020-01-01',yearly:true}]})));
  await page.reload(); await page.locator('[data-page="memories"]').click(); await page.getByRole('heading',{name:'旧版回忆'}).waitFor();
  await page.locator('#add-memory').click();
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=1300;canvas.height=1900;const ctx=canvas.getContext('2d');ctx.fillStyle='#af5e59';ctx.fillRect(0,0,1300,1900);return canvas.toDataURL('image/png').split(',')[1];});
  await page.locator('#memory-form input[name="title"]').fill('照片功能检查');
  await page.locator('#memory-form input[name="photo"]').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.locator('#photo-status').filter({hasText:'照片已加载'}).waitFor();
  assert.deepEqual(await page.locator('#photo-preview').evaluate(img=>[img.naturalWidth,img.naturalHeight]),[1300,1900]);
  await page.locator('#memory-form [type="submit"]').click(); await page.locator('#memory-dialog').waitFor({state:'hidden'});
  await page.locator('.memory-open').first().click(); await page.locator('#edit-memory').click(); await page.locator('#memory-form input[name="title"]').fill('编辑后的回忆');
  await page.locator('#memory-form [type="submit"]').click(); await page.locator('#memory-dialog').waitFor({state:'hidden'});
  await page.locator('[data-page="dates"]').click(); await page.locator('[data-add-care="periods"]').click();
  await page.locator('#care-form input[name="start"]').fill('2026-09-10'); await page.locator('#care-form input[name="end"]').fill('2026-09-09');
  await page.locator('#care-form [type="submit"]').click(); await page.locator('#toast').filter({hasText:'结束日期不能早于开始日期'}).waitFor();
  await page.locator('#care-form input[name="end"]').fill('2026-09-14'); await page.locator('#care-form [type="submit"]').click(); await page.locator('#care-dialog').waitFor({state:'hidden'});
  await page.locator('[data-add-care="tasks"]').click(); await page.locator('#care-form input[name="title"]').fill('买甜点'); await page.locator('#care-form [type="submit"]').click(); await page.locator('#care-dialog').waitFor({state:'hidden'});
  await page.locator('#task-list input').check();
  await page.locator('[data-add-care="notes"]').click(); await page.locator('#care-form input[name="title"]').fill('喜欢草莓'); await page.locator('#care-form [type="submit"]').click(); await page.locator('#care-dialog').waitFor({state:'hidden'});
  await page.reload(); await page.locator('[data-page="memories"]').click();
  await page.locator('#memory-list img').evaluate(img=>img.decode());
  assert.deepEqual(await page.locator('#memory-list img').evaluate(img=>[img.naturalWidth,img.naturalHeight]),[1300,1900]);
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('little-love-data')));
  assert.equal(data.memories[0].title,'编辑后的回忆'); assert.ok(data.memories[0].photo.startsWith('/api/photos/'));
  assert.equal(data.memories[1].title,'旧版回忆'); assert.equal(data.tasks[0].done,true); assert.equal(data.periods.length,1); assert.equal(data.notes.length,1);
  await page.locator('[data-page="settings"]').click(); const downloadPromise=page.waitForEvent('download'); await page.locator('#export-data').click(); const download=await downloadPromise;
  const stream=await download.createReadStream(); let raw=''; for await(const chunk of stream)raw+=chunk.toString(); const backup=JSON.parse(raw);
  assert.ok(backup.memories[0].photo.startsWith('data:image/jpeg;base64,')); assert.equal(backup.tasks[0].done,true);
  console.log('PASS retained website: legacy records, full-size portrait, editing, periods, tasks, preferences, reload and portable photo backup; no email sent.');
} finally {await browser?.close();server.kill();}
