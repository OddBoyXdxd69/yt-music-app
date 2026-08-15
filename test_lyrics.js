const axios = require('axios');

async function testLyrics(trackName, artistName) {
  try {
    const res = await axios.get('https://lrclib.net/api/get', {
      params: { track_name: trackName, artist_name: artistName },
      timeout: 3000
    });
    console.log('Lrclib found lyrics for', trackName, ':', res.data?.syncedLyrics ? 'Synced lyrics available!' : 'Plain lyrics available');
  } catch (e) {
    try {
      const searchRes = await axios.get('https://lrclib.net/api/search', {
        params: { q: `${trackName} ${artistName}` },
        timeout: 3000
      });
      if (searchRes.data && searchRes.data.length > 0) {
        console.log('Lrclib search found:', searchRes.data[0].trackName, 'by', searchRes.data[0].artistName);
      } else {
        console.log('Lrclib search no results');
      }
    } catch (err2) {
      console.log('Lrclib error:', err2.message);
    }
  }
}

testLyrics('Faded', 'Alan Walker');
