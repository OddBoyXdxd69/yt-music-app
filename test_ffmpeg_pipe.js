const { spawn } = require('child_process');

function streamFastMp3(id) {
  const ytdl = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', [
    '--cookies', '/home/ubuntu/cookies.txt',
    '-f', 'ba/b',
    '-o', '-',
    '--no-playlist',
    `https://www.youtube.com/watch?v=${id}`
  ]);

  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '192k',
    '-f', 'mp3',
    'pipe:1'
  ]);

  ytdl.stdout.pipe(ffmpeg.stdin);

  let bytes = 0;
  ffmpeg.stdout.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 80000) {
      console.log(`✅ Converted and streamed ${bytes} bytes of high-quality 192kbps MP3 audio!`);
      ytdl.kill();
      ffmpeg.kill();
      process.exit(0);
    }
  });

  ffmpeg.on('error', e => console.error('FFmpeg error:', e));
  ytdl.on('error', e => console.error('YTDL error:', e));
}

streamFastMp3('dQw4w9WgXcQ');
