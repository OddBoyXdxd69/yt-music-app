const ytdl = require('@distube/ytdl-core');
const fs = require('fs');

async function test() {
  try {
    const raw = fs.readFileSync('/home/ubuntu/cookies.txt', 'utf8');
    const cookies = raw.split('\n')
      .filter(l => l && !l.startsWith('#'))
      .map(l => {
        const parts = l.split('\t');
        if (parts.length >= 7) {
          return {
            name: parts[5].trim(),
            value: parts[6].trim(),
            domain: parts[0].trim(),
            path: parts[2].trim(),
            secure: parts[3].trim() === 'TRUE',
            expires: parseInt(parts[4].trim(), 10)
          };
        }
        return null;
      })
      .filter(Boolean);

    const agent = ytdl.createAgent(cookies);
    console.log('Testing @distube/ytdl-core with cookies agent...');
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { agent });
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
    console.log('Format URL deciphered:', !!format.url, 'url preview:', format.url ? format.url.slice(0, 60) : 'none');
  } catch (err) {
    console.error('@distube/ytdl error:', err.message);
  }
}

test();
