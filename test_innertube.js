const axios = require('axios');

async function searchInnerTube(query) {
  try {
    const res = await axios.post('https://www.youtube.com/youtubei/v1/search', {
      query: query,
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20240101.00.00',
          hl: 'en',
          gl: 'US'
        }
      }
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Content-Type': 'application/json'
      }
    });

    const items = [];
    const contents = res.data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];
    for (const item of contents) {
      const vr = item.videoRenderer;
      if (vr && vr.videoId) {
        items.push({
          id: vr.videoId,
          title: vr.title?.runs?.[0]?.text || '',
          author: vr.ownerText?.runs?.[0]?.text || '',
          durationFormatted: vr.lengthText?.simpleText || '3:30',
          artwork: vr.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${vr.videoId}/hqdefault.jpg`
        });
      }
    }
    console.log(`✅ InnerTube Search Success! Found ${items.length} tracks.`);
    console.log('Sample track:', items[0]);
  } catch (e) {
    console.error('InnerTube search error:', e.message);
  }
}

searchInnerTube('Shakira Dai Dai');
