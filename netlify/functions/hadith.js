export const handler = async (event) => {
  const book = String(event.queryStringParameters?.book || '').toLowerCase();
  const range = String(event.queryStringParameters?.range || '1-20');
  const allowedBooks = new Set(['bukhari', 'muslim', 'tirmidzi']);
  if (!allowedBooks.has(book) || !/^\d+-\d+$/.test(range)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Parameter kitab atau rentang tidak valid.' }) };
  }

  const [start, end] = range.split('-').map(Number);
  const perPage = Math.min(Math.max(end - start + 1, 1), 50);
  const page = Math.max(Math.floor((start - 1) / perPage) + 1, 1);
  const bookSlug = book === 'tirmidzi' ? 'tirmidzi' : book;
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600'
  };

  try {
    const url = `https://api.housemuslim.org/api/v1/hadith/books/${bookSlug}/items?page=${page}&per_page=${perPage}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(`Sumber House Muslim merespons ${response.status}`);
    const json = await response.json();
    if (!json?.success || !Array.isArray(json?.data)) throw new Error('Format data House Muslim tidak dikenali');

    const hadiths = json.data
      .filter(h => Number(h.number) >= start && Number(h.number) <= end)
      .map(h => ({
        number: h.number,
        arab: h.arab || '',
        id: h.translation_id || ''
      }));
    if (!hadiths.length) throw new Error('Tidak ada hadits pada rentang yang diminta');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: { hadiths }, source: 'House Muslim API' })
    };
  } catch (error) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: error?.message || 'API Hadits gagal diakses.' })
    };
  }
};
