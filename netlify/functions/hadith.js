export const handler = async (event) => {
  const book = String(event.queryStringParameters?.book || '').toLowerCase();
  const range = String(event.queryStringParameters?.range || '1-20');
  const allowedBooks = new Set(['bukhari', 'muslim', 'tirmidzi']);
  if (!allowedBooks.has(book) || !/^\\d+-\\d+$/.test(range)) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Parameter kitab atau rentang tidak valid.' }) };
  }
  try {
    const upstream = await fetch(`https://api.hadith.gading.dev/books/${book}?range=${range}`);
    if (!upstream.ok) return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `API Hadits sumber merespons ${upstream.status}` }) };
    const data = await upstream.json();
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }, body: JSON.stringify(data) };
  } catch (err) {
    return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Koneksi ke API Hadits sumber gagal.' }) };
  }
};
