const { spawn } = require('child_process');

const start = Date.now();
const proc = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', [
  '--cookies', '/home/ubuntu/cookies.txt',
  '-f', 'ba/b',
  '-o', '-',
  '--buffer-size', '8K',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
]);

let firstByte = false;
proc.stdout.on('data', chunk => {
  if (!firstByte) {
    firstByte = true;
    console.log(`⚡ First audio chunk received in ${Date.now() - start}ms! Size: ${chunk.length} bytes`);
    proc.kill();
    process.exit(0);
  }
});

proc.on('error', e => console.error(e));
