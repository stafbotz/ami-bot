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
 * @param {string} targetDateString Tanggal yang diharapkan aktif (misal "28 Mar").
 * @returns {object} Objek berisi data cuaca saat ini, peringatan, tanggal aktif, dan prakiraan jam.
 */
function extractPageData(targetDateString) { // Terima tanggal target
    // Fungsi helper cleanTextBrowser harus didefinisikan di dalam evaluate juga
    const cleanTextBrowser = (text) => {
        return text ? text.replace(/\s+/g, ' ').trim() : null;
    };

    // --- Ekstraksi Cuaca Saat Ini (Hanya relevan saat pertama kali) ---
    const cuacaSaatIniContainer = document.querySelector('div.md\\:flex.items-center.gap-6');
    const cuacaSaatIni = {};
    if (cuacaSaatIniContainer) {
        // Pemutakhiran
        const timeElement = Array.from(cuacaSaatIniContainer.querySelectorAll('time')).find(el => el.textContent.includes("Saat ini"));
        const groupSpan = timeElement ? timeElement.querySelector('span.group') : null;
        const pemutakhiranSpan = groupSpan ? groupSpan.querySelector('span') : null;
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

        // Detail
        const detailsContainer = cuacaSaatIniContainer.querySelector('div.relative.mt-5');
        if (detailsContainer) {
            detailsContainer.querySelectorAll('div.flex.gap-2.items-center').forEach(el => {
                const detailText = cleanTextBrowser(el.textContent);
                const boldText = cleanTextBrowser(el.querySelector('span.font-bold')?.textContent);
                const boldTextDirection = cleanTextBrowser(el.querySelector('span > span.font-bold')?.textContent);

                if (detailText?.includes('Kelembapan:')) cuacaSaatIni.kelembapan = boldText;
                else if (detailText?.includes('Kecepatan Angin:')) cuacaSaatIni.kecepatanAngin = boldText; // Perbaiki jika selectornya salah
                else if (detailText?.includes('Arah Angin dari:')) cuacaSaatIni.arahAngin = boldTextDirection;
                else if (detailText?.includes('Jarak Pandang:')) cuacaSaatIni.jarakPandang = boldText;
            });
        }
    } // else {
        // console.warn("Container cuaca saat ini tidak ditemukan (mungkin bukan panggilan pertama).");
    // } // Bisa diaktifkan jika perlu

    // --- Ekstraksi Peringatan (Hanya relevan saat pertama kali) ---
    const peringatanElement = document.querySelector('div.border-\\[\\#FFA500\\] p');
    const peringatan = peringatanElement ? cleanTextBrowser(peringatanElement.textContent) : null;

    // --- Ekstraksi Prakiraan Per Jam ---
    const prakiraanPerJam = [];
    // *** PERBAIKAN LOGIKA TANGGAL ISO ***
    // Gunakan targetDateString yang dilewatkan, BUKAN dari tombol aktif saat ini
    const tanggalAktifText = targetDateString; // Gunakan tanggal dari argumen
    const currentYear = new Date().getFullYear();
    const monthMap = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'Mei': '05', 'Jun': '06', 'Jul': '07', 'Agu': '08', 'Sep': '09', 'Okt': '10', 'Nov': '11', 'Des': '12' };

    const slides = document.querySelectorAll('div.swiper-slide');
    slides.forEach(slide => {
        const jamRaw = cleanTextBrowser(slide.querySelector('h4')?.textContent);
        const jam = jamRaw?.replace('WIB', '').trim();

        const suhu = cleanTextBrowser(slide.querySelector('p.text-\\[32px\\]')?.textContent);
        const deskripsi = cleanTextBrowser(slide.querySelector('p.text-sm.md\\:text-lg.font-bold')?.textContent);

        const detailSlide = slide.querySelector('div.bg-\\[\\#FFFFFF33\\]');
        // *** PERBAIKAN SELECTOR KECEPATAN ANGIN ***
        // Cari div kedua, lalu cari p.font-bold di dalamnya
        const kelembapan = detailSlide ? cleanTextBrowser(detailSlide.querySelector('div:nth-child(1) p.font-bold')?.textContent) : null;
        const kecepatanAnginElem = detailSlide ? detailSlide.querySelector('div:nth-child(2)') : null;
        const kecepatanAngin = kecepatanAnginElem ? cleanTextBrowser(kecepatanAnginElem.querySelector('p.font-bold')?.textContent) : null;
        const arahAnginElem = detailSlide ? detailSlide.querySelector('div:nth-child(3)') : null;
        const arahAngin = arahAnginElem ? cleanTextBrowser(arahAnginElem.querySelector('span > span.font-bold')?.textContent) : null;
        const jarakPandangElem = detailSlide ? detailSlide.querySelector('div:nth-child(4)') : null;
        const jarakPandang = jarakPandangElem ? cleanTextBrowser(jarakPandangElem.querySelector('p.font-bold')?.textContent) : null;


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
                dateTimeISO: dateTimeISO, // Sekarang seharusnya benar
                suhu: suhu,
                deskripsi: deskripsi,
                kelembapan: kelembapan,
                kecepatanAngin: kecepatanAngin, // Sekarang seharusnya benar
                arahAngin: arahAngin,
                jarakPandang: jarakPandang,
            });
        }
    });

    // Dapatkan tanggal aktif aktual untuk logging di luar
    const actualActiveDate = document.querySelector('button.border-blue-primary')?.textContent.trim().replace(/\s+/g, ' ');

    return {
        cuacaSaatIni, // Hanya relevan saat pertama kali
        peringatan,    // Hanya relevan saat pertama kali
        tanggalAktif: actualActiveDate, // Tanggal yang *sebenarnya* aktif
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

  let browser = null;
  const hasilScraping = {
    cuacaSaatIni: null,
    peringatan: null,
    prakiraanMultiHari: []
  };

  try {
    browser = await puppeteer.launch({
      headless: true, // Set false untuk melihat browser
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1366, height: 768 });

    console.log(`Navigasi ke halaman...`);
    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 120000 // Timeout 120 detik
    });

    console.log(`Menunggu elemen kunci muncul...`);
    await page.waitForSelector('div.md\\:flex.items-center.gap-6', { timeout: 30000 });
    await page.waitForSelector('div.swiper', { timeout: 30000 });
    await page.waitForSelector('button.border-blue-primary', { timeout: 30000 });
    await page.waitForSelector('button.border-\\[\\#CBD5E1\\]', { timeout: 30000 });

    // 1. Scrape data hari pertama
    console.log(`Mengambil data hari pertama...`);
    // Ambil tanggal aktif pertama kali
    const tanggalAktifAwal = await page.evaluate(() => document.querySelector('button.border-blue-primary')?.textContent.trim().replace(/\s+/g, ' '));
    const dataHariPertama = await page.evaluate(extractPageData, tanggalAktifAwal); // Kirim tanggal target
    hasilScraping.cuacaSaatIni = dataHariPertama.cuacaSaatIni;
    hasilScraping.peringatan = dataHariPertama.peringatan;

    if (tanggalAktifAwal && dataHariPertama.prakiraanPerJam.length > 0) {
      hasilScraping.prakiraanMultiHari.push({
        tanggal: tanggalAktifAwal,
        data: dataHariPertama.prakiraanPerJam
      });
      console.log(`Data hari pertama (${tanggalAktifAwal}) berhasil diambil.`);
    } else {
        console.warn("Data prakiraan hari pertama tidak lengkap atau tidak ditemukan.");
    }

    // 2. Cari semua tombol tab tanggal
    const allTabButtons = await page.$$('button[class*="border-blue-primary"], button.border-\\[\\#CBD5E1\\]');
    const tabDates = [];
    for (const btn of allTabButtons) {
        const dateText = await page.evaluate(el => el.textContent.trim().replace(/\s+/g, ' '), btn);
        if (dateText && !dateText.includes('Contact Center')) {
            tabDates.push(dateText);
        }
    }
    console.log(`Menemukan total ${tabDates.length} tab tanggal: ${tabDates.join(', ')}`);

    // 3. Loop melalui tab tanggal MULAI DARI YANG KEDUA
    for (let i = 1; i < tabDates.length; i++) {
        const tanggalTarget = tabDates[i];
        console.log(`\nMencoba memproses tab untuk tanggal: ${tanggalTarget}...`);

        try {
            const buttonSelector = `button ::-p-text("${tanggalTarget}")`;
            await page.waitForSelector(buttonSelector, { timeout: 10000 });
            await page.click(buttonSelector);
            console.log(`Tombol tab ${tanggalTarget} diklik.`);

            // *** STRATEGI MENUNGGU BARU: Tunggu Tab Aktif, TAPI JANGAN GAGAL JIKA TIMEOUT ***
            console.log(`Menunggu tab ${tanggalTarget} menjadi aktif (maks 15 detik)...`);
            let tabAktifBenar = false;
            try {
                await page.waitForFunction(
                    (dateText) => {
                        const activeButton = document.querySelector('button.border-blue-primary');
                        return activeButton && activeButton.textContent.trim().replace(/\s+/g, ' ') === dateText;
                    },
                    { timeout: 15000 },
                    tanggalTarget
                );
                tabAktifBenar = true;
                console.log(`Tab ${tanggalTarget} terkonfirmasi aktif.`);
            } catch (waitError) {
                console.warn(`Timeout atau error menunggu tab ${tanggalTarget} aktif. Akan tetap mencoba mengambil data.`);
                // Tidak melempar error, lanjutkan saja
            }

            // Tambahkan jeda SELALU setelah klik, terlepas dari hasil waitForFunction
            await page.waitForTimeout(1500); // Jeda 1.5 detik untuk memberi waktu render

            console.log(`Mengambil data (setelah klik ${tanggalTarget})...`);
            // Kirim tanggalTarget ke extractPageData agar ISO date benar
            const dataHariBerikutnya = await page.evaluate(extractPageData, tanggalTarget);

            // Validasi Utama: Apakah ada data prakiraan?
            if (dataHariBerikutnya.prakiraanPerJam.length > 0) {
                 hasilScraping.prakiraanMultiHari.push({
                    tanggal: tanggalTarget, // Gunakan tanggal target dari loop
                    data: dataHariBerikutnya.prakiraanPerJam
                });
                 console.log(`Data untuk ${tanggalTarget} berhasil diambil.`);
                 // Log jika tanggal aktif *terdeteksi* berbeda (hanya info)
                 if (!tabAktifBenar && dataHariBerikutnya.tanggalAktif !== tanggalTarget) {
                     console.warn(`[Info Tambahan] Tab aktif terdeteksi (${dataHariBerikutnya.tanggalAktif}) saat pengambilan data berbeda dari target (${tanggalTarget}).`);
                 }
            } else {
                 console.warn(`Tidak ada data prakiraan ditemukan untuk tanggal ${tanggalTarget} setelah klik.`);
                 // Log tambahan jika tab aktif terdeteksi salah
                 if (!tabAktifBenar) {
                    console.warn(`[Info Tambahan] Tab aktif terdeteksi (${dataHariBerikutnya.tanggalAktif}) saat data kosong.`);
                 }
            }

        } catch (error) {
            // Error klik atau waitForSelector sebelum klik
             console.error(`Gagal mengklik atau menemukan tombol untuk tab ${tanggalTarget}: ${error.message}`);
             // Jangan lanjutkan loop jika klik gagal? Tergantung kebutuhan. Di sini kita coba lanjut.
        }
    }

    console.log("\nScraping selesai.");
    return hasilScraping;

  } catch (error) {
    console.error(`Terjadi kesalahan Puppeteer utama: ${error.message}`);
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