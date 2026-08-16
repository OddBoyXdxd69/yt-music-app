const axios = require('axios');

async function testAudius() {
  try {
    const hostRes = await axios.get('https://api.audius.co');
    const host = hostRes.data.data[0];
    console.log('✅ Audius Host:', host);

    const searchRes = await axios.get(`${host}/v1/tracks/search?query=electronic&app_name=YTMusicPro`);
    const track = searchRes.data.data[0];
    console.log('✅ Audius Track:', track.title, 'by', track.user.name);
    console.log('✅ Audius Stream URL:', `${host}/v1/tracks/${track.id}/stream?app_name=YTMusicPro`);
  } catch (e) {
    console.error('Audius error:', e.message);
  }
}

testAudius();
