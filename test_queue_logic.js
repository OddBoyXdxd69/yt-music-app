// Quick test of smart deduplication & queue logic
const tracks = [
  { id: '1', title: 'Song A (Official Audio)', author: 'Artist 1' },
  { id: '2', title: 'Song B', author: 'Artist 2' },
  { id: '1', title: 'Song A', author: 'Artist 1' },
  { id: '3', title: 'Song C [4K]', author: 'Artist 3' }
];

function dedupe(queue) {
  const seenIds = new Set();
  const seenTitles = new Set();
  return queue.filter(t => {
    const cleanT = t.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seenIds.has(t.id) || seenTitles.has(cleanT)) return false;
    seenIds.add(t.id);
    seenTitles.add(cleanT);
    return true;
  });
}

console.log('Deduped count:', dedupe(tracks).length);
