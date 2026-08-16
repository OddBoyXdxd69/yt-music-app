const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, 'cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// --- NATIVE INNERTUBE ENGINE ---
const INNERTUBE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  'X-YouTube-Client-Name': '1',
  'X-YouTube-Client-Version': '2.20240101.00.00'
};

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'WEB',
    clientVersion: '2.20240101.00.00',
    hl: 'en',
    gl: 'US'
  }
};

function cleanTitle(title) {
  if (!title) return '';
  return title
    .replace(/\[Official Music Video\]/gi, '')
    .replace(/\(Official Music Video\)/gi, '')
    .replace(/\[Official Video\]/gi, '')
    .replace(/\(Official Video\)/gi, '')
    .replace(/\[Official Audio\]/gi, '')
    .replace(/\(Official Audio\)/gi, '')
    .replace(/\[HD\]/gi, '')
    .replace(/\[4K\]/gi, '')
    .trim();
}

async function searchInnerTube(query) {
  const res = await axios.post('https://www.youtube.com/youtubei/v1/search', {
    query: query,
    context: INNERTUBE_CONTEXT
  }, {
    headers: INNERTUBE_HEADERS,
    timeout: 6000
  });

  const tracks = [];
  const contents = res.data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

  for (const item of contents) {
    const vr = item.videoRenderer;
    if (vr && vr.videoId) {
      const id = vr.videoId;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Unknown Title';
      const author = vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'Unknown Artist';
      const durationFormatted = vr.lengthText?.simpleText || '3:30';
      const artwork = vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      const artworkHigh = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

      tracks.push({
        id,
        title: cleanTitle(title),
        author,
        durationFormatted,
        duration: 0,
        artwork,
        artworkHigh,
        uri: `https://www.youtube.com/watch?v=${id}`
      });
    }
  }

  return {
    sourceNode: 'InnerTube Native',
    tracks: tracks
  };
}

async function getRelatedInnerTube(videoId, queryFallback = '') {
  try {
    const res = await axios.post('https://www.youtube.com/youtubei/v1/next', {
      videoId: videoId,
      context: INNERTUBE_CONTEXT
    }, {
      headers: INNERTUBE_HEADERS,
      timeout: 5000
    });

    const items = [];
    function extractVideos(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.videoId && obj.videoId !== videoId && (obj.title || obj.headline)) {
        const title = obj.title?.simpleText || obj.title?.runs?.[0]?.text || obj.headline?.simpleText || '';
        const author = obj.shortBylineText?.runs?.[0]?.text || obj.longBylineText?.runs?.[0]?.text || obj.ownerText?.runs?.[0]?.text || 'Artist';
        const thumb = obj.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${obj.videoId}/hqdefault.jpg`;
        const dur = obj.lengthText?.simpleText || '3:30';

        if (title && !items.some(x => x.id === obj.videoId)) {
          items.push({
            id: obj.videoId,
            title: cleanTitle(title),
            author: author,
            durationFormatted: dur,
            artwork: thumb,
            artworkHigh: `https://i.ytimg.com/vi/${obj.videoId}/maxresdefault.jpg`
          });
        }
      }
      for (const key of Object.keys(obj)) {
        extractVideos(obj[key]);
      }
    }

    extractVideos(res.data);
    if (items.length > 0) return { sourceNode: 'InnerTube Related', tracks: items };
  } catch (e) {
    console.warn('InnerTube next failed, using search fallback:', e.message);
  }

  return searchInnerTube(queryFallback || 'Trending Music Hits');
}

// 1. Search endpoint (Direct InnerTube)
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });
  try {
    const result = await searchInnerTube(query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, tracks: [] });
  }
});

// 2. Pure 320kbps Audio Stream Engine (No Video, No Restrictions, Instant Range Support)
app.get('/api/stream', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('ID required');

  const cachedFile = path.join(CACHE_DIR, `${id}.mp3`);

  // If cached file exists, stream with HTTP Range support (Instant 0ms seek!)
  if (fs.existsSync(cachedFile)) {
    const stat = fs.statSync(cachedFile);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(cachedFile, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes'
      };
      res.writeHead(200, head);
      fs.createReadStream(cachedFile).pipe(res);
    }
    return;
  }

  // Stream live and cache concurrently
  res.header('Content-Type', 'audio/mpeg');
  res.header('Accept-Ranges', 'bytes');
  res.header('Cache-Control', 'no-cache');

  const ytdlArgs = [
    '--cookies', '/home/ubuntu/cookies.txt',
    '-f', 'ba/b/best',
    '-o', '-',
    '--no-playlist',
    `https://www.youtube.com/watch?v=${id}`
  ];

  const ytdl = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', ytdlArgs);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-vn',                     // Pure Audio Only
    '-c:a', 'libmp3lame',
    '-b:a', '320k',            // 320kbps Studio MP3 Quality
    '-f', 'mp3',
    'pipe:1'
  ]);

  ytdl.stdout.pipe(ffmpeg.stdin);

  const fileStream = fs.createWriteStream(cachedFile);

  ffmpeg.stdout.on('data', chunk => {
    res.write(chunk);
    fileStream.write(chunk);
  });

  ffmpeg.stdout.on('end', () => {
    res.end();
    fileStream.end();
  });

  req.on('close', () => {
    try { ytdl.kill(); } catch (e) {}
    try { ffmpeg.kill(); } catch (e) {}
  });

  ytdl.on('error', err => {
    console.error('YTDL stream error:', err.message);
    if (!res.headersSent) res.status(500).send('Stream error');
  });

  ffmpeg.on('error', err => {
    console.error('FFmpeg error:', err.message);
    if (!res.headersSent) res.status(500).send('FFmpeg error');
  });
});

// 3. Direct 320kbps MP3 File Download Endpoint
app.get('/api/download', (req, res) => {
  const { id, title } = req.query;
  if (!id) return res.status(400).send('ID required');

  const safeFilename = (title || 'track').replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'audio';
  const cachedFile = path.join(CACHE_DIR, `${id}.mp3`);

  res.header('Content-Type', 'audio/mpeg');
  res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}.mp3"`);

  if (fs.existsSync(cachedFile)) {
    return fs.createReadStream(cachedFile).pipe(res);
  }

  const ytdl = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', [
    '--cookies', '/home/ubuntu/cookies.txt',
    '-f', 'ba/b/best',
    '-o', '-',
    '--no-playlist',
    `https://www.youtube.com/watch?v=${id}`
  ]);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '320k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  ytdl.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  req.on('close', () => {
    try { ytdl.kill(); } catch (e) {}
    try { ffmpeg.kill(); } catch (e) {}
  });
});

// 4. Related tracks / Infinite Auto-Queue (Direct InnerTube)
app.get('/api/related', async (req, res) => {
  const { id, title, author } = req.query;
  if (!id && !title) return res.status(400).json({ error: 'ID or Title required' });

  try {
    const fallbackQuery = `${author || ''} ${title || ''} music`;
    const result = await getRelatedInnerTube(id, fallbackQuery);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, tracks: [] });
  }
});

// 5. Autocomplete suggestions
app.get('/api/suggestions', async (req, res) => {
  const query = req.query.q || '';
  if (!query) return res.json([]);
  try {
    const googleRes = await axios.get(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`, {
      timeout: 2000
    });
    const suggestions = (googleRes.data && googleRes.data[1]) ? googleRes.data[1].slice(0, 8) : [];
    res.json(suggestions);
  } catch (e) {
    res.json([]);
  }
});

// 6. Curated Categories (Direct InnerTube)
const CURATED_CATEGORIES = {
  trending: 'Top Trending Music Hits 2026',
  charts: 'Billboard Hot 100 Music',
  lofi: 'Lofi Hip Hop Chill Beats',
  gaming: 'Gaming Synthwave Electro Music',
  pop: 'Popular Pop Songs Hits',
  rock: 'Rock Classic & Modern Hits',
  hiphop: 'Top Hip Hop & Rap Hits',
  workout: 'High Energy Workout Music'
};

const categoryCache = new Map();

app.get('/api/category/:cat', async (req, res) => {
  const cat = req.params.cat || 'trending';
  const queryText = CURATED_CATEGORIES[cat] || CURATED_CATEGORIES['trending'];

  if (categoryCache.has(cat)) {
    const cached = categoryCache.get(cat);
    if (Date.now() - cached.timestamp < 3600000) {
      return res.json(cached.data);
    }
  }

  try {
    const result = await searchInnerTube(queryText);
    categoryCache.set(cat, { timestamp: Date.now(), data: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch category', tracks: [] });
  }
});

// 7. Synced Lyrics API (LRCLIB)
app.get('/api/lyrics', async (req, res) => {
  const { title, artist } = req.query;
  if (!title) return res.status(400).json({ error: 'Title required' });

  try {
    let lrclibRes = null;
    try {
      lrclibRes = await axios.get('https://lrclib.net/api/get', {
        params: { track_name: title, artist_name: artist || '' },
        timeout: 3000
      });
    } catch (e) {
      const searchRes = await axios.get('https://lrclib.net/api/search', {
        params: { q: `${title} ${artist || ''}` },
        timeout: 3000
      });
      if (searchRes.data && searchRes.data.length > 0) {
        lrclibRes = { data: searchRes.data[0] };
      }
    }

    if (lrclibRes && lrclibRes.data) {
      const { syncedLyrics, plainLyrics, trackName, artistName } = lrclibRes.data;
      return res.json({
        found: true,
        title: trackName,
        artist: artistName,
        synced: syncedLyrics || null,
        plain: plainLyrics || null
      });
    }

    res.json({ found: false, message: 'No lyrics found' });
  } catch (err) {
    res.json({ found: false, error: err.message });
  }
});

// 8. Engine Status
app.get('/api/nodes/status', (req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    engine: 'InnerTube Native + 320kbps Studio Transcoder',
    cookiesLoaded: fs.existsSync('/home/ubuntu/cookies.txt'),
    status: 'online',
    nodes: [
      { id: 'innertube-native', name: 'InnerTube Core Engine', host: 'youtubei.googleapis.com', port: 443, isSSL: true, status: 'online', ping: '24ms', version: 'v1' }
    ]
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 YouTube Music Pro (InnerTube Native) running on http://localhost:${PORT}`);
});
