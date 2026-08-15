const play = require('play-dl');

async function test() {
  const start = Date.now();
  try {
    const stream = await play.stream('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    console.log(`✅ play-dl resolved audio stream in ${Date.now() - start}ms! Type: ${stream.type}`);
  } catch (e) {
    console.error('play-dl error:', e.message);
  }
}
test();
