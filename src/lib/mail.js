// 관리자 알림 메일: 설정된 수신 주소(최대 2곳)로 발송하고 mail_log 에 기록
// Cloudflare Email Routing 에서 '인증된 수신 주소'로만 발송됩니다 (무료).
import { EmailMessage } from 'cloudflare:email';
import { esc, getSettings } from './util.js';

const MAX_ATTEMPTS = 3;

export function buildMailHtml({ title, intro, rows, linkUrl, linkText }) {
  const tr = rows
    .filter((r) => r && r[1] !== undefined && r[1] !== null && r[1] !== '')
    .map(
      ([k, v]) =>
        `<tr><th style="width:120px;text-align:left;padding:8px 10px;background:#f5f5f5;border-bottom:1px solid #e5e5e5;font-weight:700">${esc(k)}</th><td style="padding:8px 10px;border-bottom:1px solid #e5e5e5;white-space:pre-line">${esc(v)}</td></tr>`
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#1a1a1a;font-size:14px">
<div style="max-width:600px;margin:0 auto;border-top:4px solid #C8102E">
<h1 style="font-size:18px;margin:18px 0 6px">${esc(title)}</h1>
<p style="margin:0 0 16px;color:#444">${esc(intro)}</p>
<table style="width:100%;border-collapse:collapse;border-top:2px solid #1a1a1a;font-size:14px">${tr}</table>
${linkUrl ? `<p style="margin:20px 0"><a href="${esc(linkUrl)}" style="display:inline-block;background:#1a1a1a;color:#fff;text-decoration:none;padding:10px 16px;font-weight:700">${esc(linkText || '관리자에서 보기')}</a></p>` : ''}
<p style="margin:24px 0 0;color:#888;font-size:12px">에이스렌터카 홈페이지에서 자동으로 보낸 메일입니다.</p>
</div></body></html>`;
}

// 예약·신청·문의가 들어왔을 때 호출. 메일 보낼 항목에 해당하면 기록 후 발송
export async function notifyAdmins(env, { kind, refNo, subject, html }) {
  const s = await getSettings(env.DB);
  let kinds = [];
  try {
    kinds = JSON.parse(s.notify_kinds || '[]');
  } catch {}
  if (kind !== '테스트' && !kinds.includes(kind)) return [];
  const recipients = [s.notify_email_1, s.notify_email_2].map((x) => (x || '').trim()).filter(Boolean);
  const ids = [];
  for (const to of recipients) {
    const r = await env.DB
      .prepare('INSERT INTO mail_log (kind, ref_no, recipient, subject, body_html) VALUES (?, ?, ?, ?, ?)')
      .bind(kind, refNo || '', to, subject, html)
      .run();
    ids.push(r.meta.last_row_id);
  }
  for (const id of ids) await sendLogged(env, id);
  return ids;
}

// mail_log 1건 발송 (재발송에도 사용)
export async function sendLogged(env, id) {
  const row = await env.DB.prepare('SELECT * FROM mail_log WHERE id = ?').bind(id).first();
  if (!row) return false;
  try {
    if (!env.MAILER) throw new Error('메일 발송 설정(send_email)이 없습니다.');
    const raw = buildMime({
      from: env.MAIL_FROM,
      fromName: env.MAIL_FROM_NAME || env.SITE_NAME || '',
      to: row.recipient,
      subject: row.subject,
      html: row.body_html,
    });
    await env.MAILER.send(new EmailMessage(env.MAIL_FROM, row.recipient, raw));
    await env.DB
      .prepare(`UPDATE mail_log SET status = 'sent', error = '', attempts = attempts + 1, sent_at = datetime('now') WHERE id = ?`)
      .bind(id)
      .run();
    return true;
  } catch (e) {
    await env.DB
      .prepare(`UPDATE mail_log SET status = 'failed', error = ?, attempts = attempts + 1 WHERE id = ?`)
      .bind(String(e && e.message ? e.message : e).slice(0, 300), id)
      .run();
    return false;
  }
}

// 10분마다: 실패한 메일을 최대 3회까지 다시 보냄
export async function retryFailed(env) {
  const { results } = await env.DB
    .prepare(`SELECT id FROM mail_log WHERE status IN ('failed','pending') AND attempts < ? ORDER BY id LIMIT 20`)
    .bind(MAX_ATTEMPTS)
    .all();
  for (const r of results) await sendLogged(env, r.id);
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function encodeWord(str) {
  return /^[\x20-\x7e]*$/.test(str) ? str : `=?UTF-8?B?${b64utf8(str)}?=`;
}

export function buildMime({ from, fromName, to, subject, html }) {
  const domain = (from.split('@')[1] || 'localhost').trim();
  const body = b64utf8(html).replace(/.{1,76}/g, '$&\r\n');
  const headers = [
    `From: ${fromName ? `${encodeWord(fromName)} ` : ''}<${from}>`,
    `To: <${to}>`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  return headers.join('\r\n') + '\r\n\r\n' + body;
}
