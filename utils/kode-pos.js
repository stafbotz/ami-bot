import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Scrapes postal code data from kodepos.co.id
 * @class KodeposScraper
 */
class KodeposScraper {
  /**
   * Creates an instance of KodeposScraper
   * @memberof KodeposScraper
   */
  constructor() {
    this.baseUrl = 'https://kodepos.co.id/kodepos';
  }

  /**
   * Get data by postal code
   * @param {string} kodePos - The postal code to search for
   * @returns {Promise<Array>} - Array of postal code data
   * @memberof KodeposScraper
   */
  async getByKodePos(kodePos) {
    try {
      const url = `${this.baseUrl}/${kodePos}`;
      const response = await axios.get(url);
      const html = response.data;
      
      return this._parseHtml(html);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch data: ${error.message}`);
    }
  }

  /**
   * Parse HTML content and extract postal code data
   * @param {string} html - HTML content from the website
   * @returns {Array} - Array of parsed data
   * @private
   * @memberof KodeposScraper
   */
  _parseHtml(html) {
    const $ = cheerio.load(html);
    const results = [];

    // Select all table rows except the header
    $('table.table-hover tbody tr').each((index, element) => {
      const tds = $(element).find('td');
      
      // Extract data from each column
      const kodeWilayah = $(tds[0]).text().trim();
      const kodePos = $(tds[1]).text().trim();
      const kelurahan = $(tds[2]).text().trim();
      const kecamatan = $(tds[3]).text().trim();
      const kabupatenKota = $(tds[4]).text().trim();
      const provinsi = $(tds[5]).text().trim();

      // Create data object
      const data = {
        kodeWilayah,
        kodePos,
        kelurahan,
        kecamatan,
        kabupatenKota,
        provinsi
      };

      results.push(data);
    });

    return results;
  }

  /**
   * Get summary information about the postal code
   * @param {string} kodePos - The postal code to get summary for
   * @returns {Promise<Object>} - Summary information
   * @memberof KodeposScraper
   */
  async getSummary(kodePos) {
    try {
      const url = `${this.baseUrl}/${kodePos}`;
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);
      
      // Extract the title and description
      const title = $('h2').text().trim();
      const description = $('h2').next('p').text().trim();
      
      // Count the number of areas
      const areaCount = $('table.table-hover tbody tr').length;
      
      return {
        kodePos,
        title,
        description,
        areaCount,
        url
      };
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return {
          kodePos,
          title: 'Kode Pos tidak ditemukan',
          description: 'Tidak ada data untuk kode pos ini',
          areaCount: 0,
          url: `${this.baseUrl}/${kodePos}`
        };
      }
      throw new Error(`Failed to fetch summary data: ${error.message}`);
    }
  }
}

export default KodeposScraper;