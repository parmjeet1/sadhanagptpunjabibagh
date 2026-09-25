import tripaEnv from '../config/env.js';

/**
 * Fetches the latitude and longitude for a given location string using the OpenCage API.
 * @param {string} locationName - The location to geocode (e.g. "Rishikesh, India")
 * @returns {Promise<{lat: number, lng: number} | null>} - Returns coordinates or null on failure
 */
export const getCoordinates = async (locationName) => {
  if (!locationName || !locationName.trim()) return null;

  const apiKey = tripaEnv.OPENCAGE_API_KEY;
  if (!apiKey) {
    console.warn('[Tripa] Warning: OPENCAGE_API_KEY is not set in .env. Geocoding skipped.');
    return null;
  }

  try {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(locationName)}&key=${apiKey}&limit=1`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[Tripa] Geocoding API failed with status: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry;
      return { lat, lng };
    }
    
    return null; // Location not found
  } catch (error) {
    console.error(`[Tripa] Error geocoding location "${locationName}":`, error.message);
    return null;
  }
};
