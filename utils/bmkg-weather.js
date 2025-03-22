// bmkg-weather.js
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file's directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Class to handle BMKG weather data operations
 */
class BMKGWeather {
  constructor(cachePath = null) {
    this.regionData = {};
    this.apiBaseUrl = 'https://api.bmkg.go.id/publik/prakiraan-cuaca';
    this.regionSourceUrl = 'https://raw.githubusercontent.com/kodewilayah/permendagri-72-2019/main/dist/base.csv';
    this.cachePath = cachePath || path.join(__dirname, 'data', 'regions-cache.json');
    this.cacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  }

  /**
   * Load region data from cache or download fresh data
   */
  async loadRegionData() {
    try {
      // Try to load from cache first
      const cacheStats = await fs.stat(this.cachePath).catch(() => null);
      
      // Check if cache exists and is not expired
      if (cacheStats && (Date.now() - cacheStats.mtime.getTime()) < this.cacheExpiry) {
        const data = await fs.readFile(this.cachePath, 'utf8');
        this.regionData = JSON.parse(data);
        console.log('Region data loaded from cache.');
      } else {
        // Cache doesn't exist or is expired, fetch fresh data
        await this.fetchAndCacheRegionData();
      }
    } catch (error) {
      console.warn(`Error loading region data: ${error.message}`);
      await this.fetchAndCacheRegionData();
    }
    
    return this.regionData;
  }

  /**
   * Fetch region data from source URL and cache it
   */
  async fetchAndCacheRegionData() {
    try {
      console.log('Fetching region data from source...');
      const response = await axios.get(this.regionSourceUrl);
      
      // Parse CSV data
      this.regionData = this.parseCSVData(response.data);
      
      // Create directory if it doesn't exist
      const dir = path.dirname(this.cachePath);
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
      
      // Cache the data
      await fs.writeFile(this.cachePath, JSON.stringify(this.regionData, null, 2));
      console.log(`Region data fetched and cached successfully (${Object.keys(this.regionData).length} regions).`);
    } catch (error) {
      console.error(`Failed to fetch region data: ${error.message}`);
      // If fetching fails but we have cached data, use it regardless of age
      try {
        const data = await fs.readFile(this.cachePath, 'utf8');
        this.regionData = JSON.parse(data);
        console.log('Using existing cache due to fetch failure.');
      } catch (cacheError) {
        console.error('No cached data available. Region lookup will not work properly.');
        this.regionData = {};
      }
    }
  }

  /**
   * Parse CSV data with simple "code,name" format
   * @param {string} csvData - Raw CSV data
   * @returns {Object} - Parsed region data
   */
  parseCSVData(csvData) {
    const parsed = {};
    
    // Split by lines and process each line
    const lines = csvData.trim().split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      // Split the line by comma
      const parts = line.split(',');
      
      if (parts.length >= 2) {
        const code = parts[0].trim();
        // Convert name to lowercase for case-insensitive matching
        const name = parts[1].trim().toLowerCase();
        
        // Store in our lookup object
        parsed[name] = code;
      }
    }
    
    return parsed;
  }

  /**
   * Find region code based on region name
   * @param {string} regionName - The name of the region to search for
   * @returns {string|null} - Region code or null if not found
   */
  async findRegionCode(regionName) {
    if (Object.keys(this.regionData).length === 0) {
      await this.loadRegionData();
    }

    const normalizedName = regionName.toLowerCase().trim();
    
    // Direct match
    if (this.regionData[normalizedName]) {
      return this.regionData[normalizedName];
    }
    
    // Partial match (case insensitive)
    for (const [key, value] of Object.entries(this.regionData)) {
      if (key.includes(normalizedName) || normalizedName.includes(key)) {
        return value;
      }
    }
    
    // Fuzzy match (allowing for typos or slight variations)
    const possibleMatches = Object.entries(this.regionData)
      .filter(([key]) => {
        return this.calculateLevenshteinDistance(key, normalizedName) <= 3; // Allow up to 3 character differences
      });
    
    if (possibleMatches.length > 0) {
      // Return the closest match
      possibleMatches.sort((a, b) => {
        return this.calculateLevenshteinDistance(a[0], normalizedName) - 
               this.calculateLevenshteinDistance(b[0], normalizedName);
      });
      
      return possibleMatches[0][1];
    }
    
    return null;
  }

  /**
   * Calculate Levenshtein distance between two strings (for fuzzy matching)
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} - The distance
   */
  calculateLevenshteinDistance(a, b) {
    const matrix = [];
    
    // Initialize the matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill the matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  /**
   * Fetch weather data from BMKG API
   * @param {string} regionCode - The region code to fetch weather data for
   * @returns {Object} - Weather data
   */
  async getWeatherData(regionCode) {
    console.log(regionCode)
    try {
      const response = await axios.get(`${this.apiBaseUrl}?adm4=${regionCode}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching weather data:', error.message);
      throw new Error('Failed to fetch weather data from BMKG');
    }
  }

  /**
   * Format weather data into readable text
   * @param {Object} weatherData - The weather data to format
   * @returns {string} - Formatted weather data text
   */
  formatWeatherData(weatherData) {
    if (!weatherData || !weatherData.data || weatherData.data.length === 0) {
      return 'Tidak ada data cuaca tersedia';
    }

    const location = weatherData.lokasi;
    const forecastData = weatherData.data[0].cuaca;
    
    let formattedText = `PRAKIRAAN CUACA\n`;
    formattedText += `====================\n`;
    formattedText += `Lokasi: ${location.desa}, ${location.kecamatan}, ${location.kotkab}, ${location.provinsi}\n`;
    formattedText += `Koordinat: ${location.lat}°, ${location.lon}°\n`;
    formattedText += `Zona Waktu: ${location.timezone}\n\n`;

    // Get current date to determine day labels
    const currentDate = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    
    // Process each day's forecast
    forecastData.forEach((dayForecast, dayIndex) => {
      // Calculate the day for this forecast
      const forecastDate = new Date(currentDate);
      forecastDate.setDate(currentDate.getDate() + dayIndex);
      const dayName = days[forecastDate.getDay()];
      const formattedDate = forecastDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      
      formattedText += `🗓️ ${dayName}, ${formattedDate}:\n`;
      formattedText += `====================\n`;
      
      dayForecast.forEach(forecast => {
        const localDateTime = new Date(forecast.local_datetime);
        const localTime = localDateTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        
        formattedText += `⏰ ${localTime}\n`;
        formattedText += `   Cuaca: ${forecast.weather_desc}\n`;
        formattedText += `   Suhu: ${forecast.t}°C\n`;
        formattedText += `   Kelembaban: ${forecast.hu}%\n`;
        formattedText += `   Angin: ${forecast.ws} m/s dari ${forecast.wd} ke ${forecast.wd_to}\n`;
        
        // Add rainfall if available
        if (forecast.tp > 0) {
          formattedText += `   Curah Hujan: ${forecast.tp} mm\n`;
        }
        
        formattedText += `   Jarak Pandang: ${forecast.vs_text}\n\n`;
      });
    });

    return formattedText;
  }

  /**
   * Get weather forecast by region name
   * @param {string} regionName - The name of the region
   * @returns {string} - Formatted weather forecast
   */
  async getWeatherForecast(regionName) {
    try {
      const regionCode = await this.findRegionCode(regionName);
      
      if (!regionCode) {
        return `Wilayah '${regionName}' tidak ditemukan. Mohon periksa kembali nama wilayah.`;
      }
      
      const weatherData = await this.getWeatherData(regionCode);
      return this.formatWeatherData(weatherData);
    } catch (error) {
      console.error('Error getting weather forecast:', error.message);
      return `Gagal mendapatkan prakiraan cuaca: ${error.message}`;
    }
  }

  /**
   * Get weather forecast by region code directly
   * @param {string} regionCode - The region code
   * @returns {string} - Formatted weather forecast
   */
  async getWeatherForecastByCode(regionCode) {
    try {
      const weatherData = await this.getWeatherData(regionCode);
      return this.formatWeatherData(weatherData);
    } catch (error) {
      console.error('Error getting weather forecast:', error.message);
      return `Gagal mendapatkan prakiraan cuaca: ${error.message}`;
    }
  }

  /**
   * Get raw weather data (JSON format)
   * @param {string} regionName - The name of the region
   * @returns {Object} - Raw weather data
   */
  async getRawWeatherData(regionName) {
    const regionCode = await this.findRegionCode(regionName);
      
    if (!regionCode) {
      throw new Error(`Wilayah '${regionName}' tidak ditemukan. Mohon periksa kembali nama wilayah.`);
    }
    
    return await this.getWeatherData(regionCode);
  }
}

export default BMKGWeather;