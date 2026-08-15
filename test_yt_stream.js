const { spawn } = require('child_process');
const http = require('http');

async function getStreamUrl(id) {
  return new Promise((resolve, reject) => {
    const ytdlProc = spawn('/home/ubuntu/yt-music-app/bin/yt-dlp', [
      '--cookies', '/home/ubuntu/cookies.txt',
      '-g',
      '-f', 'ba/b',
      `https://www.youtube.com/watch?v=${id}`
    ]);

    let stdout = '';
    let stderr = '';

    ytdlProc.stdout.on('data', data => stdout += data);
    ytdlProc.stderr.on('data', data => stderr += data);

    ytdlProc.on('close', code => {
      if (code === 0 && stdout.trim()) {
        const url = stdout.trim().split('\n')[0];
        resolve(url);
      } else {
        reject(new Error(stderr || 'yt-dlp failed'));
      }
    });
  });
}

getStreamUrl('dQw4w9WgXcQ').then(url => {
  console.log('✅ Resolved stream URL in <2s:', url.slice(0, 100) + '...');
}).catch(err => {
  console.error('❌ Error:', err.message);
});
