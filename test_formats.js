const play = require('play-dl');
const fs = require('fs');

async function test() {
  const raw = fs.readFileSync('/home/ubuntu/cookies.txt', 'utf8');
  const cookieHeader = raw.split('\n')
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const parts = l.split('\t');
      if (parts.length >= 7) return `${parts[5].trim()}=${parts[6].trim()}`;
      return null;
    })
    .filter(Boolean)
    .join('; ');

  await play.setToken({ youtube: { cookie: cookieHeader } });
  const info = await play.video_info('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  console.log('Total formats:', info.format?.length);
  const audioFormats = info.format?.filter(f => f.mimeType && f.mimeType.includes('audio'));
  console.log('Audio formats found:', audioFormats?.map(f => ({
    itag: f.itag,
    mimeType: f.mimeType,
    bitrate: f.bitrate,
    hasUrl: !!f.url,
    urlPreview: f.url ? f.url.slice(0, 60) : null
  })));
}

test();
