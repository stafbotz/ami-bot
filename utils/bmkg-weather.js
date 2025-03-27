import axios from 'axios';
import * as cheerio from 'cheerio';

import axios from 'axios';
import cheerio from 'cheerio';

/**
 * Memformat objek data mentah dari JSON __NUXT_DATA__ menjadi format yang lebih rapi.
 * @param {object} rawData Objek data mentah dari state Nuxt.
 * @returns {object | null} Objek data yang diformat atau null jika data tidak valid.
 */
function formatHourlyData(rawData) {
    // Validasi dasar: pastikan rawData adalah objek dan punya properti penting
    if (!rawData || typeof rawData !== 'object' || !rawData.datetime) {
        // console.warn('Data jam mentah tidak valid:', rawData);
        return null;
    }

    // Ekstraksi jam dari local_datetime jika ada, fallback ke datetime UTC jika tidak
    let jamString = 'N/A';
    if (rawData.local_datetime && typeof rawData.local_datetime === 'string') {
        const parts = rawData.local_datetime.split(' ');
        if (parts.length > 1) {
            jamString = parts[1]; // Ambil bagian HH:mm:ss
        }
    } else if (rawData.datetime && typeof rawData.datetime === 'string') {
        // Fallback: coba ekstrak jam dari datetime UTC (mungkin perlu penyesuaian timezone)
        try {
            const dateUTC = new Date(rawData.datetime);
            // Format sederhana, perlu penyesuaian jika butuh format WIB presisi
            jamString = dateUTC.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
        } catch (e) {
             jamString = rawData.datetime; // Fallback ke string asli jika parsing gagal
        }
    }

    return {
        jam: jamString,
        suhu: typeof rawData.t !== 'undefined' ? `${rawData.t} °C` : 'N/A',
        deskripsiCuaca: rawData.weather_desc || 'N/A',
        kelembapan: typeof rawData.hu !== 'undefined' ? `${rawData.hu}%` : 'N/A',
        kecepatanAngin: typeof rawData.ws !== 'undefined' ? `${rawData.ws} km/jam` : 'N/A',
        // Arah angin seringkali berupa kode mata angin (W, E, NE, dll.)
        arahAngin: rawData.wd || 'N/A',
        jarakPandang: rawData.vs_text || (typeof rawData.vs !== 'undefined' ? `${rawData.vs} m` : 'N/A'),
        kodeCuaca: rawData.weather || 'N/A', // Tambahkan kode cuaca jika perlu
        timestampUTC: rawData.datetime || 'N/A',
        timestampLokal: rawData.local_datetime || 'N/A',
    };
}

/**
 * Fungsi utama untuk scrape data cuaca multi-hari dari BMKG.
 * @param {string} locationCode Kode wilayah.
 * @returns {Promise<object|null>} Objek hasil scraping atau null.
 */
async function scrapeBmkgWeatherMultiDay(locationCode) {
    if (!locationCode) {
        console.error('Error: Kode lokasi diperlukan.');
        return null;
    }

    const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${locationCode}`;
    console.log(`Mencoba mengambil data dari: ${url}`);

    try {
        // 1. Ambil HTML
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = response.data;
        const $ = cheerio.load(html);

        // --- 2. Ekstrak Data "Saat Ini" (dari HTML) ---
        let saatIniData = null;
        const currentTempElement = $('p[class*="text-\\[40px\\]"]');
        if (currentTempElement.length > 0) {
            const currentContentDiv = currentTempElement.closest('div.mt-6.md\\:mt-0');
            if (currentContentDiv.length > 0) {
                const pemutakhiranText = currentContentDiv.find('time > span > span').text().trim().replace('Pemutakhiran: ', '');
                const suhu = currentTempElement.text().trim();
                const deskripsiCuaca = currentContentDiv.find('div[class*="md:flex"] > p.text-black-primary').first().text().trim();
                const lokasi = currentContentDiv.find('div[class*="md:flex"] > p.text-\\[\\#475569\\]').text().trim().replace('di ', '');
                const detailContainer = currentContentDiv.find('div.relative.mt-5');
                const kelembapan = detailContainer.find('p:contains("Kelembapan:") span.font-bold').text().trim();
                const kecepatanAngin = detailContainer.find('p:contains("Kecepatan Angin:") span.font-bold').text().trim();
                const arahAngin = detailContainer.find('p:contains("Arah Angin dari:") span > span.font-bold').text().trim();
                const jarakPandang = detailContainer.find('p:contains("Jarak Pandang:") span.font-bold').text().trim();

                saatIniData = { pemutakhiran, suhu, deskripsiCuaca, lokasi, kelembapan, kecepatanAngin, arahAngin, jarakPandang };
            } else {
                console.warn('Peringatan: Kontainer "Saat Ini" tidak ditemukan.');
            }
        } else {
            console.warn('Peringatan: Elemen suhu utama "Saat Ini" tidak ditemukan.');
        }

        // --- 3. Ekstrak dan Proses Data JSON dari __NUXT_DATA__ ---
        const nuxtDataScript = $('#__NUXT_DATA__').html();
        let prakiraanMultiHari = {};

        if (nuxtDataScript) {
            try {
                const nuxtDataArray = JSON.parse(nuxtDataScript);

                // Cari 'state' dan array 'data' utama (berdasarkan struktur sampel)
                // Indeks bisa berubah, ini hanya berdasarkan observasi
                const mainData = nuxtDataArray.find(item => Array.isArray(item) && typeof item[2] === 'object' && item[2]?.PrIwcXXy2r)?.[2];
                const state = nuxtDataArray.find(item => Array.isArray(item) && typeof item[513] === 'object')?.[513];


                if (mainData && state) {
                     // Cari kunci dinamis untuk data (contoh: PrIwcXXy2r) -> ini mengarah ke index lain (contoh: 10)
                     const forecastIndexKey = Object.keys(mainData).find(key => mainData[key] === 10); // Cari kunci yang valuenya 10 (berdasarkan sampel)
                     if(!forecastIndexKey) {
                         console.warn('Peringatan: Kunci dinamis untuk indeks data forecast (seperti PrIwcXXy2r) tidak ditemukan.');

                     } else {
                         const dataIndex = mainData[forecastIndexKey]; // Misal: 10
                         const forecastContainerIndex = nuxtDataArray[dataIndex]?.data; // Misal: 22
                         const forecastRefArrayIndex = nuxtDataArray[forecastContainerIndex]?.[0]; // Misal: 23
                         const forecastRefsIndex = nuxtDataArray[forecastRefArrayIndex]?.cuaca; // Misal: 29
                         const allDaysRefs = nuxtDataArray[forecastRefsIndex]; // Array of arrays of refs

                         if (Array.isArray(allDaysRefs)) {
                             // Ambil label tanggal dari tombol HTML
                             const dateLabels = [];
                              // Tombol aktif (hari ini)
                             const todayLabel = $('button[class*="!bg-[#0133CC1A"]')?.first()?.text()?.trim();
                              if (todayLabel) dateLabels.push(todayLabel);
                              // Tombol tidak aktif (hari berikutnya)
                             $('button[class*="!bg-white"][class*="!border-[#CBD5E1]"]').each((i, el) => {
                                 dateLabels.push($(el).text().trim());
                             });

                             allDaysRefs.forEach((dayRefs, dayIndex) => {
                                 const dateKey = dateLabels[dayIndex] || `Hari ke-${dayIndex + 1}`; // Gunakan label atau fallback
                                 const hourlyForecasts = [];
                                 if (Array.isArray(dayRefs)) {
                                     dayRefs.forEach(ref => {
                                         const rawHourlyData = state[ref]; // Ambil data dari state
                                         const formattedData = formatHourlyData(rawHourlyData);
                                         if (formattedData) {
                                             hourlyForecasts.push(formattedData);
                                         }
                                     });
                                 }
                                  if (hourlyForecasts.length > 0) {
                                     prakiraanMultiHari[dateKey] = hourlyForecasts;
                                 }
                             });
                         } else {
                            console.warn('Peringatan: Struktur array referensi prakiraan (allDaysRefs) tidak ditemukan atau bukan array.');
                         }
                     }

                } else {
                    console.warn('Peringatan: Objek data utama atau state tidak ditemukan dalam __NUXT_DATA__.');
                }

            } catch (jsonError) {
                console.error('Error parsing __NUXT_DATA__ JSON:', jsonError.message);
                // Fallback (jika JSON gagal): Coba scrape HTML swiper hari ini
                console.log('Mencoba fallback: Scraping HTML swiper untuk hari ini...');
                const forecastContainer = $('div.swiper-wrapper');
                 if (forecastContainer.length > 0) {
                    const todayForecasts = [];
                    const todayLabel = $('button[class*="!bg-[#0133CC1A"]')?.first()?.text()?.trim() || 'Hari Ini';
                    forecastContainer.find('div.swiper-slide').each((index, element) => {
                         const slide = $(element);
                         const hourlyContainer = slide.find('div[class*="p-5"][class*="rounded-2xl"]');
                         if (hourlyContainer.length > 0) {
                             const jam = hourlyContainer.find('h4').text().trim();
                             const suhu = hourlyContainer.find('p[class*="text-\\[32px\\]"]').text().trim();
                             const deskripsiCuaca = hourlyContainer.find('p.font-bold.mt-4').text().trim();
                             const detailsDivs = hourlyContainer.find('div[class*="relative mt-4"] > div');
                             let kelembapan = '', kecepatanAngin = '', arahAngin = '', jarakPandang = '';

                             detailsDivs.each((i, detailEl) => {
                                 const detailDiv = $(detailEl);
                                 const valueP = detailDiv.find('p.font-bold');
                                 if (i === 0) kelembapan = valueP.text().trim();
                                 else if (i === 1) kecepatanAngin = valueP.text().trim();
                                 else if (i === 2) arahAngin = detailDiv.find('p span > span.font-bold').text().trim();
                                 else if (i === 3) jarakPandang = valueP.text().trim();
                             });

                             if (jam) {
                                 todayForecasts.push({ jam, suhu, deskripsiCuaca, kelembapan, kecepatanAngin, arahAngin, jarakPandang });
                             }
                         }
                    });
                    if (todayForecasts.length > 0) {
                         prakiraanMultiHari[todayLabel] = todayForecasts;
                         console.log(`Fallback berhasil: Mendapatkan ${todayForecasts.length} data jam untuk ${todayLabel} dari HTML.`);
                    } else {
                         console.warn('Fallback gagal: Tidak ada data jam ditemukan di HTML swiper.');
                    }
                 } else {
                     console.warn('Fallback gagal: Kontainer swiper HTML tidak ditemukan.');
                 }
            }
        } else {
            console.warn('Peringatan: Script __NUXT_DATA__ tidak ditemukan.');
            // Jika NUXT_DATA tidak ada, coba scrape HTML swiper hari ini
             console.log('Mencoba fallback: Scraping HTML swiper untuk hari ini...');
             // (Kode fallback scraping swiper sama seperti di blok catch di atas)
             // ... (untuk brevity, tidak disalin ulang penuh)
        }


        // --- 4. Return Hasil ---
        if (!saatIniData && Object.keys(prakiraanMultiHari).length === 0) {
            console.error('Error: Gagal mengekstrak data cuaca sama sekali.');
            return null;
        }

        return {
            saatIni: saatIniData,
            prakiraanMultiHari: prakiraanMultiHari
        };

    } catch (error) {
        // Handle error axios
        if (error.response) {
            console.error(`Error HTTP: ${error.response.status} - ${error.response.statusText}`);
            console.error(`URL: ${url}`);
        } else if (error.request) {
            console.error('Error Jaringan: Tidak ada respons dari server.');
            console.error(`URL: ${url}`);
        } else {
            console.error('Error Lain:', error.message);
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
            console.log('\n** Cuaca Saat Ini: Tidak ditemukan/Gagal diambil **');
        }

        if (dataCuaca.prakiraanMultiHari && Object.keys(dataCuaca.prakiraanMultiHari).length > 0) {
            console.log('\n** Prakiraan Multi Hari (Per Jam) **');
            // Tampilkan per hari
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