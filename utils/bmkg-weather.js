import axios from 'axios';
import * as cheerio from 'cheerio';

import { fetch } from 'undici'; // Lebih modern dan direkomendasikan daripada node-fetch bawaan lama
import process from 'node:process'; // Akses argumen command line

/**
 * Membersihkan teks dari spasi berlebih dan karakter newline.
 * @param {string | undefined} text Teks yang akan dibersihkan.
 * @returns {string | null} Teks yang sudah bersih atau null jika input kosong.
 */
function cleanText(text) {
  return text ? text.replace(/\s+/g, ' ').trim() : null;
}

/**
 * Mengambil data cuaca dari BMKG berdasarkan kode wilayah.
 * @param {string} kodeWilayah Kode wilayah BMKG (contoh: '12.76.01.1001').
 * @returns {Promise<object>} Objek berisi data cuaca.
 */
async function scrapeBMKG(kodeWilayah) {
  if (!kodeWilayah) {
    throw new Error('Kode wilayah tidak boleh kosong!');
  }

  const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${kodeWilayah}`;
  console.log(`Mengambil data dari: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        // Menyamar sebagai browser umum untuk menghindari potensi blokir
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Gagal mengambil data: ${response.status} ${response.statusText}`);
    }

    const htmlText = await response.text();
    const $ = cheerio.load(htmlText);

    // --- Ekstraksi Cuaca Saat Ini ---
    const cuacaSaatIniContainer = $('div.md\\:flex.items-center.gap-6'); // Container utama cuaca saat ini
    const cuacaSaatIni = {};

    // Pemutakhiran
    const pemutakhiranRaw = cuacaSaatIniContainer.find('time:contains("Saat ini") + span > span').text();
    cuacaSaatIni.pemutakhiran = cleanText(pemutakhiranRaw?.replace('Pemutakhiran:', ''));

    // Suhu
    cuacaSaatIni.suhu = cleanText(cuacaSaatIniContainer.find('p.text-\\[40px\\]').first().text());

    // Deskripsi dan Lokasi
    const deskripsiLokasiDiv = cuacaSaatIniContainer.find('p.text-\\[40px\\] + div');
    cuacaSaatIni.deskripsiCuaca = cleanText(deskripsiLokasiDiv.find('p').first().text());
    const lokasiRaw = deskripsiLokasiDiv.find('p').last().text();
    cuacaSaatIni.lokasi = cleanText(lokasiRaw?.replace('di ', '')); // Hilangkan prefix 'di '

    // Detail (Kelembapan, Angin, Jarak Pandang)
    const detailsContainer = cuacaSaatIniContainer.find('div.relative.mt-5');
    detailsContainer.find('div.flex.gap-2.items-center').each((i, el) => {
      const detailText = cleanText($(el).text());
      if (detailText?.includes('Kelembapan:')) {
        cuacaSaatIni.kelembapan = cleanText($(el).find('span.font-bold').text());
      } else if (detailText?.includes('Kecepatan Angin:')) {
        cuacaSaatIni.kecepatanAngin = cleanText($(el).find('span.font-bold').text());
      } else if (detailText?.includes('Arah Angin dari:')) {
        cuacaSaatIni.arahAngin = cleanText($(el).find('span > span.font-bold').first().text());
      } else if (detailText?.includes('Jarak Pandang:')) {
        cuacaSaatIni.jarakPandang = cleanText($(el).find('span.font-bold').text());
      }
    });

    // --- Ekstraksi Peringatan ---
    const peringatanElement = $('div.border-\\[\\#FFA500\\] p'); // Cari div peringatan berdasarkan border oranye
    let peringatan = null;
    if (peringatanElement.length > 0) {
        // Mengambil semua teks di dalam elemen p, termasuk yang di dalam span jika ada
        peringatan = cleanText(peringatanElement.text());
    }


    // --- Ekstraksi Prakiraan Per Jam ---
    const prakiraanPerJam = [];
    // Cari tab aktif untuk mendapatkan tanggal
    const tanggalAktif = cleanText($('button.border-blue-primary').first().text()); // Ambil tanggal dari tab aktif
    const tahunSekarang = new Date().getFullYear(); // Asumsi tahun berjalan

    $('div.swiper-slide').each((index, element) => {
      const slide = $(element);
      const jamRaw = cleanText(slide.find('h4').text());
      const jam = jamRaw?.replace('WIB', '').trim();

      // Format tanggal dan jam
      const tanggalJamISO = `${tahunSekarang}-${tanggalAktif.split(' ')[1]}-${tanggalAktif.split(' ')[0]}T${jam}:00Z`; // Format YYYY-MM-DDTHH:mm:ssZ
      // Perlu penyesuaian mapping bulan jika format tanggal tidak standar
      // Contoh sederhana, perlu lebih robust jika nama bulan berbeda
      const mapBulan = { Mar: '03', Apr: '04', Mei: '05', Jun: '06' /* ... tambahkan bulan lain */};
      const bulanAngka = mapBulan[tanggalAktif.split(' ')[1]];
      const tanggalISO = `${tahunSekarang}-${bulanAngka}-${tanggalAktif.split(' ')[0].padStart(2, '0')}`;
      const dateTimeISO = `${tanggalISO}T${jam}:00+07:00`; // Format ISO 8601 dengan timezone WIB (+07:00)


      const suhu = cleanText(slide.find('p.text-\\[32px\\]').text());
      const deskripsi = cleanText(slide.find('p.text-sm.md\\:text-lg.font-bold').text());

      const detailSlide = slide.find('div.bg-\\[\\#FFFFFF33\\]');
      const kelembapan = cleanText(detailSlide.find('div:nth-child(1) p.font-bold').text());
      const kecepatanAngin = cleanText(detailSlide.find('div:nth-child(2) p.font-bold').text());
      const arahAngin = cleanText(detailSlide.find('div:nth-child(3) span > span.font-bold').first().text());
      const jarakPandang = cleanText(detailSlide.find('div:nth-child(4) p.font-bold').text());

      if (jam && suhu && deskripsi) { // Pastikan data penting ada
          prakiraanPerJam.push({
              // tanggal: tanggalAktif, // Bisa ditambahkan jika perlu
              waktu: jam,
              dateTimeISO: dateTimeISO, // Tambahkan ISO datetime
              suhu: suhu,
              deskripsi: deskripsi,
              kelembapan: kelembapan,
              kecepatanAngin: kecepatanAngin,
              arahAngin: arahAngin,
              jarakPandang: jarakPandang,
          });
      }

    });

    return {
      cuacaSaatIni,
      peringatan: peringatan,
      prakiraanPerJam
    };

  } catch (error) {
    console.error(`Terjadi kesalahan: ${error.message}`);
    throw error; // Lempar ulang error agar bisa ditangkap di luar
  }
}

// --- Eksekusi ---
(async () => {
  const args = process.argv.slice(2); // Ambil argumen dari command line, skip node dan nama file
  const kodeWilayahInput = args[0] || '12.76.01.1001'; // Default ke Pabatu jika tidak ada argumen

  if (!kodeWilayahInput.match(/^[\d.]+$/)) {
      console.error("Kode wilayah tidak valid. Harusnya berupa angka dan titik (contoh: 12.76.01.1001)");
      process.exit(1); // Keluar dengan kode error
  }

  try {
    const dataCuaca = await scrapeBMKG(kodeWilayahInput);
    console.log("\n--- Hasil Scraping ---");
    console.log(JSON.stringify(dataCuaca, null, 2)); // Output JSON yang rapi
  } catch (error) {
    console.error("Gagal menjalankan scraper:", error);
    process.exit(1); // Keluar dengan kode error jika scraping gagal
  }
})();