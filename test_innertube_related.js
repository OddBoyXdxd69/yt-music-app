const axios = require('axios');

async function getRelated(videoId) {
  try {
    const res = await axios.post('https://www.youtube.com/youtubei/v1/next', {
      videoId: videoId,
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
    const results = res.data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results || [];
    for (const item of results) {
      const cr = item.compactVideoRenderer;
      if (cr && cr.videoId) {
        items.push({
          id: cr.videoId,
          title: cr.title?.simpleText || cr.title?.runs?.[0]?.text || '',
          author: cr.shortBylineText?.runs?.[0]?.text || '',
          durationFormatted: cr.lengthText?.simpleText || '3:30',
          artwork: cr.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${cr.videoId}/hqdefault.jpg`
        });
      }
    }
    console.log(`✅ InnerTube Related Success! Found ${items.length} related songs.`);
    console.log('Sample related track:', items[0]);
  } catch (e) {
    console.error('InnerTube related error:', e.message);
  }
}

getRelated('fcnDmrtj6Sk');
