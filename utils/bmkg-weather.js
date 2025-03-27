import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Fungsi untuk melakukan scraping data cuaca saat ini dan prakiraan per jam
 * dari halaman BMKG berdasarkan kode wilayah.
 * @param {string} locationCode Kode wilayah (contoh: '12.76.01.1001' untuk Pabatu)
 * @returns {Promise<object|null>} Objek berisi data cuaca atau null jika gagal.
 */
async function scrapeBmkgWeather(locationCode) {
  if (!locationCode) {
    console.error('Error: Kode lokasi diperlukan.');
    return null;
  }

  const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${locationCode}`;
  console.log(`Mencoba mengambil data dari: ${url}`);

  try {
    // 1. Ambil HTML dari URL
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const html = response.data;

    // 2. Muat HTML ke Cheerio
    const $ = cheerio.load(html);

    // --- 3. Ekstrak Data "Saat Ini" ---
    let saatIniData = null;
    const currentTempElement = $('p[class*="text-\\[40px\\]"]');
    if (currentTempElement.length > 0) {
        const currentContentDiv = currentTempElement.closest('div.mt-6.md\\:mt-0');
        if (currentContentDiv.length > 0) {
            const pemutakhiranText = currentContentDiv.find('time > span > span').text().trim();
            const suhu = currentTempElement.text().trim();
            const deskripsiCuaca = currentContentDiv.find('div[class*="md:flex"] > p.text-black-primary').first().text().trim();
            const lokasi = currentContentDiv.find('div[class*="md:flex"] > p.text-\\[\\#475569\\]').text().trim().replace('di ', '');

            const detailContainer = currentContentDiv.find('div.relative.mt-5');
            const kelembapan = detailContainer.find('p:contains("Kelembapan:") span.font-bold').text().trim();
            const kecepatanAngin = detailContainer.find('p:contains("Kecepatan Angin:") span.font-bold').text().trim();
            const arahAngin = detailContainer.find('p:contains("Arah Angin dari:") span > span.font-bold').text().trim();
            const jarakPandang = detailContainer.find('p:contains("Jarak Pandang:") span.font-bold').text().trim();

            saatIniData = {
              pemutakhiran: pemutakhiranText.replace('Pemutakhiran: ', ''),
              suhu: suhu,
              deskripsiCuaca: deskripsiCuaca,
              lokasi: lokasi,
              kelembapan: kelembapan,
              kecepatanAngin: kecepatanAngin,
              arahAngin: arahAngin,
              jarakPandang: jarakPandang
            };
        } else {
            console.warn('Peringatan: Tidak dapat menemukan kontainer konten "Saat Ini".');
        }
    } else {
        console.warn('Peringatan: Tidak dapat menemukan elemen suhu utama "Saat Ini".');
    }


    // --- 4. Ekstrak Data "Prakiraan Per Jam" ---
    const prakiraanPerJam = [];
    const forecastContainer = $('div.swiper-wrapper');

    if (forecastContainer.length > 0) {
      forecastContainer.find('div.swiper-slide').each((index, element) => {
        const slide = $(element);
        const hourlyContainer = slide.find('div[class*="p-5"][class*="rounded-2xl"]');

        if (hourlyContainer.length > 0) {
          const jam = hourlyContainer.find('h4').text().trim();
          const suhu = hourlyContainer.find('p[class*="text-\\[32px\\]"]').text().trim();
          const deskripsiCuaca = hourlyContainer.find('p.font-bold.mt-4').text().trim();

          // ==========================================================
          // PERBAIKAN SELEKTOR DI BAGIAN INI
          // ==========================================================
          const detailsDivs = hourlyContainer.find('div[class*="relative mt-4"] > div');
          let kelembapan = '', kecepatanAngin = '', arahAngin = '', jarakPandang = '';

          detailsDivs.each((i, detailEl) => {
             const detailDiv = $(detailEl);
             // Cari <p> yang berisi nilai (biasanya punya kelas font-bold)
             const valueP = detailDiv.find('p.font-bold');

             if (i === 0) { // Kelembapan
                 kelembapan = valueP.text().trim(); // Target <p> langsung
             } else if (i === 1) { // Kecepatan Angin
                 kecepatanAngin = valueP.text().trim(); // Target <p> langsung
             } else if (i === 2) { // Arah Angin
                 // Arah angin ada di dalam nested span, selector ini benar
                 arahAngin = detailDiv.find('p span > span.font-bold').text().trim();
             } else if (i === 3) { // Jarak Pandang
                 jarakPandang = valueP.text().trim(); // Target <p> langsung
             }
          });
          // ==========================================================
          // AKHIR PERBAIKAN
          // ==========================================================

          if (jam) {
            prakiraanPerJam.push({
              jam,
              suhu,
              deskripsiCuaca,
              kelembapan,
              kecepatanAngin,
              arahAngin,
              jarakPandang
            });
          }
        } else {
          console.warn(`Peringatan: Tidak dapat menemukan kontainer konten di dalam slide jam ke-${index + 1}`);
        }
      });
    } else {
        console.warn('Peringatan: Tidak dapat menemukan kontainer prakiraan per jam (swiper-wrapper).');
    }


    // --- 5. Return Gabungan Data ---
    if (!saatIniData && prakiraanPerJam.length === 0) {
        console.error('Error: Gagal mengekstrak data "Saat Ini" maupun "Prakiraan Per Jam".');
        return null;
    }

    return {
      saatIni: saatIniData,
      prakiraanPerJam: prakiraanPerJam
    };

  } catch (error) {
    if (error.response) {
      console.error(`Error: Gagal mengambil data. Status: ${error.response.status} - ${error.response.statusText}`);
      console.error(`URL: ${url}`);
    } else if (error.request) {
      console.error('Error: Tidak ada respons dari server. Cek koneksi internet atau URL.');
      console.error(`URL: ${url}`);
    } else {
      console.error('Error saat scraping:', error.message);
    }
    return null;
  }
}

// --- Contoh Penggunaan ---
(async () => {
  const kodePabatu = '12.76.01.1001'; // Ganti dengan kode wilayah yang diinginkan
  const dataCuaca = await scrapeBmkgWeather(kodePabatu);

  if (dataCuaca) {
    console.log('\n--- Hasil Scraping Cuaca BMKG ---');
    if (dataCuaca.saatIni) {
        console.log('\n** Cuaca Saat Ini **');
        console.log(JSON.stringify(dataCuaca.saatIni, null, 2));
    } else {
        console.log('\n** Cuaca Saat Ini: Tidak ditemukan **');
    }

    if (dataCuaca.prakiraanPerJam && dataCuaca.prakiraanPerJam.length > 0) {
        console.log('\n** Prakiraan Per Jam **');
        console.log(JSON.stringify(dataCuaca.prakiraanPerJam, null, 2));
    } else {
        console.log('\n** Prakiraan Per Jam: Tidak ditemukan atau kosong **');
    }

  } else {
    console.log('\nGagal mendapatkan data cuaca secara keseluruhan.');
  }
})();