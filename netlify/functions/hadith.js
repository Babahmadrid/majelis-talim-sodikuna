export const handler = async (event) => {
  const book = String(event.queryStringParameters?.book || '').toLowerCase();
  const range = String(event.queryStringParameters?.range || '1-20');
  const allowedBooks = new Set(['bukhari', 'muslim', 'tirmidzi']);
  if (!allowedBooks.has(book) || !/^\\d+-\\d+$/.test(range)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Parameter kitab atau rentang tidak valid.' }) };
  }

  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' };
  const urls = [
    `https://api.hadith.gading.dev/books/${book}?range=${range}`,
    `https://api-hadis.vercel.app/books/${book}?range=${range}`
  ];

  for (const url of urls) {
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!upstream.ok) continue;
      const data = await upstream.json();
      if (Array.isArray(data?.data?.hadiths)) {
        return { statusCode: 200, headers, body: JSON.stringify(data) };
      }
    } catch (err) {
      // Try the alternate public API if the first provider is unavailable.
    }
  }
  return { statusCode: 502, headers, body: JSON.stringify({ error: 'Semua sumber API Hadits sedang tidak dapat diakses.' }) };
};
