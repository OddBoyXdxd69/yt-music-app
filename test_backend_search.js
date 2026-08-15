const axios = require('axios');

const LAVALINK_NODES = [
  { name: 'Jirayu SSL', url: 'https://lavalink.jirayu.net/v4/loadtracks', auth: 'youshallnotpass' },
  { name: 'Millohost SSL', url: 'https://lava-v4.millohost.my.id/v4/loadtracks', auth: 'https://discord.gg/mjS5J2K3ep' },
  { name: 'Kasawa', url: 'http://lava2.kasawa.pro:2334/v4/loadtracks', auth: 'youshallnotpass' },
  { name: 'Jirayu Non-SSL', url: 'http://lavalink.jirayu.net:13592/v4/loadtracks', auth: 'youshallnotpass' }
];

async function searchTracks(query) {
  for (const node of LAVALINK_NODES) {
    try {
      const res = await axios.get(node.url, {
        params: { identifier: `ytsearch:${query}` },
        headers: { 'Authorization': node.auth },
        timeout: 4000
      });
      if (res.data && res.data.data && res.data.data.length > 0) {
        return {
          node: node.name,
          tracks: res.data.data.map(item => ({
            encoded: item.encoded,
            identifier: item.info.identifier,
            title: item.info.title,
            author: item.info.author,
            length: item.info.length,
            isSeekable: item.info.isSeekable,
            isStream: item.info.isStream,
            uri: item.info.uri,
            artworkUrl: item.info.artworkUrl || `https://i.ytimg.com/vi/${item.info.identifier}/hqdefault.jpg`
          }))
        };
      }
    } catch (err) {
      console.warn(`Node ${node.name} failed:`, err.message);
    }
  }
  return { error: 'All nodes failed' };
}

searchTracks('Alan Walker Faded').then(res => {
  console.log('Search result from:', res.node, 'Total tracks:', res.tracks?.length);
  if (res.tracks) {
    console.log('Track 1:', res.tracks[0]);
  }
});
