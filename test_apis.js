const axios = require('axios');

const pipedInstances = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://piped-api.lunar.icu',
  'https://pipedapi.adminforge.de',
  'https://api.piped.projectsegfau.lt',
  'https://pipedapi.in.projectsegfau.lt',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.drgns.space',
  'https://api-piped.mha.fi'
];

const invidiousInstances = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.projectsegfau.lt',
  'https://invidious.perennialte.ch',
  'https://iv.ggtyler.dev',
  'https://invidious.privacydev.net'
];

async function testPiped() {
  console.log('--- Testing Piped instances ---');
  for (const url of pipedInstances) {
    try {
      const res = await axios.get(`${url}/streams/dQw4w9WgXcQ`, { timeout: 4000 });
      if (res.data && res.data.audioStreams && res.data.audioStreams.length > 0) {
        console.log(`✅ Piped working: ${url} (streams: ${res.data.audioStreams.length}, title: ${res.data.title})`);
      } else {
        console.log(`⚠️ Piped no audio streams: ${url}`);
      }
    } catch (e) {
      console.log(`❌ Piped failed: ${url} (${e.message})`);
    }
  }
}

async function testInvidious() {
  console.log('\n--- Testing Invidious instances ---');
  for (const url of invidiousInstances) {
    try {
      const res = await axios.get(`${url}/api/v1/videos/dQw4w9WgXcQ`, { timeout: 4000 });
      if (res.data && res.data.adaptiveFormats) {
        const audio = res.data.adaptiveFormats.filter(f => f.type && f.type.startsWith('audio'));
        console.log(`✅ Invidious working: ${url} (audio streams: ${audio.length}, title: ${res.data.title})`);
      } else {
        console.log(`⚠️ Invidious unexpected format: ${url}`);
      }
    } catch (e) {
      console.log(`❌ Invidious failed: ${url} (${e.message})`);
    }
  }
}

async function testCobalt() {
  console.log('\n--- Testing Cobalt instances ---');
  const cobaltInstances = [
    'https://co.wuk.sh',
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekm.tokyo',
    'https://cobalt.xy2401.top'
  ];
  for (const url of cobaltInstances) {
    try {
      const res = await axios.post(`${url}/api/json`, {
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        audioFormat: 'mp3',
        isAudioOnly: true
      }, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        timeout: 4000
      });
      console.log(`✅ Cobalt working: ${url}`, res.data?.url ? 'Got stream url' : res.data);
    } catch (e) {
      console.log(`❌ Cobalt failed: ${url} (${e.message})`);
    }
  }
}

async function run() {
  await testPiped();
  await testInvidious();
  await testCobalt();
}

run();
