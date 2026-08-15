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
          const domain = parts[0].trim();
          if (domain.includes('youtube.com') || domain.includes('google.com')) {
            return {
              name: parts[5].trim(),
              value: parts[6].trim(),
              domain: domain.startsWith('.') ? domain.slice(1) : domain,
              path: parts[2].trim(),
              secure: parts[3].trim() === 'TRUE',
              expires: parseInt(parts[4].trim(), 10)
            };
          }
        }
        return null;
      })
      .filter(Boolean);

    console.log(`Loaded ${cookies.length} YouTube cookies.`);
    const agent = ytdl.createAgent(cookies);
    console.log('Fetching info with ytdl agent...');
    const info = await ytdl.getInfo('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { agent });
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
    console.log('✅ Deciphered Stream URL:', !!format.url, 'MimeType:', format.mimeType, 'Bitrate:', format.audioBitrate);
    if (format.url) {
      console.log('Stream URL snippet:', format.url.slice(0, 80) + '...');
    }
  } catch (err) {
    console.error('YTDL Error:', err.message);
  }
}

test();
