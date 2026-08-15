const play = require('play-dl');
const fs = require('fs');

async function test() {
  try {
    // Read Netscape cookie file and parse
    const raw = fs.readFileSync('/home/ubuntu/cookies.txt', 'utf8');
    const cookieHeader = raw.split('\n')
      .filter(l => l && !l.startsWith('#'))
      .map(l => {
        const parts = l.split('\t');
        if (parts.length >= 7) {
          return `${parts[5].trim()}=${parts[6].trim()}`;
        }
        return null;
      })
      .filter(Boolean)
      .join('; ');

    console.log('Setting play-dl token cookie...');
    await play.setToken({
      youtube: {
        cookie: cookieHeader
      }
    });

    const info = await play.video_info('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    console.log('Video Info Success! Title:', info.video_details.title);
    const stream = await play.stream_from_info(info);
    console.log('Stream URL generated:', stream.type, !!stream.url);
  } catch (err) {
    console.error('Play-dl cookie error:', err.message);
  }
}

test();
