/**
 * Probe một Drive ID: folder hay file, tải ảnh được không.
 * Usage: node backend/src/modules/guide/tools/probe-drive-id.mjs <id>
 */
const H = {
  Referer: 'https://drive.google.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

const ids = process.argv.slice(2);
if (ids.length === 0) {
  ids.push(
    '1fyWKsuPJhKNaK-_cjPGq9ApXxHQw3HOJ', // Payon open?id trên sheet
    '1XhLNAawTycYfS6-u3N3Yh06JhQJwzgZi', // Stella
    '1-bUji6vKzZUbbWu396wf0fB228giirxB', // Nhà An 1 file OK
    '1AtMhNThRSG4aoLn-J7M3FWjMLsLKoD5m', // Payon folder cũ
  );
}

function pick(html, re) {
  const m = html.match(re);
  return m ? m[1] : '';
}

async function inspect(id) {
  console.log(`\n==== ${id} ====`);

  const openRes = await fetch(`https://drive.google.com/open?id=${id}`, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  const openHtml = await openRes.text();
  const openTitle = pick(openHtml, /<title[^>]*>([^<]+)/i);
  console.log('open?id:', openRes.status, '| title:', openTitle);

  const fileRes = await fetch(`https://drive.google.com/file/d/${id}/view`, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  const fileHtml = await fileRes.text();
  const fileTitle = pick(fileHtml, /<title[^>]*>([^<]+)/i);
  const mime = pick(fileHtml, /"mimeType"\s*:\s*"([^"]+)"/)
    || pick(fileHtml, /mimeType\\x22:\\x22([^\\]+)\\x22/);
  console.log('file/d/view:', fileRes.status, '| title:', fileTitle, '| mime:', mime || '(n/a)');

  const embRes = await fetch(`https://drive.google.com/embeddedfolderview?id=${id}#list`, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  const embHtml = await embRes.text();
  const childIds = [...new Set([...embHtml.matchAll(/\/file\/d\/([a-zA-Z0-9_-]+)\//g)].map((m) => m[1]))];
  console.log('embeddedfolderview:', embRes.status, '| child files:', childIds.length, childIds.slice(0, 3).join(', ') || '-');

  for (const [label, url] of [
    ['uc?export=view', `https://drive.google.com/uc?export=view&id=${id}`],
    ['lh3usercontent', `https://lh3.googleusercontent.com/d/${id}=w1600`],
  ]) {
    const r = await fetch(url, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const body = Buffer.from(await r.arrayBuffer());
    const jpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8;
    console.log(`${label}:`, r.status, r.headers.get('content-type'), 'bytes', body.length, jpeg ? 'JPEG_OK' : 'NOT_IMAGE');
  }

  if (childIds[0]) {
    const r = await fetch(`https://drive.google.com/uc?export=view&id=${childIds[0]}`, { headers: H, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const body = Buffer.from(await r.arrayBuffer());
    const jpeg = body.length >= 3 && body[0] === 0xff && body[1] === 0xd8;
    console.log('child[0] uc:', childIds[0], r.status, r.headers.get('content-type'), jpeg ? 'JPEG_OK' : 'NOT_IMAGE', 'bytes', body.length);
  }

  // Kết luận loại ID
  if (childIds.length > 0) console.log('>> KET LUAN: ID nay la FOLDER (co file con)');
  else if (mime && mime.startsWith('image/')) console.log('>> KET LUAN: ID nay la FILE ANH');
  else if (mime) console.log('>> KET LUAN: ID nay la FILE, mime=', mime);
  else console.log('>> KET LUAN: khong xac dinh / khong tai anh truc tiep duoc');
}

for (const id of ids) {
  await inspect(id);
}
