// Public Islamic API proxy: Kisah Nabi
export const handler = async () => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' };
  try {
    const response = await fetch('https://islamic-api.vwxyz.id/v2/kisahnabi', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    const raw = Array.isArray(payload) ? payload : (payload?.data ?? payload?.result ?? payload?.kisahnabi ?? payload?.stories);
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('Respons API tidak berisi daftar kisah yang dikenali');
    const pick = (obj, keys) => keys.map(k => obj?.[k]).find(v => typeof v === 'string' && v.trim()) || '';
    const stories = raw.map((row, index) => {
      if (typeof row === 'string') return { title: 'Kisah Nabi ' + (index + 1), body: row.trim() };
      const title = pick(row, ['nama', 'name', 'nabi', 'title', 'judul', 'nama_nabi']);
      const body = pick(row, ['kisah', 'story', 'cerita', 'detail', 'description', 'deskripsi', 'isi', 'content', 'text']);
      return { title: title || 'Kisah Nabi ' + (index + 1), body };
    }).filter(x => x.body && x.body.length > 40);
    if (!stories.length) throw new Error('Format JSON berubah atau field cerita tidak dikenali');
    return { statusCode: 200, headers, body: JSON.stringify({ data: stories, source: 'Muslim API V2 — Kisah Nabi' }) };
  } catch (error) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gagal mengambil Kisah Nabi dari API publik', details: error?.message || String(error) }) };
  }
};
