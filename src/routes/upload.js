// 사진 저장 (R2) 과 제공
import { bad, HttpError } from '../lib/util.js';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };

// folder: banner / long / model / inquiry / post
export async function saveUpload(env, file, folder, maxBytes = 10 * 1024 * 1024) {
  const ext = TYPES[file.type];
  if (!ext) throw bad('사진 파일(JPG, PNG, WEBP)만 올릴 수 있습니다.');
  if (ext === 'svg' && folder === 'inquiry') throw bad('사진 파일(JPG, PNG, WEBP)만 올릴 수 있습니다.');
  if (file.size > maxBytes) throw bad(`사진 한 장은 ${Math.round(maxBytes / 1024 / 1024)}MB 이하로 올려 주세요.`);
  const ym = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7).replace('-', '');
  const key = `${folder}/${ym}/${crypto.randomUUID()}.${ext}`;
  await env.IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
  return key;
}

export async function serveImage(env, key) {
  if (!/^[a-z]+\/\d{6}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|svg)$/.test(key)) throw new HttpError(404, '이미지를 찾을 수 없습니다.');
  const obj = await env.IMAGES.get(key);
  if (!obj) throw new HttpError(404, '이미지를 찾을 수 없습니다.');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  if (key.endsWith('.svg')) headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
  return new Response(obj.body, { headers });
}
