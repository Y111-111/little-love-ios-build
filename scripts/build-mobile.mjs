import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

await mkdir('dist', { recursive: true });
for (const file of ['app.js', 'style.css', 'icon.svg', 'period-analysis.js', 'manifest.webmanifest']) {
  await copyFile(`public/${file}`, `dist/${file}`);
}
let html = await readFile('public/index.html', 'utf8');
html = html.replace('<script src="/app.js"', '<script src="/mobile.js" defer></script><script src="/app.js"');
html = html.replace('<meta name="theme-color"', '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob: capacitor:; connect-src \'self\'; object-src \'none\'; base-uri \'self\'; form-action \'self\'"><meta name="theme-color"');
html = html.replace('回忆文字、日期和生活记录保存在此浏览器，照片保存在电脑。备份会包含照片，不包含邮箱授权码。', '照片、回忆和生活记录保存在这台手机。导出后请选择保存到文件或自己的备份位置。备份不包含邮箱授权码和心心账本；卸载前请先备份。');
html = html.replaceAll('关闭网页后暂不推送', '关闭应用后暂不推送').replace('把授权码填写在左侧', '把授权码填写在设置里');
html = html.replace('请在运行发信助手的电脑上填写。设置由电脑的 Windows 账号加密保存，重启后自动读取。', '请在此手机填写邮箱。授权码由手机系统安全保管，重启后自动读取。');
html = html.replaceAll('保存到电脑文件夹', '保存到这台手机');
await writeFile('dist/index.html', html);
await build({ entryPoints: ['mobile/entry.js'], outfile: 'dist/mobile.js', bundle: true, format: 'iife', target: ['chrome91', 'safari15'], legalComments: 'eof' });
console.log('手机界面已生成到 dist/（不包含电脑设置和个人数据）。');
