import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { createMailService } from './service.js';

// iOS 15.0 predates Array.at and crypto.randomUUID. Keep the native baseline usable.
if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { value(index) { const i = Math.trunc(Number(index) || 0); return this[i < 0 ? this.length + i : i]; }, configurable: true, writable: true });
function uuid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const native = registerPlugin('LoveMail');
const service = createMailService(native);
const photoPattern = /^\/api\/photos\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/;
let rootURI = '';
function photoPath(photo) {
  const match = photo.match(photoPattern); if (!match) throw new Error('照片路径无效。');
  return `photos/${match[1]}`;
}
async function readPhoto(photo) {
  if (photo.startsWith('data:image/')) return photo;
  const { data } = await Filesystem.readFile({ path: photoPath(photo), directory: Directory.Data });
  const ext = photo.split('.').at(-1);
  return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data}`;
}
async function savePhoto(photo) {
  const match = photo.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[2].length > 20 * 1024 * 1024) throw new Error('请选择 15MB 以内的 JPG、PNG 或 WebP 照片。');
  const bytes = atob(match[2].slice(0, 24));
  const valid = match[1] === 'jpeg' ? bytes.charCodeAt(0) === 255 && bytes.charCodeAt(1) === 216 : match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (!valid) throw new Error('照片内容与格式不符。');
  const id = `${uuid()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
  await Filesystem.writeFile({ path: `photos/${id}`, data: match[2], directory: Directory.Data, recursive: true });
  return { photo: `/api/photos/${id}` };
}
async function shareFile(name, contents, text = false) {
  const path = `exports/${uuid()}/${name}`;
  const { uri } = await Filesystem.writeFile({ path, data: contents, directory: Directory.Cache, recursive: true, ...(text ? { encoding: Encoding.UTF8 } : {}) });
  await Share.share({ title: name, files: [uri], dialogTitle: '保存或分享' });
}
if (Capacitor.isNativePlatform()) {
  window.LoveMobile = {
    async initialize() {
      await service.initialize();
      rootURI = (await Filesystem.getUri({ path: '', directory: Directory.Data })).uri.replace(/\/$/, '');
      await App.addListener('backButton', () => window.dispatchEvent(new Event('love-back')));
      await App.addListener('appStateChange', ({ isActive }) => { if (isActive) window.dispatchEvent(new Event('love-resume')); });
    },
    async readRecords() { return (await native.read({ key: 'records' })).value; },
    async writeRecords(value) { await native.write({ key: 'records', value }); },
    async api(path, value) {
      if (path === '/api/state') return service.state();
      if (path === '/api/config') return service.configure(value);
      if (path === '/api/order') return service.order(value);
      if (path === '/api/photos') return savePhoto(value.photo);
      throw new Error('暂不支持此操作。');
    },
    photoURL(photo) { return photo.startsWith('/api/photos/') ? Capacitor.convertFileSrc(`${rootURI}/${photoPath(photo)}`) : photo; },
    readPhoto,
    async sharePhoto(photo) { const data = await readPhoto(photo); const ext = data.startsWith('data:image/png') ? 'png' : data.startsWith('data:image/webp') ? 'webp' : 'jpg'; await shareFile(`回忆照片.${ext}`, data.split(',')[1]); },
    async exportBackup(name, backup) { await shareFile(name, JSON.stringify(backup, null, 2), true); },
    async minimize() { await App.minimizeApp(); }
  };
}
