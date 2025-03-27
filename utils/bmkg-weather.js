import puppeteer from 'puppeteer';
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
 * Fungsi yang akan dieksekusi di dalam konteks browser oleh Puppeteer
 * untuk mengekstrak data dari DOM.
 * @returns {object} Objek berisi data cuaca saat ini, peringatan, tanggal aktif, dan prakiraan jam.
 */
function extractPageData() {
    // Fungsi helper cleanTextBrowser harus didefinisikan di dalam evaluate juga
    const cleanTextBrowser = (text) => {
        return text ? text.replace(/\s+/g, ' ').trim() : null;
    };

    // --- Ekstraksi Cuaca Saat Ini ---
    const cuacaSaatIniContainer = document.querySelector('div.md\\:flex.items-center.gap-6');
    const cuacaSaatIni = {};
    if (cuacaSaatIniContainer) {
        // Pemutakhiran (SELECTOR DIPERBAIKI)
        // Cari elemen <time> yang mengandung teks "Saat ini"
        // Kemudian cari span.group di dalamnya, lalu span lagi di dalamnya
        const timeElement = Array.from(cuacaSaatIniContainer.querySelectorAll('time')).find(el => el.textContent.includes("Saat ini"));
        const groupSpan = timeElement ? timeElement.querySelector('span.group') : null;
        const pemutakhiranSpan = groupSpan ? groupSpan.querySelector('span') : null; // Span di dalam group span
        const pemutakhiranRaw = pemutakhiranSpan ? pemutakhiranSpan.textContent : null;
        cuacaSaatIni.pemutakhiran = cleanTextBrowser(pemutakhiranRaw?.replace('Pemutakhiran:', ''));

        // Suhu
        cuacaSaatIni.suhu = cleanTextBrowser(cuacaSaatIniContainer.querySelector('p.text-\\[40px\\]')?.textContent);

        // Deskripsi dan Lokasi
        const deskripsiLokasiDiv = cuacaSaatIniContainer.querySelector('p.text-\\[40px\\] + div');
        if (deskripsiLokasiDiv) {
             cuacaSaatIni.deskripsiCuaca = cleanTextBrowser(deskripsiLokasiDiv.querySelector('p:first-child')?.textContent);
             const lokasiRaw = deskripsiLokasiDiv.querySelector('p:last-child')?.textContent;
             cuacaSaatIni.lokasi = cleanTextBrowser(lokasiRaw?.replace('di ', ''));
        }

        // Detail (Kelembapan, Angin, Jarak Pandang)
        const detailsContainer = cuacaSaatIniContainer.querySelector('div.relative.mt-5');
        if (detailsContainer) {
            detailsContainer.querySelectorAll('div.flex.gap-2.items-center').forEach(el => {
                const detailText = cleanTextBrowser(el.textContent);
                const boldText = cleanTextBrowser(el.querySelector('span.font-bold')?.textContent);
                const boldTextDirection = cleanTextBrowser(el.querySelector('span > span.font-bold')?.textContent);

                if (detailText?.includes('Kelembapan:')) cuacaSaatIni.kelembapan = boldText;
                else if (detailText?.includes('Kecepatan Angin:')) cuacaSaatIni.kecepatanAngin = boldText;
                else if (detailText?.includes('Arah Angin dari:')) cuacaSaatIni.arahAngin = boldTextDirection;
                else if (detailText?.includes('Jarak Pandang:')) cuacaSaatIni.jarakPandang = boldText;
            });
        }
    } else {
        console.warn("Container cuaca saat ini tidak ditemukan.");
    }

    // --- Ekstraksi Peringatan ---
    const peringatanElement = document.querySelector('div.border-\\[\\#FFA500\\] p');
    const peringatan = peringatanElement ? cleanTextBrowser(peringatanElement.textContent) : null;

    // --- Ekstraksi Prakiraan Per Jam (UNTUK HARI YANG SEDANG AKTIF) ---
    const prakiraanPerJam = [];
    const tanggalAktifButton = document.querySelector('button.border-blue-primary'); // Tombol tab hari aktif
    const tanggalAktifText = tanggalAktifButton ? cleanTextBrowser(tanggalAktifButton.textContent) : null; // e.g., "27 Mar"
    const currentYear = new Date().getFullYear();
    const monthMap = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'Mei': '05', 'Jun': '06', 'Jul': '07', 'Agu': '08', 'Sep': '09', 'Okt': '10', 'Nov': '11', 'Des': '12' };

    const slides = document.querySelectorAll('div.swiper-slide');
    slides.forEach(slide => {
        const jamRaw = cleanTextBrowser(slide.querySelector('h4')?.textContent);
        const jam = jamRaw?.replace('WIB', '').trim(); // e.g., "20.00"

        const suhu = cleanTextBrowser(slide.querySelector('p.text-\\[32px\\]')?.textContent);
        const deskripsi = cleanTextBrowser(slide.querySelector('p.text-sm.md\\:text-lg.font-bold')?.textContent);

        const detailSlide = slide.querySelector('div.bg-\\[\\#FFFFFF33\\]');
        const kelembapan = detailSlide ? cleanTextBrowser(detailSlide.querySelector('div:nth-child(1) p.font-bold')?.textContent) : null;
        const kecepatanAngin = detailSlide ? cleanTextBrowser(detailSlide.querySelector('div:nth-child(2) p.font-bold')?.textContent) : null;
        const arahAngin = detailSlide ? cleanTextBrowser(detailSlide.querySelector('div:nth-child(3) span > span.font-bold')?.textContent) : null;
        const jarakPandang = detailSlide ? cleanTextBrowser(detailSlide.querySelector('div:nth-child(4) p.font-bold')?.textContent) : null;

        let dateTimeISO = null;
        if (tanggalAktifText && jam) {
            try {
                const [dayStr, monthStr] = tanggalAktifText.split(' ');
                const day = dayStr.padStart(2, '0');
                const month = monthMap[monthStr];

                if (!month) {
                    console.warn(`Bulan tidak dikenali: ${monthStr} dari tanggal ${tanggalAktifText}`);
                } else {
                    const dateISO = `${currentYear}-${month}-${day}`;
                    const formattedJam = jam.includes('.') ? jam.replace('.', ':') : `${jam}:00`;
                     if (formattedJam.match(/^\d{2}:\d{2}$/)) {
                        dateTimeISO = `${dateISO}T${formattedJam}:00+07:00`; // WIB
                    } else {
                        console.warn(`Format jam tidak valid: ${jam}`);
                    }
                }
            } catch (e) {
                console.warn(`Gagal memproses tanggal/jam: ${tanggalAktifText} ${jam}`, e);
            }
        }

        if (jam && suhu && deskripsi) {
            prakiraanPerJam.push({
                waktu: jam,
                dateTimeISO: dateTimeISO,
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
        peringatan,
        tanggalAktif: tanggalAktifText,
        prakiraanPerJam
    };
}


/**
 * Mengambil data cuaca dari BMKG menggunakan Puppeteer.
 * @param {string} kodeWilayah Kode wilayah BMKG.
 * @returns {Promise<object>} Objek berisi data cuaca multi-hari.
 */
async function scrapeBMKGWithPuppeteer(kodeWilayah) {
  if (!kodeWilayah) {
    throw new Error('Kode wilayah tidak boleh kosong!');
  }

  const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${kodeWilayah}`;
  console.log(`Mengakses ${url} dengan Puppeteer...`);

  let browser = null; // Deklarasikan di luar try
  const hasilScraping = {
    cuacaSaatIni: null,
    peringatan: null,
    prakiraanMultiHari: []
  };

  try {
    browser = await puppeteer.launch({
      headless: true, // Gunakan 'new' untuk versi baru, true untuk default lama, atau false untuk melihat browser
      args: ['--no-sandbox', '--disable-setuid-sandbox'] // Opsi umum untuk lingkungan server/docker
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 }); // Ukuran viewport bisa mempengaruhi layout

    console.log(`Navigasi ke halaman...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Tunggu jaringan relatif tenang, timeout 60 detik

    console.log(`Menunggu selector utama muncul...`);
    // Menunggu elemen-elemen kunci muncul
    await page.waitForSelector('div.md\\:flex.items-center.gap-6', { timeout: 30000 }); // Container cuaca saat ini
    await page.waitForSelector('div.swiper', { timeout: 30000 }); // Container swiper
    await page.waitForSelector('button.border-blue-primary', { timeout: 30000 }); // Tab tanggal aktif
    await page.waitForSelector('button.border-\\[\\#CBD5E1\\]', { timeout: 30000 }); // Tab tanggal tidak aktif

    // 1. Scrape data hari pertama (yang aktif)
    console.log(`Mengambil data hari pertama...`);
    const dataHariPertama = await page.evaluate(extractPageData);
    hasilScraping.cuacaSaatIni = dataHariPertama.cuacaSaatIni;
    hasilScraping.peringatan = dataHariPertama.peringatan;
    if (dataHariPertama.tanggalAktif && dataHariPertama.prakiraanPerJam.length > 0) {
      hasilScraping.prakiraanMultiHari.push({
        tanggal: dataHariPertama.tanggalAktif,
        data: dataHariPertama.prakiraanPerJam
      });
    } else {
        console.warn("Data prakiraan hari pertama tidak lengkap atau tidak ditemukan.");
    }

    // 2. Cari semua tombol tab tanggal yang tidak aktif
    const tabSelectors = await page.$$('button.border-\\[\\#CBD5E1\\]');
    console.log(`Menemukan ${tabSelectors.length} tab tanggal tambahan.`);


    // 3. Loop melalui tab tanggal lainnya
    for (let i = 0; i < tabSelectors.length; i++) {
        // Re-fetch selector di setiap iterasi karena DOM bisa berubah
        const currentTabs = await page.$$('button.border-\\[\\#CBD5E1\\]');
        if (i >= currentTabs.length) {
            console.warn(`Indeks tab ${i} di luar batas setelah DOM mungkin berubah.`);
            break; // Hentikan loop jika tab tidak ditemukan lagi
        }
        const tabButton = currentTabs[i];
        const tanggalTab = await page.evaluate(el => el.textContent.trim().replace(/\s+/g, ' '), tabButton);
        console.log(`\nMengklik tab untuk tanggal: ${tanggalTab}...`);

        try {
             // Klik tab
            await tabButton.click();

            // *** Strategi Menunggu Penting ***
            // Tunggu hingga swiper kemungkinan diperbarui.
             await page.waitForTimeout(2000); // Naikkan sedikit waktu tunggu menjadi 2 detik

            // Opsional: Coba tunggu sampai tab yang diklik benar-benar aktif
             await page.waitForFunction(
                 (dateText) => {
                     const activeButton = document.querySelector('button.border-blue-primary');
                     return activeButton && activeButton.textContent.trim().replace(/\s+/g, ' ') === dateText;
                 },
                 { timeout: 10000 }, // Timeout 10 detik
                 tanggalTab // Kirim tanggal yang diharapkan ke dalam fungsi browser
             ).catch(e => console.warn(`Timeout atau error menunggu tab ${tanggalTab} menjadi aktif: ${e.message}`)); // Tangkap error jika timeout

            console.log(`Mengambil data untuk tanggal: ${tanggalTab}...`);
            const dataHariBerikutnya = await page.evaluate(extractPageData);

            // Validasi apakah tanggal yang diekstrak sesuai dengan tab yang diklik
            if (dataHariBerikutnya.tanggalAktif === tanggalTab && dataHariBerikutnya.prakiraanPerJam.length > 0) {
                 hasilScraping.prakiraanMultiHari.push({
                    tanggal: dataHariBerikutnya.tanggalAktif,
                    data: dataHariBerikutnya.prakiraanPerJam
                });
            } else if (dataHariBerikutnya.prakiraanPerJam.length === 0) {
                 console.warn(`Tidak ada data prakiraan ditemukan untuk tanggal ${tanggalTab} setelah klik.`);
            } else {
                 console.warn(`Tanggal aktif (${dataHariBerikutnya.tanggalAktif}) tidak cocok dengan tab yang diklik (${tanggalTab}). Mungkin ada masalah timing.`);
            }

        } catch (clickError) {
            console.error(`Gagal mengklik atau memproses data untuk tab ${tanggalTab}: ${clickError.message}`);
            // Lanjutkan ke tab berikutnya jika ada error
        }
    }

    console.log("\nScraping selesai.");
    return hasilScraping;

  } catch (error) {
    console.error(`Terjadi kesalahan Puppeteer: ${error.message}`);
    // console.error(error.stack); // Tampilkan stack trace untuk debugging
    throw error;
  } finally {
    if (browser) {
      console.log("Menutup browser...");
      await browser.close();
    }
  }
}

// --- Eksekusi ---
(async () => {
  const args = process.argv.slice(2);
  const kodeWilayahInput = args[0] || '12.76.01.1001'; // Default Pabatu

  if (!kodeWilayahInput.match(/^[\d.]+$/)) {
    console.error("Kode wilayah tidak valid. Harusnya berupa angka dan titik (contoh: 12.76.01.1001)");
    process.exit(1);
  }

  try {
    const dataCuaca = await scrapeBMKGWithPuppeteer(kodeWilayahInput);
    console.log("\n--- Hasil Scraping Puppeteer ---");
    console.log(JSON.stringify(dataCuaca, null, 2));
  } catch (error) {
    console.error("Gagal menjalankan scraper Puppeteer.");
    process.exit(1);
  }
})();