// Server-side EQuran public API fetch: avoids browser-side CORS/API failures
export const handler = async () => {
  const headers = { 'Content-Type':'application/json', 'Cache-Control':'public, max-age=300' };
  try {
    const [suratRes, doaRes] = await Promise.all([
      fetch('https://equran.id/api/surat/36', { signal: AbortSignal.timeout(10000) }),
      fetch('https://equran.id/api/doa', { signal: AbortSignal.timeout(10000) })
    ]);
    if (!suratRes.ok || !doaRes.ok) throw new Error('EQuran upstream HTTP error');
    const [surat, doaJson] = await Promise.all([suratRes.json(), doaRes.json()]);
    const verses = Array.isArray(surat?.ayat) ? surat.ayat : [];
    const doaList = Array.isArray(doaJson?.data) ? doaJson.data : (Array.isArray(doaJson) ? doaJson : []);
    const quotes = [];
    verses.filter(v => v?.ar && (v?.idn || v?.tr)).slice(0, 5).forEach(v => quotes.push({ arab:v.ar, meaning:v.idn||v.tr, source:'QS. '+(surat.nama_latin||surat.nama||'Ya-Sin')+' · Ayat '+v.nomor, kind:'ayat' }));
    doaList.filter(d => d?.ar && (d?.idn || d?.tr)).slice(0, 5).forEach(d => quotes.push({ arab:d.ar, meaning:d.idn||d.tr, name:d.nama||'', source:d.tentang||d.grup||'Do’a & Dzikir', kind:'doa' }));
    if (!quotes.length) throw new Error('EQuran API returned no usable quote items');
    return { statusCode:200, headers, body:JSON.stringify({quotes,source:'EQuran.id'}) };
  } catch (error) {
    return { statusCode:502, headers, body:JSON.stringify({error:'Quote Islami API tidak dapat dimuat',details:error?.message||String(error)}) };
  }
};
