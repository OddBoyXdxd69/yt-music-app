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

    const data = res.data;
    const items = [];
    const sec = data?.contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults?.results 
             || data?.contents?.twoColumnWatchNextResults?.secondaryResults?.sectionListRenderer?.contents 
             || [];
    
    // Recursive search for compactVideoRenderer / videoRenderer
    function extractVideos(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.videoId && (obj.title || obj.headline)) {
        const title = obj.title?.simpleText || obj.title?.runs?.[0]?.text || obj.headline?.simpleText || '';
        const author = obj.shortBylineText?.runs?.[0]?.text || obj.longBylineText?.runs?.[0]?.text || obj.ownerText?.runs?.[0]?.text || '';
        const thumb = obj.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${obj.videoId}/hqdefault.jpg`;
        const dur = obj.lengthText?.simpleText || '3:30';
        if (title && !items.some(x => x.id === obj.videoId)) {
          items.push({ id: obj.videoId, title, author, durationFormatted: dur, artwork: thumb });
        }
      }
      for (const key of Object.keys(obj)) {
        extractVideos(obj[key]);
      }
    }

    extractVideos(data);
    console.log(`✅ Parsed ${items.length} related tracks!`);
    console.log('Sample:', items.slice(0, 3));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

getRelated('fcnDmrtj6Sk');
