const play = require('play-dl');
const axios = require('axios');

async function testPlayDL() {
  console.log('Testing play-dl search and stream...');
  try {
    const searchRes = await play.search('Starboy The Weeknd', { limit: 1 });
    if (searchRes && searchRes.length > 0) {
      console.log('play-dl found:', searchRes[0].title, searchRes[0].url);
      const stream = await play.stream(searchRes[0].url);
      console.log('play-dl stream type:', stream.type, 'has url/stream:', !!stream.stream);
    }
  } catch (err) {
    console.error('play-dl error:', err.message);
  }
}

async function testLavalinkSearch() {
  console.log('Testing Lavalink search on Jirayu SSL...');
  try {
    const res = await axios.get('https://lavalink.jirayu.net/v4/loadtracks?identifier=ytsearch:Starboy+The+Weeknd', {
      headers: { 'Authorization': 'youshallnotpass' },
      timeout: 5000
    });
    console.log('Lavalink loadType:', res.data.loadType, 'tracks found:', res.data.data?.length || 0);
    if (res.data.data && res.data.data.length > 0) {
      console.log('Top track:', res.data.data[0].info.title, res.data.data[0].info.author);
    }
  } catch (err) {
    console.error('Lavalink error:', err.message);
  }
}

async function run() {
  await testLavalinkSearch();
  await testPlayDL();
}

run();
