export const handler = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };
  try {
    const response = await fetch('https://ournoor.com/api/v1/hadits', { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const rows = Array.isArray(json?.data) ? json.data : null;
    if (!rows || rows.length < 42) throw new Error('Respons API Arba’in tidak berisi 42 hadits lengkap');
    const hadiths = rows.map(h => ({
      number: Number(h.no),
      title: h.judul || `Hadits Arba’in No. ${h.no}`,
      arab: h.arab || '',
      id: h.indo || ''
    })).filter(h => h.number && (h.arab || h.id));
    if (hadiths.length !== 42) throw new Error(`Jumlah data tidak lengkap: ${hadiths.length}/42`);
    return { statusCode: 200, headers, body: JSON.stringify({ data: { hadiths }, source: 'OurNoor API — Arba’in Nawawi' }) };
  } catch (error) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Gagal memuat API Arba’in Nawawi', details: error?.message || String(error) }) };
  }
};