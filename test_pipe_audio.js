const { spawn } = require('child_process');

function streamAudio(id) {
  // Use yt-dlp + ffmpeg to stream audio directly as mp3/opus
  const args = [
    '--cookies', '/home/ubuntu/cookies.txt',
    '-f', 'ba/b',
    '-o', '-',
    '--no-playlist',
    '--buffer-size', '16K',
    `https://www.youtube.com/watch?v=${id}`
  ];

  const proc = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', args);
  let bytes = 0;

  proc.stdout.on('data', chunk => {
    bytes += chunk.length;
    if (bytes > 50000) {
      console.log(`✅ Received ${bytes} bytes of raw audio stream directly!`);
      proc.kill();
      process.exit(0);
    }
  });

  proc.stderr.on('data', data => {
    // console.log('yt-dlp stderr:', data.toString());
  });

  proc.on('close', code => {
    console.log('Proc closed with code', code);
  });
}

streamAudio('dQw4w9WgXcQ');
