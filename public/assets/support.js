import { api, $, $$, esc, initLayout, setBusy } from './common.js';
import { shrink } from './shrink.js';

await initLayout();
const body = $('#csBody');
const NAMES = { notice: '공지사항', faq: '자주 묻는 질문', qna: '1:1 문의' };
let tab = new URLSearchParams(location.search).get('tab') || 'qna';
if (!NAMES[tab]) tab = 'qna';

$$('.cs-nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));

function go(t, extra = '') {
  tab = t;
  history.replaceState(null, '', `?tab=${t}${extra}`);
  $$('.cs-nav button').forEach((b) => {
    b.classList.toggle('on', b.dataset.tab === t);
    if (b.dataset.tab === t) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  $('#crumbTab').textContent = NAMES[t];
  ({ notice, faq, qna })[t]();
}

const date = (s) => (s || '').slice(0, 10);

async function notice() {
  const id = new URLSearchParams(location.search).get('id');
  if (id) return noticeView(id);
  body.innerHTML = '<h2 style="font-size:20px">공지사항</h2><p class="loading">불러오는 중…</p>';
  try {
    const [n, e] = await Promise.all([api('/api/posts?board=notice'), api('/api/posts?board=event')]);
    const posts = [...n.posts.map((p) => ({ ...p, kind: '공지' })), ...e.posts.map((p) => ({ ...p, kind: '이벤트' }))].sort(
      (a, b) => b.pinned - a.pinned || b.created_at.localeCompare(a.created_at)
    );
    body.innerHTML = `<h2 style="font-size:20px">공지사항</h2>
<table class="list-table"><thead><tr><th scope="col" style="width:80px">구분</th><th scope="col" class="l">제목</th><th scope="col" style="width:120px">등록일</th></tr></thead><tbody>
${posts.length ? posts.map((p) => `<tr><td class="${p.pinned ? 'red' : 'muted'}" style="font-weight:${p.pinned ? 700 : 400}">${p.pinned ? '중요' : p.kind}</td><td class="l"><button class="linkbtn" data-id="${p.id}">${esc(p.title)}</button></td><td class="muted">${date(p.created_at)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted" style="padding:40px">등록된 공지가 없습니다.</td></tr>'}
</tbody></table>`;
    $$('.linkbtn[data-id]', body).forEach((b) => b.addEventListener('click', () => { history.replaceState(null, '', `?tab=notice&id=${b.dataset.id}`); noticeView(b.dataset.id); }));
  } catch (err) {
    body.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

async function noticeView(id) {
  try {
    const { post } = await api('/api/posts/' + encodeURIComponent(id));
    body.innerHTML = `<div class="post-view"><div class="h"><strong style="font-size:18px">${esc(post.title)}</strong><br><span class="small muted">${date(post.created_at)}</span></div>
<div class="b">${esc(post.body)}${post.attachments.map((a) => `<img src="${esc(a)}" alt="첨부 이미지" style="margin-top:16px" loading="lazy">`).join('')}</div></div>
<div><button class="btn" id="toList">목록</button></div>`;
    $('#toList').addEventListener('click', () => { history.replaceState(null, '', '?tab=notice'); notice(); });
  } catch (err) {
    body.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

async function faq() {
  body.innerHTML = '<h2 style="font-size:20px">자주 묻는 질문</h2><p class="loading">불러오는 중…</p>';
  try {
    const { posts } = await api('/api/posts?board=faq');
    body.innerHTML = `<h2 style="font-size:20px">자주 묻는 질문</h2><div style="border-top:2px solid var(--ink)">${
      posts.length
        ? posts.map((p, i) => `<div style="border-bottom:1px solid var(--line)"><button class="faq-q" aria-expanded="${i === 0}" aria-controls="fa${p.id}"><strong class="red">Q</strong><span style="flex:1">${esc(p.title)}</span><span aria-hidden="true" class="muted">${i === 0 ? '−' : '+'}</span></button>
<div class="faq-a" id="fa${p.id}" ${i === 0 ? '' : 'hidden'}><strong>A</strong><span>${esc(p.body)}</span></div></div>`).join('')
        : '<p class="empty">등록된 질문이 없습니다.</p>'
    }</div>`;
    $$('.faq-q', body).forEach((b) =>
      b.addEventListener('click', () => {
        const open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(open));
        b.lastElementChild.textContent = open ? '−' : '+';
        b.nextElementSibling.hidden = !open;
      })
    );
  } catch (err) {
    body.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

async function qna(page = 1) {
  body.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><h2 style="font-size:20px">1:1 문의 (Q&amp;A)</h2><button class="btn btn-red" id="writeBtn" style="height:42px">문의하기</button></div><p class="loading">불러오는 중…</p>`;
  $('#writeBtn').addEventListener('click', write);
  try {
    const r = await api('/api/inquiries?page=' + page);
    const pages = Math.max(1, Math.ceil(r.total / 20));
    body.querySelector('.loading').outerHTML = `<table class="list-table"><thead><tr><th scope="col" style="width:60px" class="hide-m">번호</th><th scope="col" style="width:110px" class="hide-m">유형</th><th scope="col" class="l">제목</th><th scope="col" style="width:80px">작성자</th><th scope="col" style="width:90px">상태</th><th scope="col" style="width:100px" class="hide-m">등록일</th></tr></thead><tbody>
${r.inquiries.length ? r.inquiries.map((q, i) => `<tr><td class="muted hide-m">${r.total - (page - 1) * 20 - i}</td><td class="muted hide-m">${esc(q.type)}</td><td class="l"><button class="linkbtn" data-id="${q.id}">${esc(q.title)}</button> <span class="small muted">비밀글</span><div class="pw-row" hidden style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><label class="sr" for="pw${q.id}">비밀번호</label><input class="input" id="pw${q.id}" type="password" inputmode="numeric" placeholder="작성 시 비밀번호" style="height:38px;width:170px"><button class="btn" style="height:38px;padding:0 14px" data-view="${q.id}">확인</button></div><div class="view-box"></div></td><td>${esc(q.name)}</td><td>${q.status === 'done' ? '<span class="small muted">답변완료</span>' : '<strong class="small red">답변대기</strong>'}</td><td class="muted hide-m">${date(q.created_at).slice(5)}</td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:40px">등록된 문의가 없습니다.</td></tr>'}
</tbody></table>
${pages > 1 ? `<div style="display:flex;gap:6px;justify-content:center">${Array.from({ length: pages }, (_, i) => `<button class="chip ${i + 1 === page ? 'on' : ''}" style="min-width:40px" data-page="${i + 1}">${i + 1}</button>`).join('')}</div>` : ''}
<p class="small muted" style="margin:0">비밀글은 작성 시 입력한 비밀번호로 확인할 수 있습니다. 답변이 등록되면 연락드립니다.</p>`;
    $$('[data-page]', body).forEach((b) => b.addEventListener('click', () => qna(+b.dataset.page)));
    $$('.linkbtn[data-id]', body).forEach((b) =>
      b.addEventListener('click', () => {
        const row = b.parentElement.querySelector('.pw-row');
        row.hidden = !row.hidden;
        if (!row.hidden) row.querySelector('input').focus();
      })
    );
    $$('[data-view]', body).forEach((b) =>
      b.addEventListener('click', async () => {
        const td = b.closest('td');
        const box = td.querySelector('.view-box');
        try {
          const { inquiry: q } = await api(`/api/inquiries/${b.dataset.view}/view`, { method: 'POST', body: { password: td.querySelector('input').value } });
          td.querySelector('.pw-row').hidden = true;
          box.innerHTML = `<div style="padding:14px 0;white-space:pre-line;line-height:1.8;font-size:14px">${esc(q.body)}</div>${q.attachments.map((a) => `<img src="${esc(a)}" alt="첨부 사진" style="max-width:240px;margin:4px 0" loading="lazy">`).join('')}
${q.answer ? `<div class="answer"><strong>답변</strong> <span class="small muted">${date(q.answered_at)}</span>\n${esc(q.answer)}</div>` : '<p class="small muted">아직 답변 전입니다.</p>'}`;
        } catch (err) {
          box.innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
        }
      })
    );
  } catch (err) {
    body.querySelector('.loading').outerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

function write() {
  body.innerHTML = '';
  body.append($('#qnaWriteTpl').content.cloneNode(true));
  $('#qCancel').addEventListener('click', () => qna());
  $('#qSubmit').addEventListener('click', async () => {
    const f = $('#qnaForm'), err = $('#qErr');
    err.textContent = '';
    if (!f.name.value.trim()) return (err.textContent = '이름을 입력해 주세요.');
    if (f.phone.value.replace(/\D/g, '').length < 10) return (err.textContent = '휴대폰 번호를 확인해 주세요.');
    if (!f.title.value.trim() || !f.body.value.trim()) return (err.textContent = '제목과 내용을 입력해 주세요.');
    if (!/^\d{4,8}$/.test(f.password.value)) return (err.textContent = '비밀번호는 숫자 4~8자리로 입력해 주세요.');
    if (f.files.files.length > 5) return (err.textContent = '사진은 5장까지 첨부할 수 있습니다.');
    if (!f.agree.checked) return (err.textContent = '개인정보 수집·이용에 동의해 주세요.');
    const fd = new FormData();
    ['type', 'name', 'phone', 'title', 'body', 'password', 'website'].forEach((k) => fd.append(k, f[k].value));
    fd.append('agree', 'true');
    for (const file of f.files.files) fd.append('files', await shrink(file));
    const btn = $('#qSubmit');
    setBusy(btn, true, '등록 중…');
    try {
      const r = await api('/api/inquiries', { method: 'POST', body: fd });
      body.innerHTML = `<div class="done-box"><h2>문의가 등록되었습니다.</h2><p style="margin:0;color:#444;line-height:1.8">접수번호 <strong class="red">${esc(r.no)}</strong><br>답변이 등록되면 연락드리겠습니다.</p></div><div style="display:flex;justify-content:center"><button class="btn" id="toQna">목록으로</button></div>`;
      $('#toQna').addEventListener('click', () => qna());
    } catch (e) {
      err.textContent = e.message;
      setBusy(btn, false);
    }
  });
}

go(tab, new URLSearchParams(location.search).get('id') ? `&id=${new URLSearchParams(location.search).get('id')}` : '');
