import axios from 'axios';
import * as cheerio from 'cheerio';

// Fungsi utama untuk melakukan scraping
async function scrapeBMKG(url) {
  try {
    console.log(`Mengambil data dari: ${url}`);
    // 1. Ambil HTML dari URL
    const { data: html } = await axios.get(url, {
      // Tambahkan header User-Agent untuk meniru browser
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    console.log('HTML berhasil diambil.');

    // 2. Load HTML ke Cheerio
    const $ = cheerio.load(html);
    console.log('HTML berhasil di-load ke Cheerio.');

    // 3. Ekstraksi Data

    // a. Deskripsi Lokasi
    const locationDesc = $('div.pb-\\[72px\\] div div div > p').eq(1).text().trim();
    console.log('Deskripsi Lokasi:', locationDesc);

    // b. Cuaca Saat Ini
    const currentWeather = {};
    const currentSection = $('div.bg-\\[linear-gradient\\(151deg'); // Target container utama cuaca saat ini

    // Pemutakhiran waktu
    const pemutakhiranText = currentSection.find('time.flex span.group span').text().trim();
    currentWeather.pemutakhiran = pemutakhiranText.replace('Pemutakhiran:', '').trim();

    // Suhu
    currentWeather.suhu = currentSection.find('div.flex.items-end.gap-4 > p').first().text().trim();

    // Kondisi & Lokasi Detail
    const conditionDetails = currentSection.find('div.md\\:flex.items-center');
    currentWeather.kondisi = conditionDetails.find('p').first().text().trim();
    currentWeather.lokasiDetail = conditionDetails.find('p').last().text().trim();

    // Detail Tambahan (Kelembapan, Angin, Jarak Pandang)
    currentSection.find('div.mt-5.md\\:mt-6.flex > div.flex').each((_, el) => {
      const fullText = $(el).find('p').text().trim();
      const parts = fullText.split(':');
      if (parts.length >= 2) {
        const keyRaw = parts[0].trim().toLowerCase().replace(/\s+/g, '_');
        const value = $(el).find('p span').text().trim();

        // Mapping key agar lebih konsisten
        let key = keyRaw;
        if (keyRaw === 'kelembapan') key = 'kelembapan';
        else if (keyRaw === 'kecepatan_angin') key = 'kecepatan_angin';
        else if (keyRaw === 'arah_angin_dari') key = 'arah_angin';
        else if (keyRaw === 'jarak_pandang') key = 'jarak_pandang';

        currentWeather[key] = value;
      }
    });
    console.log('Cuaca Saat Ini:', currentWeather);

    // c. Prakiraan Per Jam (untuk hari yang ditampilkan)
    const hourlyForecasts = [];
    // Target swiper *kedua* setelah tombol tanggal
    const hourlySlider = $('div.swiper.relative + div.swiper .swiper-wrapper');

    if (hourlySlider.length > 0) {
        hourlySlider.find('.swiper-slide').each((_, slide) => {
          const hourlyData = {};
          const $slide = $(slide);

          hourlyData.jam = $slide.find('h4').text().trim();
          hourlyData.suhu = $slide.find('div.relative.mt-5 > p').first().text().trim();
          hourlyData.kondisi = $slide.find('div.relative.mt-5 > p').last().text().trim();

          // Detail tambahan per jam
          $slide.find('div.relative.mt-4 > div.flex').each((_, detailEl) => {
              const pElement = $(detailEl).find('p');
              const icon = $(detailEl).find('svg').attr('fill'); // Identifikasi berdasarkan ikon jika perlu
              const textRaw = pElement.text().trim();
              const value = pElement.find('span').text().trim() || textRaw; // Ambil dari span atau p jika span kosong

              if (icon && icon.includes('M10.817')) { // Ikon Kelembapan
                  hourlyData.kelembapan = value;
              } else if (icon && icon.includes('M38 13a3')) { // Ikon Kecepatan Angin
                  hourlyData.kecepatan_angin = value;
              } else if (icon && icon.includes('M10 .833a9')) { // Ikon Arah Angin
                  hourlyData.arah_angin = value;
              } else if (icon && icon.includes('M8.333 10a1')) { // Ikon Jarak Pandang
                  hourlyData.jarak_pandang = value;
              }
           });

           // Bersihkan data arah angin jika perlu
           if (hourlyData.arah_angin && hourlyData.arah_angin.endsWith(' km/jam')) {
               hourlyData.arah_angin = hourlyData.arah_angin.replace(/ \d+(\.\d+)? km\/jam$/, '').trim();
           }
           // Pastikan kecepatan angin hanya angka dan unit
           if (hourlyData.kecepatan_angin && !hourlyData.kecepatan_angin.includes('%') && !hourlyData.kecepatan_angin.includes('km')) {
                const windSpeedParts = hourlyData.kecepatan_angin.split(' ');
                if(windSpeedParts.length > 1 && windSpeedParts[1] === 'km/jam') {
                    hourlyData.kecepatan_angin = windSpeedParts[0] + ' km/jam';
                }
           }


          hourlyForecasts.push(hourlyData);
        });
        console.log(`Ditemukan ${hourlyForecasts.length} data prakiraan per jam.`);
    } else {
        console.log('Slider prakiraan per jam tidak ditemukan.');
    }


    // d. Tanggal yang Tersedia (dari tombol)
    const availableDates = [];
    $('div.mt-6.md\\:mt-12.flex.gap-2 button').each((_, el) => {
        const dateText = $(el).text().trim();
        if (dateText) {
            availableDates.push(dateText);
        }
    });
    console.log('Tanggal Tersedia:', availableDates);


    // 4. Susun Hasil
    const result = {
      deskripsi_lokasi: locationDesc,
      cuaca_saat_ini: currentWeather,
      prakiraan_per_jam: hourlyForecasts,
      tanggal_tersedia: availableDates, // Menampilkan tanggal dari tombol
      sumber: url,
      waktu_scrape: new Date().toISOString()
    };

    return result;

  } catch (error) {
    console.error(`Error saat scraping ${url}:`, error.message);
    if (error.response) {
      console.error('Status Code:', error.response.status);
      // console.error('Headers:', error.response.headers);
    } else if (error.request) {
      console.error('Tidak ada respons diterima:', error.request);
    } else {
      console.error('Error setup request:', error.message);
    }
    return null; // atau throw error jika ingin menghentikan proses
  }
}

// --- Contoh Penggunaan ---
const targetUrl = 'https://www.bmkg.go.id/cuaca/prakiraan-cuaca/12.76.01.1001'; // Pabatu, Tebing Tinggi

scrapeBMKG(targetUrl)
  .then(data => {
    if (data) {
      console.log("\n--- HASIL SCRAPING ---");
      console.log(JSON.stringify(data, null, 2)); // Tampilkan hasil dalam format JSON yang rapi
      console.log("\nScraping selesai.");
    } else {
      console.log("Scraping gagal.");
    }
  })
  .catch(err => {
    console.error("Terjadi kesalahan pada proses utama:", err);
  });