export const handler = async (event) => {
  const book = String(event.queryStringParameters?.book || '').toLowerCase();
  const range = String(event.queryStringParameters?.range || '1-20');
  const allowedBooks = new Set(['bukhari', 'muslim', 'tirmidzi']);
  if (!allowedBooks.has(book) || !/^\d+-\d+$/.test(range)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Parameter kitab atau rentang tidak valid.' }) };
  }

  const [start, end] = range.split('-').map(Number);
  if (start < 1 || end < start || end - start > 49) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Rentang maksimal 50 hadits dan harus dimulai dari nomor valid.' }) };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };
  const sources = [
    {
      name: 'House Muslim',
      url: `https://api.housemuslim.org/api/v1/hadith/books/${book}/items?page=1&per_page=${end}`,
      parse: json => json?.success && Array.isArray(json.data) ? json.data : null
    },
    {
      name: 'API Hadis',
      url: `https://api-hadis.vercel.app/books/${book}?range=${start}-${end}`,
      parse: json => Array.isArray(json?.data?.hadiths) ? json.data.hadiths : Array.isArray(json?.data) ? json.data : null
    },
    {
      name: 'Gading Hadith API',
      url: `https://api.hadith.gading.dev/books/${book}?range=${start}-${end}`,
      parse: json => Array.isArray(json?.data?.hadiths) ? json.data.hadiths : Array.isArray(json?.data) ? json.data : null
    }
  ];

  const normalize = rows => rows
    .filter(h => Number(h.number ?? h.hadithNumber ?? h.no) >= start && Number(h.number ?? h.hadithNumber ?? h.no) <= end)
    .map(h => ({
      number: Number(h.number ?? h.hadithNumber ?? h.no),
      arab: h.arab || h.arabic || h.arabText || '',
      id: h.translation_id || h.id || h.translation || h.terjemah || h.indonesia || ''
    }))
    .filter(h => h.number && (h.arab || h.id));

  const errors = [];
  for (const source of sources) {
    try {
      const response = await fetch(source.url, { signal: AbortSignal.timeout(9000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const rows = source.parse(json);
      if (!rows) throw new Error('Format respons tidak dikenali');
      const hadiths = normalize(rows);
      if (!hadiths.length) throw new Error('Data kosong atau format teks tidak cocok');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ data: { hadiths }, source: source.name, fallbackUsed: source.name !== 'House Muslim' })
      };
    } catch (error) {
      errors.push(`${source.name}: ${error?.message || 'gagal'}`);
    }
  }

  return {
    statusCode: 502,
    headers,
    body: JSON.stringify({ error: 'Semua sumber API hadits gagal.', details: errors })
  };
};