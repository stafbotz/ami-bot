import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Memformat objek data mentah dari JSON __NUXT_DATA__ menjadi format yang lebih rapi.
 * @param {object} rawData Objek data mentah dari state Nuxt.
 * @returns {object | null} Objek data yang diformat atau null jika data tidak valid.
 */
function formatHourlyData(rawData) {
    // Validasi dasar: pastikan rawData adalah objek dan punya properti penting
    if (!rawData || typeof rawData !== 'object' || !rawData.datetime) {
        return null;
    }

    // Ekstraksi jam dari local_datetime jika ada, fallback ke datetime UTC
    let jamString = 'N/A';
    if (rawData.local_datetime && typeof rawData.local_datetime === 'string') {
        const parts = rawData.local_datetime.split(' ');
        if (parts.length > 1) {
            jamString = parts[1]; // Ambil bagian HH:mm:ss
        }
    } else if (rawData.datetime && typeof rawData.datetime === 'string') {
        // Fallback: coba ekstrak jam dari datetime UTC
        try {
            const dateUTC = new Date(rawData.datetime);
            // Format sederhana, perlu penyesuaian jika butuh format WIB presisi
            jamString = dateUTC.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
        } catch (e) {
            jamString = rawData.datetime; // Fallback ke string asli
        }
    }

    return {
        jam: jamString,
        suhu: typeof rawData.t !== 'undefined' ? `${rawData.t} °C` : 'N/A',
        deskripsiCuaca: rawData.weather_desc || 'N/A',
        kelembapan: typeof rawData.hu !== 'undefined' ? `${rawData.hu}%` : 'N/A',
        kecepatanAngin: typeof rawData.ws !== 'undefined' ? `${rawData.ws} km/jam` : 'N/A',
        arahAngin: rawData.wd || 'N/A', // Kode mata angin
        jarakPandang: rawData.vs_text || (typeof rawData.vs !== 'undefined' ? `${rawData.vs} m` : 'N/A'),
        kodeCuaca: rawData.weather || 'N/A',
        timestampUTC: rawData.datetime || 'N/A',
        timestampLokal: rawData.local_datetime || 'N/A',
    };
}

/**
 * Fungsi fallback untuk scrape data per jam HANYA untuk hari ini dari HTML swiper.
 * @param {CheerioAPI} $ Objek Cheerio yang sudah dimuat.
 * @returns {object} Objek berisi prakiraan hari ini { "DD Mon": [...] }.
 */
function scrapeTodaySwiperHtml($) {
    const prakiraanHariIni = {};
    const forecastContainer = $('div.swiper-wrapper');
    const todayLabel = $('button[class*="!bg-[#0133CC1A"]')?.first()?.text()?.trim() || 'Hari Ini';
    const todayForecasts = [];

    if (forecastContainer.length > 0) {
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
            prakiraanHariIni[todayLabel] = todayForecasts;
            console.log(`Fallback berhasil: Mendapatkan ${todayForecasts.length} data jam untuk ${todayLabel} dari HTML.`);
        } else {
            console.warn('Fallback gagal: Tidak ada data jam ditemukan di HTML swiper.');
        }
    } else {
        console.warn('Fallback gagal: Kontainer swiper HTML tidak ditemukan.');
    }
    return prakiraanHariIni;
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
                // Definisikan variabel di dalam scope ini
                const pemutakhiranText = currentContentDiv.find('time > span > span').text().trim();
                const suhu = currentTempElement.text().trim();
                const deskripsiCuaca = currentContentDiv.find('div[class*="md:flex"] > p.text-black-primary').first().text().trim();
                const lokasi = currentContentDiv.find('div[class*="md:flex"] > p.text-\\[\\#475569\\]').text().trim().replace('di ', '');
                const detailContainer = currentContentDiv.find('div.relative.mt-5');
                const kelembapan = detailContainer.find('p:contains("Kelembapan:") span.font-bold').text().trim();
                const kecepatanAngin = detailContainer.find('p:contains("Kecepatan Angin:") span.font-bold').text().trim();
                const arahAngin = detailContainer.find('p:contains("Arah Angin dari:") span > span.font-bold').text().trim();
                const jarakPandang = detailContainer.find('p:contains("Jarak Pandang:") span.font-bold').text().trim();
                const pemutakhiran = pemutakhiranText.replace('Pemutakhiran: ', '');

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
        let jsonProcessedSuccessfully = false; // Flag untuk menandai sukses

        if (nuxtDataScript) {
            try {
                const nuxtDataArray = JSON.parse(nuxtDataScript);

                // Heuristik untuk mencari state dan data utama
                let state = null;
                let mainData = null;
                let allDaysRefs = null;

                // Cari state (biasanya objek besar dengan banyak properti numerik)
                for (const item of nuxtDataArray) {
                    if (Array.isArray(item) && item.length > 500 && typeof item[500] === 'object') { // Asumsi kasar
                        state = item[513]; // Berdasarkan sampel, coba index 513
                        if (state && typeof state === 'object') break; // Jika ketemu objek, anggap itu state
                         state = null; // Reset jika bukan objek
                    }
                }
                 // Jika tidak ketemu di 513, coba cari objek besar lain
                 if (!state) {
                     for (const item of nuxtDataArray) {
                         if (Array.isArray(item) && item.length > 100 && typeof item[100] === 'object') { // Coba indeks lain
                             state = item[Object.keys(item).find(k => typeof item[k] === 'object' && Object.keys(item[k]).length > 50)]; // Cari objek besar di dalamnya
                             if (state) break;
                         }
                     }
                 }


                // Cari mainData (biasanya objek dengan kunci string dinamis)
                 for (const item of nuxtDataArray) {
                      if (Array.isArray(item) && typeof item[2] === 'object' && item[2] !== null && !Array.isArray(item[2])) {
                          // Cek apakah punya kunci yang value-nya array 'data'
                           const dataCandidate = item[2];
                           const dataKey = Object.keys(dataCandidate).find(k => dataCandidate[k] && typeof dataCandidate[k] === 'object' && Array.isArray(dataCandidate[k].data));
                            if (dataKey) {
                               mainData = dataCandidate;
                               break;
                            }
                      }
                 }


                if (!state) throw new Error("Objek state tidak dapat diidentifikasi di __NUXT_DATA__.");
                if (!mainData) throw new Error("Objek data utama tidak dapat diidentifikasi di __NUXT_DATA__.");

                // Cari kunci dinamis (heuristik: cari objek yg punya array 'data')
                 let forecastDataKey = Object.keys(mainData).find(key =>
                    mainData[key] && typeof mainData[key] === 'object' && Array.isArray(mainData[key].data)
                 );

                if (!forecastDataKey) throw new Error("Kunci data prakiraan dinamis tidak ditemukan di mainData.");

                // Struktur allDaysRefs mungkin tidak selalu langsung di mainData[forecastDataKey].data
                // Kita perlu menelusuri referensi jika ada
                 let currentRef = mainData[forecastDataKey].data; // Ini bisa jadi array referensi atau indeks ke array lain

                 // Jika currentRef adalah angka (indeks), telusuri lebih lanjut
                 while (typeof currentRef === 'number' && nuxtDataArray[currentRef]) {
                    // Asumsi struktur [index_ke_objek_cuaca] atau {0: index_ke_objek_cuaca}
                     const nextLevel = nuxtDataArray[currentRef];
                      if (Array.isArray(nextLevel) && typeof nextLevel[0] === 'number') {
                          currentRef = nextLevel[0];
                      } else if (typeof nextLevel === 'object' && typeof nextLevel[0] === 'number') {
                         currentRef = nextLevel[0];
                      } else if (typeof nextLevel === 'object' && nextLevel.cuaca !== undefined && typeof nextLevel.cuaca === 'number') { // Cek properti 'cuaca'
                         currentRef = nextLevel.cuaca;
                     } else {
                         // Jika tidak ketemu pola yang diharapkan, coba ambil data langsung
                         currentRef = nuxtDataArray[currentRef];
                         break;
                     }
                 }

                // Setelah loop, currentRef seharusnya adalah array data atau array referensi akhir
                if (typeof currentRef === 'number' && nuxtDataArray[currentRef] && Array.isArray(nuxtDataArray[currentRef])) {
                    allDaysRefs = nuxtDataArray[currentRef];
                 } else if (Array.isArray(currentRef)) {
                     allDaysRefs = currentRef;
                 } else {
                    throw new Error("Tidak dapat menemukan array referensi prakiraan (allDaysRefs) setelah menelusuri indeks.");
                 }


                // Proses allDaysRefs jika valid
                if (Array.isArray(allDaysRefs)) {
                    const dateLabels = [];
                    const todayLabel = $('button[class*="!bg-[#0133CC1A"]')?.first()?.text()?.trim();
                    if (todayLabel) dateLabels.push(todayLabel);
                    $('button[class*="!bg-white"][class*="!border-[#CBD5E1]"]').each((i, el) => {
                        dateLabels.push($(el).text().trim());
                    });

                    allDaysRefs.forEach((dayRefs, dayIndex) => {
                        const dateKey = dateLabels[dayIndex] || `Hari ke-${dayIndex + 1}`;
                        const hourlyForecasts = [];
                        if (Array.isArray(dayRefs)) {
                            dayRefs.forEach(ref => {
                                // Pastikan ref adalah angka/indeks yang valid untuk state
                                if (typeof ref === 'number' && state[ref]) {
                                    const rawHourlyData = state[ref];
                                    const formattedData = formatHourlyData(rawHourlyData);
                                    if (formattedData) {
                                        hourlyForecasts.push(formattedData);
                                    }
                                } else {
                                     console.warn(`Referensi tidak valid atau data tidak ditemukan di state untuk ref: ${ref}`);
                                }
                            });
                        }
                        if (hourlyForecasts.length > 0) {
                            prakiraanMultiHari[dateKey] = hourlyForecasts;
                        }
                    });
                    jsonProcessedSuccessfully = true; // Tandai sukses
                    console.log(`Berhasil memproses ${Object.keys(prakiraanMultiHari).length} hari dari __NUXT_DATA__.`);
                } else {
                    throw new Error("Struktur akhir allDaysRefs bukan array.");
                }

            } catch (error) {
                console.error('Error memproses __NUXT_DATA__:', error.message);
                // Jangan langsung fallback, biarkan flag jsonProcessedSuccessfully = false
            }
        } else {
            console.warn('Peringatan: Script __NUXT_DATA__ tidak ditemukan.');
        }

        // --- Fallback jika JSON Gagal Diproses ---
        if (!jsonProcessedSuccessfully) {
            console.log('Mencoba fallback: Scraping HTML swiper untuk hari ini...');
            prakiraanMultiHari = scrapeTodaySwiperHtml($); // Panggil fungsi fallback
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