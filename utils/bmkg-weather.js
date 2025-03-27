import axios from 'axios';
import cheerio from 'cheerio';

/**
 * Fungsi untuk melakukan scraping data cuaca saat ini dari halaman BMKG berdasarkan kode wilayah.
 * @param {string} locationCode Kode wilayah (contoh: '12.76.01.1001' untuk Pabatu)
 * @returns {Promise<object|null>} Objek berisi data cuaca saat ini atau null jika gagal.
 */
async function scrapeBmkgCurrentWeather(locationCode) {
  if (!locationCode) {
    console.error('Error: Kode lokasi diperlukan.');
    return null;
  }

  const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${locationCode}`;
  console.log(`Mencoba mengambil data dari: ${url}`);

  try {
    // 1. Ambil HTML dari URL
    const response = await axios.get(url, {
        // Tambahkan header User-Agent untuk meniru browser
         headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
         }
    });
    const html = response.data;

    // 2. Muat HTML ke Cheerio
    const $ = cheerio.load(html);

    // 3. Cari kontainer utama untuk bagian "Saat ini"
    //    Kita cari elemen unik di dekatnya, misalnya <p> dengan suhu besar
    const currentTempElement = $('p[class*="text-\\[40px\\]"]'); // Cari elemen suhu
    if (currentTempElement.length === 0) {
        console.error('Tidak dapat menemukan elemen suhu utama. Struktur halaman mungkin berubah.');
        return null;
    }
    // Naik ke kontainer utama berdasarkan struktur yang diobservasi
    const currentContentDiv = currentTempElement.closest('div.mt-6.md\\:mt-0');
     if (currentContentDiv.length === 0) {
        console.error('Tidak dapat menemukan kontainer konten utama "Saat ini". Struktur halaman mungkin berubah.');
        return null;
    }

    // 4. Ekstrak data menggunakan selector Cheerio
    const pemutakhiranText = currentContentDiv.find('time > span > span').text().trim();
    const suhu = currentTempElement.text().trim();
    const deskripsiCuaca = currentContentDiv.find('div[class*="md:flex"] > p.text-black-primary').first().text().trim();
    const lokasi = currentContentDiv.find('div[class*="md:flex"] > p.text-\\[\\#475569\\]').text().trim().replace('di ', ''); // Hapus 'di '

    // Ekstrak detail tambahan (Kelembapan, Angin, Jarak Pandang)
    const detailContainer = currentContentDiv.find('div.relative.mt-5');
    const kelembapan = detailContainer.find('p:contains("Kelembapan:") span.font-bold').text().trim();
    const kecepatanAngin = detailContainer.find('p:contains("Kecepatan Angin:") span.font-bold').text().trim();
    const arahAngin = detailContainer.find('p:contains("Arah Angin dari:") span > span.font-bold').text().trim();
    const jarakPandang = detailContainer.find('p:contains("Jarak Pandang:") span.font-bold').text().trim();

    // 5. Format data ke dalam objek JSON
    const weatherData = {
      pemutakhiran: pemutakhiranText.replace('Pemutakhiran: ', ''), // Hapus label
      suhu: suhu,
      deskripsiCuaca: deskripsiCuaca,
      lokasi: lokasi,
      kelembapan: kelembapan,
      kecepatanAngin: kecepatanAngin,
      arahAngin: arahAngin,
      jarakPandang: jarakPandang
    };

    return weatherData;

  } catch (error) {
    if (error.response) {
      // Server merespons dengan status error (misalnya 404, 500)
      console.error(`Error: Gagal mengambil data. Status: ${error.response.status} - ${error.response.statusText}`);
      console.error(`URL: ${url}`);
    } else if (error.request) {
      // Request dibuat tapi tidak ada respons (misalnya masalah jaringan)
      console.error('Error: Tidak ada respons dari server. Cek koneksi internet atau URL.');
       console.error(`URL: ${url}`);
    } else {
      // Error lain saat setup request atau parsing
      console.error('Error saat scraping:', error.message);
    }
    return null;
  }
}

// --- Contoh Penggunaan ---
(async () => {
  const kodePabatu = '12.76.01.1001'; // Ganti dengan kode wilayah yang diinginkan
  const dataCuacaPabatu = await scrapeBmkgCurrentWeather(kodePabatu);

  if (dataCuacaPabatu) {
    console.log('\n--- Data Cuaca Saat Ini ---');
    console.log(JSON.stringify(dataCuacaPabatu, null, 2)); // Tampilkan JSON dengan format rapi
  } else {
    console.log('\nGagal mendapatkan data cuaca.');
  }

  // Contoh lain (misal Jakarta Pusat - Kemayoran)
  // const kodeJakarta = '31.71.03.1001';
  // const dataCuacaJakarta = await scrapeBmkgCurrentWeather(kodeJakarta);
  // if (dataCuacaJakarta) {
  //   console.log('\n--- Data Cuaca Saat Ini (Jakarta) ---');
  //   console.log(JSON.stringify(dataCuacaJakarta, null, 2));
  // } else {
  //   console.log('\nGagal mendapatkan data cuaca Jakarta.');
  // }
})();