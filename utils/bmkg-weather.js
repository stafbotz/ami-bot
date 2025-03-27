import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Memformat objek data mentah dari JSON __NUXT_DATA__ menjadi format yang lebih rapi.
 * @param {object} rawData Objek data mentah dari state Nuxt.
 * @returns {object} Objek data yang diformat.
 */
function formatHourlyData(rawData) {
    if (!rawData) return null;
    return {
        jam: rawData.local_datetime?.split(' ')[1] || rawData.datetime, // Ambil bagian jam jika ada, fallback ke datetime
        suhu: `${rawData.t} °C`,
        deskripsiCuaca: rawData.weather_desc || 'N/A',
        kelembapan: `${rawData.hu}%`,
        kecepatanAngin: `${rawData.ws} km/jam`,
        arahAngin: rawData.wd || 'N/A', // wd biasanya kode arah mata angin
        jarakPandang: rawData.vs_text || 'N/A',
        // Anda bisa tambahkan field lain jika perlu, misal: rawData.weather (kode cuaca)
    };
}


/**
 * Fungsi untuk melakukan scraping data cuaca saat ini dan prakiraan multi-hari
 * dari halaman BMKG berdasarkan kode wilayah, dengan fokus pada __NUXT_DATA__.
 * @param {string} locationCode Kode wilayah (contoh: '12.76.01.1001' untuk Pabatu)
 * @returns {Promise<object|null>} Objek berisi data cuaca atau null jika gagal.
 */
async function scrapeBmkgWeatherMultiDay(locationCode) {
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

    // --- 3. Ekstrak Data "Saat Ini" (Masih dari HTML, lebih mudah) ---
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

    // --- 4. Ekstrak dan Parse Data JSON dari __NUXT_DATA__ ---
    const nuxtDataScript = $('#__NUXT_DATA__').html();
    let prakiraanMultiHari = {}; // Objek untuk menyimpan prakiraan per tanggal

    if (nuxtDataScript) {
        try {
            const nuxtData = JSON.parse(nuxtDataScript);
            // Struktur data Nuxt bisa kompleks dan berubah. Ini adalah upaya
            // untuk menemukannya berdasarkan observasi data sampel Anda.
            // Anda mungkin perlu menyesuaikan path ini jika struktur berubah.

            // Cari array state utama (berdasarkan sampel, index 513)
            const stateArray = nuxtData.find(item => Array.isArray(item) && item[513]); // Cari array yang berisi state
            const state = stateArray ? stateArray[513] : null; // Ambil objek state

            // Cari array data utama (berdasarkan sampel, index 2)
            const dataArray = nuxtData.find(item => Array.isArray(item) && item[2]);
             const mainData = dataArray ? dataArray[2] : null; // Ambil objek data

            if (state && mainData) {
                // Cari kunci dinamis untuk data forecast (seperti 'PrIwcXXy2r')
                let forecastDataKey = null;
                for (const key in mainData) {
                    // Cari kunci yang nilainya punya properti 'data' berupa array
                    // dan elemen pertama array tsb punya properti 'cuaca'
                    if (mainData[key] && Array.isArray(mainData[key].data) && mainData[key].data[0] && state[mainData[key].data[0][0]]?.weather) {
                       forecastDataKey = key;
                       break;
                    }
                }

                if (forecastDataKey && mainData[forecastDataKey].data) {
                    const allDaysRefs = mainData[forecastDataKey].data; // Array berisi array referensi per hari

                    // Asumsikan tanggal sesuai urutan array allDaysRefs
                    // Kita ambil label tanggal dari tombol di HTML untuk mencocokkan
                    const dateLabels = [];
                    $('button[class*="!bg-white"][class*="!border-[#CBD5E1]"]').each((i, el) => {
                        dateLabels.push($(el).text().trim());
                    });
                    // Tambahkan tanggal hari ini (yang aktif) di awal
                    const todayLabel = $('button[class*="!bg-[#0133CC1A"]')?.first()?.text()?.trim();
                    if (todayLabel) {
                        dateLabels.unshift(todayLabel);
                    }


                    allDaysRefs.forEach((dayRefs, dayIndex) => {
                        const dateKey = dateLabels[dayIndex] || `Hari ${dayIndex + 1}`; // Gunakan label tanggal jika ada
                        const hourlyForecasts = [];
                        dayRefs.forEach(ref => {
                            const rawHourlyData = state[ref]; // Ambil data asli dari state menggunakan referensi
                             const formattedData = formatHourlyData(rawHourlyData);
                             if(formattedData) {
                                hourlyForecasts.push(formattedData);
                             }
                        });
                         if(hourlyForecasts.length > 0) {
                             prakiraanMultiHari[dateKey] = hourlyForecasts;
                         }
                    });

                } else {
                    console.warn('Peringatan: Tidak dapat menemukan kunci atau data prakiraan di dalam __NUXT_DATA__. Mencoba fallback ke scraping HTML Swiper (hanya hari ini).');
                    // Fallback: Scrape swiper HTML untuk hari ini saja (kode dari jawaban sebelumnya)
                    const forecastContainer = $('div.swiper-wrapper');
                    if (forecastContainer.length > 0) {
                       const todayForecasts = [];
                       forecastContainer.find('div.swiper-slide').each((index, element) => {
                           // ... (kode scraping swiper dari jawaban sebelumnya) ...
                           // Pastikan Anda memasukkan kode scraping swiper di sini jika ingin fallback
                           // Untuk brevity, saya tidak salin ulang seluruhnya.
                       });
                        const todayLabel = $('button[class*="!bg-[#0133CC1A"]')?.first()?.text()?.trim() || 'Hari Ini';
                         if (todayForecasts.length > 0) {
                            prakiraanMultiHari[todayLabel] = todayForecasts;
                         }
                    }
                }
            } else {
                 console.warn('Peringatan: Struktur data atau state utama tidak ditemukan di __NUXT_DATA__.');
            }

        } catch (jsonError) {
            console.error('Error parsing __NUXT_DATA__ JSON:', jsonError.message);
            // Pertimbangkan fallback ke scraping HTML biasa untuk hari ini jika JSON gagal
        }
    } else {
        console.warn('Peringatan: Script __NUXT_DATA__ tidak ditemukan. Hanya data "Saat Ini" yang bisa diambil dari HTML.');
    }

    // --- 5. Return Gabungan Data ---
    if (!saatIniData && Object.keys(prakiraanMultiHari).length === 0) {
        console.error('Error: Gagal mengekstrak data cuaca sama sekali.');
        return null;
    }

    return {
      saatIni: saatIniData,
      prakiraanMultiHari: prakiraanMultiHari // Ganti nama properti
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
  const kodePabatu = '12.76.01.1001';
  const dataCuaca = await scrapeBmkgWeatherMultiDay(kodePabatu);

  if (dataCuaca) {
    console.log('\n--- Hasil Scraping Cuaca BMKG ---');
    if (dataCuaca.saatIni) {
        console.log('\n** Cuaca Saat Ini **');
        console.log(JSON.stringify(dataCuaca.saatIni, null, 2));
    } else {
        console.log('\n** Cuaca Saat Ini: Tidak ditemukan **');
    }

    if (dataCuaca.prakiraanMultiHari && Object.keys(dataCuaca.prakiraanMultiHari).length > 0) {
        console.log('\n** Prakiraan Multi Hari (Per Jam) **');
        // Tampilkan per hari agar lebih mudah dibaca
        for (const tanggal in dataCuaca.prakiraanMultiHari) {
            console.log(`\n* ${tanggal}:`);
            console.log(JSON.stringify(dataCuaca.prakiraanMultiHari[tanggal], null, 2));
        }
    } else {
        console.log('\n** Prakiraan Multi Hari: Tidak ditemukan atau kosong **');
    }

  } else {
    console.log('\nGagal mendapatkan data cuaca secara keseluruhan.');
  }
})();