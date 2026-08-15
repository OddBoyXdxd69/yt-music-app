const play = require('play-dl');

async function test() {
  const start = Date.now();
  try {
    const stream = await play.stream('https://youtu.be/dQw4w9WgXcQ');
    console.log(`✅ play-dl stream in ${Date.now() - start}ms! URL: ${stream.url.slice(0, 80)}...`);
  } catch (e) {
    console.error('play-dl error:', e.message);
  }
}
test();
