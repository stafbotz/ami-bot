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

    // --- Ekstraksi Prakiraan Per Jam ---
    const prakiraanPerJam = [];
    const tanggalAktifButton = document.querySelector('button.border-blue-primary');
    const tanggalAktifText = tanggalAktifButton ? cleanTextBrowser(tanggalAktifButton.textContent) : null;
    const currentYear = new Date().getFullYear();
    const monthMap = { 'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'Mei': '05', 'Jun': '06', 'Jul': '07', 'Agu': '08', 'Sep': '09', 'Okt': '10', 'Nov': '11', 'Des': '12' };

    const slides = document.querySelectorAll('div.swiper-slide');
    slides.forEach(slide => {
        const jamRaw = cleanTextBrowser(slide.querySelector('h4')?.textContent);
        const jam = jamRaw?.replace('WIB', '').trim();

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
    const dataHariPertama = await page.evaluate(extractPageData);
    hasilScraping.cuacaSaatIni = dataHariPertama.cuacaSaatIni;
    hasilScraping.peringatan = dataHariPertama.peringatan;
    let jamPertamaSebelumKlik = null; // Deklarasi di luar loop
    if (dataHariPertama.tanggalAktif && dataHariPertama.prakiraanPerJam.length > 0) {
      hasilScraping.prakiraanMultiHari.push({
        tanggal: dataHariPertama.tanggalAktif,
        data: dataHariPertama.prakiraanPerJam
      });
      jamPertamaSebelumKlik = dataHariPertama.prakiraanPerJam[0]?.waktu; // Ambil waktu slide pertama
      console.log(`Data hari pertama (${dataHariPertama.tanggalAktif}) diambil. Jam pertama awal: ${jamPertamaSebelumKlik}`);
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
        console.log(`[Debug] Jam pertama sebelum klik ${tanggalTarget}: ${jamPertamaSebelumKlik}`);

        try {
            const buttonSelector = `button ::-p-text("${tanggalTarget}")`;
            await page.waitForSelector(buttonSelector, { timeout: 10000 });
            await page.click(buttonSelector);
            console.log(`Tombol tab ${tanggalTarget} diklik.`);

            // *** STRATEGI MENUNGGU KONTEN BERUBAH ***
            console.log(`Menunggu konten swiper berubah dari jam ${jamPertamaSebelumKlik}...`);
            await page.waitForFunction(
                (previousFirstHour) => {
                    const currentFirstSlideHeader = document.querySelector('div.swiper-slide h4');
                    const currentFirstHour = currentFirstSlideHeader ? currentFirstSlideHeader.textContent.trim().replace(/\s+/g, ' ').replace('WIB', '').trim() : null;
                    return currentFirstHour !== null && currentFirstHour !== previousFirstHour;
                },
                { timeout: 20000 },
                jamPertamaSebelumKlik
            );

            const jamPertamaSetelahWait = await page.evaluate(() => {
                const firstSlideHeader = document.querySelector('div.swiper-slide h4');
                return firstSlideHeader ? firstSlideHeader.textContent.trim().replace(/\s+/g, ' ').replace('WIB', '').trim() : null;
            });
            console.log(`Konten swiper terdeteksi berubah untuk ${tanggalTarget}. Jam pertama sekarang: ${jamPertamaSetelahWait}`);

            // *** PERBAIKAN YANG SEHARUSNYA BENAR ***
            await page.waitForTimeout(500); // Gunakan T kapital

            console.log(`Mengambil data untuk tanggal: ${tanggalTarget}...`);
            const dataHariBerikutnya = await page.evaluate(extractPageData);

            // Validasi
            if (dataHariBerikutnya.prakiraanPerJam.length > 0) {
                 hasilScraping.prakiraanMultiHari.push({
                    tanggal: tanggalTarget,
                    data: dataHariBerikutnya.prakiraanPerJam
                });
                 console.log(`Data untuk ${tanggalTarget} berhasil diambil.`);
                 jamPertamaSebelumKlik = dataHariBerikutnya.prakiraanPerJam[0]?.waktu; // Update untuk iterasi berikutnya
                 if (dataHariBerikutnya.tanggalAktif !== tanggalTarget) {
                     console.warn(`[Info] Tanggal aktif terdeteksi (${dataHariBerikutnya.tanggalAktif}) berbeda dari target (${tanggalTarget}), tapi data diambil.`);
                 }
            } else {
                 console.warn(`Tidak ada data prakiraan ditemukan untuk tanggal ${tanggalTarget} setelah konten berubah.`);
            }

        } catch (error) {
            if (error.name === 'TimeoutError') {
                console.error(`Timeout saat memproses tab ${tanggalTarget}. Konten mungkin tidak berubah atau tombol/tab tidak aktif tepat waktu.`);
            } else {
                // Jika error BUKAN TimeoutError, kemungkinan besar itu adalah error ketik saya lagi, atau error lain.
                console.error(`Gagal memproses tab ${tanggalTarget}: ${error.message}`);
            }
             try {
                 const pageTitle = await page.title();
                 const currentUrl = page.url();
                 const activeTabText = await page.evaluate(() => document.querySelector('button.border-blue-primary')?.textContent.trim().replace(/\s+/g, ' '));
                 console.error(`[Debug Error State] URL: ${currentUrl}, Judul: ${pageTitle}, Tab Aktif Terdeteksi: ${activeTabText}`);
             } catch (debugError) {
                 console.error("[Debug Error State] Gagal mendapatkan info state halaman.");
             }
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