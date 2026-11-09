// 견적서 파일 내려받기: 화면에서 만든 PDF · JPG 를 받아 '파일 이름이 붙은 첨부파일'로 그대로 돌려준다.
// 브라우저 안에서 Blob 으로 저장하면 일부 환경(Chrome 설정 · 확장, 카카오톡 등 앱 안 브라우저)에서
// 파일 이름 · 확장자가 사라지거나 저장이 안 되므로, 서버의 Content-Disposition 으로 이름을 정한다.
//
// 폼 POST(페이지 이동) 로 호출되므로, 실패해도 화면이 바뀌지 않게 204(내용 없음)로 답한다.
const KINDS = {
  pdf: { type: 'application/pdf', ok: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 }, // %PDF
  jpg: { type: 'image/jpeg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
};
const MAX_B64 = 12 * 1024 * 1024; // 약 9MB 파일

const nothing = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

export async function echoFile(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return nothing();
  }
  const kind = form.get('kind') === 'jpg' ? 'jpg' : 'pdf';
  const spec = KINDS[kind];
  const b64 = String(form.get('data') || '');
  if (!b64 || b64.length > MAX_B64) return nothing();
  let bytes;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return nothing();
  }
  // 견적서 PDF · JPG 만 돌려줌 (다른 종류의 파일을 되돌려주는 통로가 되지 않도록)
  if (bytes.length < 4 || !spec.ok(bytes)) return nothing();

  let name = String(form.get('name') || '').replace(/[\\/:*?"<>|\r\n\t]/g, '').trim().slice(0, 120);
  if (!name) name = '견적서';
  if (!name.toLowerCase().endsWith('.' + kind)) name += '.' + kind;
  // 한글 이름을 못 읽는 오래된 브라우저용 예비 이름 (견적번호 등 영문 · 숫자만 남김)
  let ascii = name.replace(/[^\x20-\x7e]+/g, '').replace(/^[_\s.-]+/, '');
  if (ascii.length <= kind.length + 1) ascii = 'quote.' + kind;
  return new Response(bytes, {
    headers: {
      'content-type': spec.type,
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'content-length': String(bytes.length),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
