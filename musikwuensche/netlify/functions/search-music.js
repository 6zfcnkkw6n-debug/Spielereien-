// Proxy zur iTunes Search API: iTunes' CORS-Header sind unzuverlässig, daher
// server-to-server abfragen statt direkt aus dem Browser.
const ITUNES_URL = 'https://itunes.apple.com/search';
const RESULT_LIMIT = 15;
const MAX_QUERY_LENGTH = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.time > CACHE_TTL_MS) cache.delete(key);
  }
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const rawQuery = (event.queryStringParameters && event.queryStringParameters.q) || '';
  const query = rawQuery.trim();

  if (!query) return jsonResponse(200, { results: [] });
  if (query.length > MAX_QUERY_LENGTH) return jsonResponse(400, { error: 'Suchbegriff zu lang.' });

  const cacheKey = query.toLowerCase();
  pruneCache();
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      body: JSON.stringify({ results: cached.data }),
    };
  }

  const url = `${ITUNES_URL}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=${RESULT_LIMIT}&country=DE`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return jsonResponse(502, { error: 'Musiksuche momentan nicht erreichbar.' });

    const data = await res.json();
    const results = (data.results || [])
      .filter((r) => r.trackName && r.artistName)
      .map((r) => ({
        id: r.trackId,
        title: r.trackName,
        artist: r.artistName,
        album: r.collectionName || '',
        artwork: r.artworkUrl60 || r.artworkUrl100 || '',
      }));

    cache.set(cacheKey, { data: results, time: Date.now() });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      body: JSON.stringify({ results }),
    };
  } catch (err) {
    return jsonResponse(502, { error: 'Musiksuche momentan nicht erreichbar.' });
  }
};
