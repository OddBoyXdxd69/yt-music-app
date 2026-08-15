const play = require('play-dl');
const fs = require('fs');

async function test() {
  try {
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
    const stream = await play.stream_from_info(info);
    console.log('Stream type:', stream.type);

    let bytesReceived = 0;
    stream.stream.on('data', chunk => {
      bytesReceived += chunk.length;
      if (bytesReceived > 100000) {
        console.log(`✅ Successfully received ${bytesReceived} audio bytes from stream!`);
        stream.stream.destroy();
        process.exit(0);
      }
    });

    stream.stream.on('error', err => {
      console.error('Stream error:', err.message);
      process.exit(1);
    });
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
