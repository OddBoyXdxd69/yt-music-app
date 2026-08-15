const { spawn } = require('child_process');

function testHighestAudio(id) {
  const ytdl = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', [
    '--cookies', '/home/ubuntu/cookies.txt',
    '-f', 'ba/b/best',
    '-o', '-',
    '--no-playlist',
    `https://www.youtube.com/watch?v=${id}`
  ]);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-vn',                     // No video (pure audio)
    '-c:a', 'libmp3lame',
    '-b:a', '320k',            // Highest possible 320kbps MP3 audio quality
    '-f', 'mp3',
    'pipe:1'
  ]);

  ytdl.stdout.pipe(ffmpeg.stdin);

  let bytes = 0;
  ffmpeg.stdout.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 60000) {
      console.log(`✅ Success! Streamed ${bytes} bytes of pure 320kbps highest quality audio for restricted track ${id}!`);
      ytdl.kill();
      ffmpeg.kill();
      process.exit(0);
    }
  });

  ytdl.stderr.on('data', d => {});
  ffmpeg.stderr.on('data', d => {});
}

testHighestAudio('fcnDmrtj6Sk');
