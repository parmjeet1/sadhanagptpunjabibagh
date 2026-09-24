import { getCoordinates } from './geocoder.js';

async function test() {
  console.log('Testing geocoder...');
  const coords = await getCoordinates('Rishikesh, India');
  console.log('Coordinates for Rishikesh:', coords);
}

test();
