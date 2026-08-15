const axios = require('axios');

async function testSuggest(query) {
  try {
    const res = await axios.get(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`);
    console.log('Suggestions:', res.data[1]);
  } catch (e) {
    console.error('Suggest error:', e.message);
  }
}

testSuggest('Taylor');
