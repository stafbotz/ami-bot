import puppeteer from 'puppeteer';

async function scrapeBmkgCuaca(kodeWilayah) {
  if (!kodeWilayah) {
    console.error('Error: Kode wilayah diperlukan.');
    console.log('Contoh penggunaan: node scrapeBmkg.js 53.01.06.2018');
    return null;
  }

  const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${kodeWilayah}`;
  console.log(`Mencoba scraping dari: ${url}`);

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // --- PERUBAHAN DI SINI ---
    await page.goto(url, {
      waitUntil: 'networkidle2', // Lebih fleksibel dari networkidle0
      timeout: 90000 // Tingkatkan timeout menjadi 90 detik
    });
    // --- AKHIR PERUBAHAN ---

    console.log('Halaman berhasil dimuat. Memulai ekstraksi data...');

    const data = await page.evaluate((inputKodeWilayah) => {
        const hasil = {
            lokasi: {
            kode: inputKodeWilayah || null,
            nama: null,
            provinsi: null,
            kabupaten: null,
            kecamatan: null,
            },
            timezone: null,
            cuacaSaatIni: {
            waktuPembaruan: null,
            suhu: null,
            deskripsi: null,
            kelembapan: null,
            kecepatanAngin: null,
            arahAngin: null,
            jarakPandang: null,
            },
            peringatan: null,
            prakiraanPerJam: [],
        };

        // --- Ekstrak Lokasi dari Deskripsi ---
        const descriptionElement = document.querySelector('h1 + p');
        if (descriptionElement) {
            const descriptionText = descriptionElement.textContent?.trim();
            if (descriptionText && descriptionText.includes(',')) {
                const parts = descriptionText.split(',').map(part => part.trim());
                if (parts.length >= 4) {
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    hasil.lokasi.kabupaten = parts[parts.length - 2].replace(/^Kabupaten\s+/i, '');
                    hasil.lokasi.kecamatan = parts[parts.length - 3].replace(/^Kecamatan\s+/i, '');
                    hasil.lokasi.nama = parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                }
            }
        }
        if (!hasil.lokasi.nama) {
                const mainHeading = document.querySelector('h1');
                if (mainHeading && mainHeading.textContent) {
                    hasil.lokasi.nama = mainHeading.textContent.replace(/^Prakiraan Cuaca\s+/i, '').trim();
                }
        }
        if (!hasil.lokasi.kode) {
                const currentUrl = window.location.href;
                const urlParts = currentUrl.split('/');
                hasil.lokasi.kode = urlParts[urlParts.length - 1] || null;
        }


        // --- Ekstrak Timezone dari Prakiraan Jam ---
        const firstHourTitle = document.querySelector('.swiper-slide h4');
        if (firstHourTitle) {
            const match = firstHourTitle.textContent?.match(/(WIB|WITA|WIT)/);
            hasil.timezone = match ? match[0] : null;
        }

        // --- Ekstrak Cuaca Saat Ini ---
        const currentSection = document.querySelector('.bg-\\[linear-gradient\\(151deg');
        if (currentSection) {
            const updateTimeEl = currentSection.querySelector('time span span');
            hasil.cuacaSaatIni.waktuPembaruan = updateTimeEl?.textContent?.replace('Pemutakhiran:', '').trim() || null;

            const tempEl = currentSection.querySelector('p.text-\\[40px\\], p.text-\\[48px\\], p.text-\\[56px\\]');
            hasil.cuacaSaatIni.suhu = tempEl?.textContent?.trim() || null;

            const descEl = currentSection.querySelector('.md\\:flex p.font-medium');
            hasil.cuacaSaatIni.deskripsi = descEl?.textContent?.trim() || null;

            const detailElements = currentSection.querySelectorAll('.mt-5.md\\:mt-6 > div');
            detailElements.forEach(div => {
                const textContent = div.textContent?.trim();
                if (textContent) {
                    if (textContent.includes('Kelembapan:')) {
                        hasil.cuacaSaatIni.kelembapan = textContent.split(':')[1]?.trim() || null;
                    } else if (textContent.includes('Kecepatan Angin:')) {
                        hasil.cuacaSaatIni.kecepatanAngin = textContent.split(':')[1]?.trim() || null;
                    } else if (textContent.includes('Arah Angin dari:')) {
                        const arahFull = textContent.split(':')[1]?.trim();
                        const arahNama = arahFull?.split('<')[0]?.trim();
                        hasil.cuacaSaatIni.arahAngin = arahNama || arahFull || null;
                    } else if (textContent.includes('Jarak Pandang:')) {
                        hasil.cuacaSaatIni.jarakPandang = textContent.split(':')[1]?.trim() || null;
                    }
                }
            });
        }

        // --- Ekstrak Peringatan ---
        const warningElement = document.querySelector('.bg-\\[rgba\\(255\\,_165\\,_0\\,_0\\.10\\)\\] p span, .bg-\\[#FFA5001A\\] p span');
        hasil.peringatan = warningElement ? warningElement.textContent?.trim() : null;
        const generalWarning = document.querySelector('.bg-\\[#FF000029\\], .bg-\\[#FFC90029\\], .bg-\\[#00990029\\]');
        if (!hasil.peringatan && generalWarning) {
            hasil.peringatan = generalWarning.querySelector('p span')?.textContent?.trim() || generalWarning.textContent?.trim() || null;
        }


        // --- Ekstrak Prakiraan Per Jam ---
        const hourlySlides = Array.from(document.querySelectorAll('.swiper-slide'));
        hourlySlides.forEach(slide => {
            const jam = {};
            const timeEl = slide.querySelector('h4');
            jam.waktu = timeEl?.textContent?.trim() || null;

            const tempEl = slide.querySelector('p.text-\\[32px\\], p.text-\\[48px\\]');
            jam.suhu = tempEl?.textContent?.trim() || null;

            const descEl = slide.querySelector('p.text-sm.md\\:text-lg.font-bold.mt-4');
            jam.deskripsi = descEl?.textContent?.trim() || null;

            const detailBox = slide.querySelector('.bg-\\[#FFFFFF33\\]');
            if (detailBox) {
                const detailItems = detailBox.querySelectorAll('div.flex.w-full');
                detailItems.forEach((item, index) => {
                    const valueEl = item.querySelector('p.text-black-primary.font-bold');
                    const textContent = item.textContent?.trim();

                    if (valueEl || textContent) {
                        const value = valueEl?.textContent?.trim();
                        if (index === 0) jam.kelembapan = value || null;
                        else if (index === 1) jam.kecepatanAngin = value || null;
                        else if (index === 2) {
                            const directionSpan = item.querySelector('span > span.text-black-primary.font-bold');
                            let arahAnginText = directionSpan?.textContent?.trim();
                            if (!arahAnginText && textContent) {
                            arahAnginText = textContent.split('<')[0]?.trim();
                            }
                            jam.arahAngin = arahAnginText || null;
                        }
                        else if (index === 3) jam.jarakPandang = value || null;
                    }
                });
            }

            if (jam.waktu) {
                hasil.prakiraanPerJam.push(jam);
            }
        });

        return hasil;
    }, kodeWilayah);

    console.log('Ekstraksi data selesai.');
    return data;

  } catch (error) {
    console.error(`Error saat scraping ${url}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser ditutup.');
    }
  }
}

// --- Ambil Kode Wilayah dari Argumen CLI ---
const kodeWilayahInput = process.argv[2];

// --- Jalankan Scraper ---
scrapeBmkgCuaca(kodeWilayahInput)
  .then(data => {
    if (data) {
      console.log('\n--- Hasil Scraping ---');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log('Scraping gagal atau tidak ada data.');
    }
  })
  .catch(err => {
    console.error('Terjadi error pada proses utama:', err);
  });