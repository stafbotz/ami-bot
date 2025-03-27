import * as cheerio from 'cheerio';
import { fetch } from 'undici'; // Lebih modern dan direkomendasikan
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

    // Pemutakhiran (SELECTOR DIPERBAIKI)
    // Cari span di dalam time yang berisi teks "Pemutakhiran:"
    const pemutakhiranRaw = cuacaSaatIniContainer.find('time:contains("Saat ini") span > span:contains("Pemutakhiran:")').text();
    cuacaSaatIni.pemutakhiran = cleanText(pemutakhiranRaw?.replace('Pemutakhiran:', '')); // Hilangkan prefix

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


    // --- Ekstraksi Prakiraan Per Jam (HANYA UNTUK HARI PERTAMA YANG TERSEDIA DI HTML AWAL) ---
    const prakiraanHariIniPerJam = [];
    // Cari tab aktif untuk mendapatkan tanggal HARI INI
    const tanggalAktifButton = $('button.border-blue-primary').first();
    const tanggalAktifText = cleanText(tanggalAktifButton.text()); // e.g., "27 Mar"

    // Validasi tanggal aktif
    if (!tanggalAktifText) {
        console.warn("Tidak dapat menemukan tanggal aktif pada tab.");
        // Anda bisa memutuskan untuk lanjut tanpa tanggal atau throw error
    }

    const slidesContainer = $('div.swiper'); // Target container swiper
    slidesContainer.find('div.swiper-slide').each((index, element) => {
      const slide = $(element);
      const jamRaw = cleanText(slide.find('h4').text());
      const jam = jamRaw?.replace('WIB', '').trim(); // e.g., "20.00"

      const suhu = cleanText(slide.find('p.text-\\[32px\\]').text());
      const deskripsi = cleanText(slide.find('p.text-sm.md\\:text-lg.font-bold').text());

      const detailSlide = slide.find('div.bg-\\[\\#FFFFFF33\\]');
      const kelembapan = cleanText(detailSlide.find('div:nth-child(1) p.font-bold').text());
      const kecepatanAngin = cleanText(detailSlide.find('div:nth-child(2) p.font-bold').text());
      const arahAngin = cleanText(detailSlide.find('div:nth-child(3) span > span.font-bold').first().text());
      const jarakPandang = cleanText(detailSlide.find('div:nth-child(4) p.font-bold').text());

      let dateTimeISO = null;
      if (tanggalAktifText && jam) {
          try {
              const [dayStr, monthStr] = tanggalAktifText.split(' ');
              const day = dayStr.padStart(2, '0');
              const currentYear = new Date().getFullYear(); // Asumsi tahun berjalan
              const monthMap = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'Mei': '05', 'Jun': '06', 'Jul': '07', 'Agu': '08', 'Sep': '09', 'Okt': '10', 'Nov': '11', 'Des': '12' };
              const month = monthMap[monthStr];

              if (!month) {
                  console.warn(`Bulan tidak dikenali: ${monthStr} dari tanggal ${tanggalAktifText}`);
              } else {
                  const dateISO = `${currentYear}-${month}-${day}`;
                  // Pastikan format jam valid (HH.mm), ubah ke HH:mm jika perlu
                  const formattedJam = jam.includes('.') ? jam.replace('.', ':') : `${jam}:00`; // Asumsi jika tidak ada titik berarti jam bulat
                  if (formattedJam.match(/^\d{2}:\d{2}$/)) {
                    dateTimeISO = `${dateISO}T${formattedJam}:00+07:00`; // Gunakan +07:00 untuk WIB
                  } else {
                    console.warn(`Format jam tidak valid: ${jam}`);
                  }
              }
          } catch (e) {
              console.warn(`Gagal memproses tanggal/jam: ${tanggalAktifText} ${jam}`, e);
          }
      }

      // Hanya tambahkan jika data penting ada
      if (jam && suhu && deskripsi) {
          prakiraanHariIniPerJam.push({
              // tanggal: tanggalAktifText, // Bisa ditambahkan jika perlu kejelasan
              waktu: jam,
              dateTimeISO: dateTimeISO, // Bisa jadi null jika tanggal/jam bermasalah
              suhu: suhu,
              deskripsi: deskripsi,
              kelembapan: kelembapan,
              kecepatanAngin: kecepatanAngin,
              arahAngin: arahAngin,
              jarakPandang: jarakPandang,
          });
      } else {
          console.warn("Data slide tidak lengkap, dilewati:", { jam, suhu, deskripsi });
      }
    });

    return {
      cuacaSaatIni,
      peringatan: peringatan,
      prakiraanHariIniPerJam // Nama field diubah untuk mencerminkan isinya
    };

  } catch (error) {
    console.error(`Terjadi kesalahan saat scraping: ${error.message}`);
    // Tambahkan detail error jika perlu untuk debugging
    // console.error(error.stack);
    throw error; // Lempar ulang error agar bisa ditangkap di luar
  }
}

// --- Eksekusi ---
(async () => {
  const args = process.argv.slice(2); // Ambil argumen dari command line, skip node dan nama file
  const kodeWilayahInput = args[0] || '12.76.01.1001'; // Default ke Pabatu jika tidak ada argumen

  // Validasi format kode wilayah (angka dan titik)
  if (!kodeWilayahInput.match(/^[\d.]+$/)) {
      console.error("Kode wilayah tidak valid. Harusnya berupa angka dan titik (contoh: 12.76.01.1001)");
      process.exit(1); // Keluar dengan kode error
  }

  try {
    const dataCuaca = await scrapeBMKG(kodeWilayahInput);
    console.log("\n--- Hasil Scraping ---");
    console.log(JSON.stringify(dataCuaca, null, 2)); // Output JSON yang rapi
  } catch (error) {
    // Error sudah dicatat di dalam scrapeBMKG, cukup keluar saja
    console.error("Gagal menjalankan scraper.");
    process.exit(1); // Keluar dengan kode error jika scraping gagal
  }
})();