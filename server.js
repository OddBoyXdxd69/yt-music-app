const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

// Lavalink Node Pool with live health checking
const LAVALINK_NODES = [
  { id: 'millohost-ssl', name: 'Millohost SSL (Fast)', url: 'https://lava-v4.millohost.my.id', port: 443, auth: 'https://discord.gg/mjS5J2K3ep', isSSL: true, status: 'online', ping: 150 },
  { id: 'kasawa-nonssl', name: 'Kasawa v4 (Backup)', url: 'http://lava2.kasawa.pro:2334', port: 2334, auth: 'youshallnotpass', isSSL: false, status: 'online', ping: 480 },
  { id: 'jirayu-nonssl', name: 'Jirayu Direct', url: 'http://lavalink.jirayu.net:13592', port: 13592, auth: 'youshallnotpass', isSSL: false, status: 'online', ping: 510 },
  { id: 'jirayu-ssl', name: 'Jirayu SSL (Primary)', url: 'https://lavalink.jirayu.net', port: 443, auth: 'youshallnotpass', isSSL: true, status: 'online', ping: 850 },
];

async function updateNodeStatus() {
  for (const node of LAVALINK_NODES) {
    const start = Date.now();
    try {
      const res = await axios.get(`${node.url}/v4/info`, {
        headers: { 'Authorization': node.auth },
        timeout: 3500
      });
      node.status = (res.status === 200) ? 'online' : 'degraded';
      node.ping = Date.now() - start;
      node.version = res.data?.version?.semver || '4.x';
    } catch (e) {
      try {
        const testSearch = await axios.get(`${node.url}/v4/loadtracks?identifier=ytsearch:test`, {
          headers: { 'Authorization': node.auth },
          timeout: 3500
        });
        node.status = (testSearch.status === 200) ? 'online' : 'error';
        node.ping = Date.now() - start;
        node.version = '4.x';
      } catch (err2) {
        node.status = 'offline';
        node.ping = 9999;
      }
    }
  }
}

updateNodeStatus();
setInterval(updateNodeStatus, 30000);

async function queryLavalink(identifier) {
  const sortedNodes = [...LAVALINK_NODES].sort((a, b) => (a.status === 'online' ? 0 : 1) - (b.status === 'online' ? 0 : 1) || a.ping - b.ping);
  
  for (const node of sortedNodes) {
    if (node.status === 'offline') continue;
    try {
      const endpoint = `${node.url}/v4/loadtracks`;
      const res = await axios.get(endpoint, {
        params: { identifier },
        headers: { 'Authorization': node.auth },
        timeout: 5000
      });

      if (res.data) {
        let tracks = [];
        if (res.data.loadType === 'search' || res.data.loadType === 'track') {
          tracks = res.data.data || [];
        } else if (res.data.loadType === 'playlist') {
          tracks = res.data.data?.tracks || [];
        } else if (Array.isArray(res.data.tracks)) {
          tracks = res.data.tracks;
        }

        if (tracks.length > 0) {
          return {
            sourceNode: node.name,
            loadType: res.data.loadType,
            playlistInfo: res.data.data?.info || null,
            tracks: tracks.map(t => {
              const info = t.info || {};
              const id = info.identifier || info.id || '';
              return {
                id: id,
                title: cleanTitle(info.title || 'Unknown Title'),
                author: info.author || 'Unknown Artist',
                duration: info.length || 0,
                durationFormatted: formatDuration(info.length || 0),
                isStream: info.isStream || false,
                uri: info.uri || (id ? `https://www.youtube.com/watch?v=${id}` : ''),
                artwork: info.artworkUrl || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : ''),
                artworkHigh: id ? `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` : (info.artworkUrl || '')
              };
            })
          };
        }
      }
    } catch (err) {
      console.warn(`[Lavalink] Node ${node.name} failed:`, err.message);
    }
  }

  throw new Error('All Lavalink nodes failed to resolve track.');
}

function cleanTitle(title) {
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

function formatDuration(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// 1. Search endpoint
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Query required' });
  try {
    const identifier = (query.startsWith('http://') || query.startsWith('https://')) ? query : `ytsearch:${query}`;
    const result = await queryLavalink(identifier);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message, tracks: [] });
  }
});

// 2. Direct Audio Stream Pipe (High Quality MP3 / Opus Stream)
app.get('/api/stream', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send('ID required');

  console.log(`🎵 Streaming audio for track: ${id}`);

  res.header('Content-Type', 'audio/mpeg');
  res.header('Accept-Ranges', 'bytes');
  res.header('Cache-Control', 'no-cache');

  const ytdlArgs = [
    '--cookies', '/home/ubuntu/cookies.txt',
    '-f', 'ba/b',
    '-o', '-',
    '--no-playlist',
    `https://www.youtube.com/watch?v=${id}`
  ];

  const ytdl = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', ytdlArgs);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  ytdl.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  req.on('close', () => {
    try { ytdl.kill(); } catch (e) {}
    try { ffmpeg.kill(); } catch (e) {}
  });

  ytdl.on('error', err => {
    console.error('YTDL spawn error:', err.message);
    if (!res.headersSent) res.status(500).send('Stream error');
  });

  ffmpeg.on('error', err => {
    console.error('FFmpeg spawn error:', err.message);
    if (!res.headersSent) res.status(500).send('FFmpeg error');
  });
});

// 3. Related tracks / Infinite Auto-Queue
app.get('/api/related', async (req, res) => {
  const { id, title, author } = req.query;
  if (!title && !author) return res.status(400).json({ error: 'Title or author required' });

  try {
    const searchTerms = [
      `ytsearch:${author} top songs`,
      `ytsearch:${title} ${author} mix`,
      `ytsearch:${author} playlist`,
      `ytsearch:${title} recommended songs`
    ];

    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    const result = await queryLavalink(randomTerm);
    const filteredTracks = (result.tracks || []).filter(t => t.id !== id);
    res.json({ source: result.sourceNode, tracks: filteredTracks });
  } catch (err) {
    res.status(500).json({ error: err.message, tracks: [] });
  }
});

// 4. Autocomplete suggestions
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

// 5. Curated Categories
const CURATED_CATEGORIES = {
  trending: 'Top Trending Hits 2026',
  charts: 'Global Top 50 Songs',
  lofi: 'Lofi Hip Hop Chill Beats to Relax',
  gaming: 'Gaming Synthwave Electro Music',
  pop: 'Billboard Hot 100 Hits',
  rock: 'Classic Rock & Modern Hits',
  hiphop: 'Top Hip Hop & Rap Hits',
  workout: 'High Energy Workout EDM Mix'
};

const trendingCache = new Map();

app.get('/api/category/:cat', async (req, res) => {
  const cat = req.params.cat || 'trending';
  const queryText = CURATED_CATEGORIES[cat] || CURATED_CATEGORIES['trending'];

  if (trendingCache.has(cat)) {
    const cached = trendingCache.get(cat);
    if (Date.now() - cached.timestamp < 3600000) {
      return res.json(cached.data);
    }
  }

  try {
    const result = await queryLavalink(`ytsearch:${queryText}`);
    trendingCache.set(cat, { timestamp: Date.now(), data: result });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch category', tracks: [] });
  }
});

// 6. Synced Lyrics API
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

// 7. Node Status
app.get('/api/nodes/status', (req, res) => {
  res.json({
    updatedAt: new Date().toISOString(),
    cookiesLoaded: fs.existsSync('/home/ubuntu/cookies.txt'),
    nodes: LAVALINK_NODES.map(n => ({
      id: n.id,
      name: n.name,
      host: n.url,
      port: n.port,
      isSSL: n.isSSL,
      status: n.status,
      ping: n.ping < 9999 ? `${n.ping}ms` : 'N/A',
      version: n.version || '4.x'
    }))
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 YT Studio Audio Player server running on http://localhost:${PORT}`);
});
