const fs = require('fs');

const original = fs.readFileSync('/home/ubuntu/yt-music-app/lovable_master_prompt.txt', 'utf8');

// Compact without removing any words:
// 1. Remove delimiter lines like "========================================="
// 2. Collapse double newlines and extra spaces
let compacted = original
  .replace(/={5,}/g, '')
  .replace(/\n\s*\n+/g, '\n')
  .replace(/  +/g, ' ')
  .trim();

fs.writeFileSync('/home/ubuntu/yt-music-app/monkeycode_prompt.txt', compacted);

console.log('Original length:', original.length);
console.log('Compacted length:', compacted.length);
console.log('Characters saved without deleting any words:', original.length - compacted.length);
