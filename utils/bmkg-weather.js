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
            headless: true, // Ganti jadi false untuk debug visual jika perlu
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 90000
        });

        console.log('Halaman berhasil dimuat.');

        // Tunggu slider prakiraan jam, karena ini tampaknya paling konsisten
        try {
            await page.waitForSelector('.swiper-wrapper', { timeout: 20000 });
            console.log('Kontainer prakiraan jam ditemukan. Memulai ekstraksi data...');
        } catch (waitError) {
            console.error('Kontainer prakiraan jam tidak ditemukan. Halaman mungkin tidak lengkap.');
            // Log HTML saat gagal
            const htmlContent = await page.content();
            console.log("---------- HTML Content (Failure - Swiper) ----------");
            console.log(htmlContent.substring(0, 5000));
            console.log("-----------------------------------------------------");
            throw new Error('Kontainer prakiraan jam tidak ditemukan');
        }

        const data = await page.evaluate((inputKodeWilayah) => {
            const hasil = {
                lokasi: { kode: inputKodeWilayah || null, nama: null, provinsi: null, kabupaten: null, kecamatan: null },
                timezone: null,
                cuacaSaatIni: { waktuPembaruan: null, suhu: null, deskripsi: null, kelembapan: null, kecepatanAngin: null, arahAngin: null, jarakPandang: null },
                peringatan: null,
                prakiraanPerJam: [],
            };

            const getText = (element) => element?.textContent?.trim() || null;
            const getCleanText = (element, prefixToRemove) => {
                const text = getText(element);
                return text ? text.replace(prefixToRemove, '').trim() : null;
            }

            // --- Lokasi ---
            // Coba targetkan elemen p deskripsi dengan kelas yg lebih umum
            const headingElement = document.querySelector('h1'); // Ambil H1 sebagai referensi
            hasil.lokasi.nama = getCleanText(headingElement, /^Prakiraan Cuaca\s+/i); // Ambil nama dari H1

            // Cari <p> setelah H1 yang berisi teks 'di'
            let descriptionElement = null;
            if (headingElement) {
                 let sibling = headingElement.nextElementSibling;
                 while(sibling) {
                    if (sibling.tagName === 'P' && sibling.textContent?.toLowerCase().includes('prakiraan cuaca di')) {
                        descriptionElement = sibling;
                        break;
                    }
                    sibling = sibling.nextElementSibling;
                 }
            }

            const descriptionTextRaw = getText(descriptionElement);
            if (descriptionTextRaw && descriptionTextRaw.includes(',')) {
                const parts = descriptionTextRaw.split(',').map(part => part.trim());
                 if (parts.length >= 4) { // Kelurahan, Kec, Kab, Prov
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    hasil.lokasi.kabupaten = parts[parts.length - 2].replace(/^Kabupaten\s+/i, '');
                    hasil.lokasi.kecamatan = parts[parts.length - 3].replace(/^Kecamatan\s+/i, '');
                    // Nama dari H1 biasanya lebih akurat/singkat
                } else if (parts.length === 3) { // Kab/Kota, Kec, Prov
                     hasil.lokasi.provinsi = parts[parts.length - 1];
                     hasil.lokasi.kecamatan = parts[parts.length - 2].replace(/^Kecamatan\s+/i, '');
                     hasil.lokasi.kabupaten = parts[0].replace(/^Prakiraan cuaca di\s+/i, ''); // Asumsi bagian pertama adalah Kab/Kota
                } else if (parts.length === 2) { // Lokasi, Prov
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    // Kec/Kab tidak ada
                }
            }
             if (!hasil.lokasi.kode) {
                try {
                    const currentUrl = window.location.href;
                    const urlParts = currentUrl.split('/');
                    hasil.lokasi.kode = urlParts[urlParts.length - 1] || null;
                } catch (e) { /* ignore */ }
            }

            // --- Timezone ---
            const firstHourTitle = document.querySelector('.swiper-slide h4');
             if (firstHourTitle) {
                const match = getText(firstHourTitle)?.match(/(WIB|WITA|WIT)/);
                hasil.timezone = match ? match[0] : null;
            }

            // --- Cuaca Saat Ini ---
            // Cari elemen 'Saat ini' sebagai anchor
            let currentTimeAnchor = null;
            const timeElements = Array.from(document.querySelectorAll('time.font-medium')); // Cari semua <time>
            timeElements.forEach(t => {
                if(getText(t)?.toLowerCase().startsWith('saat ini')) {
                    currentTimeAnchor = t;
                }
            });

            if (currentTimeAnchor) {
                const currentSection = currentTimeAnchor.closest('div.md\\:flex'); // Cari parent div.md:flex terdekat

                if (currentSection) {
                     const updateTimeEl = currentSection.querySelector('time span span'); // Cari span di dalam time
                     hasil.cuacaSaatIni.waktuPembaruan = getCleanText(updateTimeEl, 'Pemutakhiran:');

                    // Suhu: Cari <p> dengan angka dan '°C'
                     const tempEl = currentSection.querySelector('p[class*="text-"][class*="leading-"]');
                     hasil.cuacaSaatIni.suhu = getText(tempEl);

                    // Deskripsi: Cari <p> font-medium di dekat suhu
                    const descEl = currentSection.querySelector('p.font-medium[class*="text-"]');
                     hasil.cuacaSaatIni.deskripsi = getText(descEl);

                    // Detail (Kelembapan, Angin, dll.)
                     // Cari container detail (flex, wrap, gap-3)
                     const detailContainer = currentSection.querySelector('.flex.flex-wrap.gap-3');
                     if (detailContainer) {
                        const detailElements = detailContainer.querySelectorAll(':scope > div.border');
                        detailElements.forEach(div => {
                            const textContent = getText(div);
                            const valueSpan = div.querySelector('span.font-bold');
                            const value = getText(valueSpan);
                            if (textContent) {
                                if (textContent.includes('Kelembapan')) hasil.cuacaSaatIni.kelembapan = value || null;
                                else if (textContent.includes('Kecepatan Angin')) hasil.cuacaSaatIni.kecepatanAngin = value || null;
                                else if (textContent.includes('Arah Angin')) {
                                    const directionSpans = div.querySelectorAll('span.font-bold');
                                    hasil.cuacaSaatIni.arahAngin = directionSpans.length > 0 ? getText(directionSpans[directionSpans.length - 1]) : null;
                                }
                                else if (textContent.includes('Jarak Pandang')) hasil.cuacaSaatIni.jarakPandang = value || null;
                            }
                        });
                    }

                    // Peringatan (di bawah container detail)
                     let potentialWarningContainer = detailContainer?.parentElement?.nextElementSibling; // Cari sibling setelah parent container detail
                     if(potentialWarningContainer && potentialWarningContainer.querySelector('svg path[d*="M8.485 2.495c"]')) {
                         const warningDiv = potentialWarningContainer.querySelector('div[class*="border-"]');
                         if (warningDiv) {
                            hasil.peringatan = warningDiv.querySelector('p span')?.textContent?.trim() || warningDiv.textContent?.trim() || null;
                         }
                     } else {
                         // Coba cari di tempat lain jika tidak ketemu di sana
                         const warningIcon = document.querySelector('svg path[d*="M8.485 2.495c"]'); // Cari ikon warning global
                         const warningDivGlobal = warningIcon?.closest('div[class*="border-"]');
                          if (warningDivGlobal && !warningDivGlobal.closest('.swiper-slide')) { // Pastikan bukan di slide
                            hasil.peringatan = warningDivGlobal.querySelector('p span')?.textContent?.trim() || warningDivGlobal.textContent?.trim() || null;
                          }
                     }
                }
            }


            // --- Prakiraan Per Jam ---
            const hourlyContainer = document.querySelector('.swiper-wrapper');
            if (hourlyContainer) {
                const hourlySlides = Array.from(hourlyContainer.querySelectorAll('.swiper-slide'));
                 hourlySlides.forEach(slide => {
                    const jam = { waktu: null, suhu: null, deskripsi: null, kelembapan: null, kecepatanAngin: null, arahAngin: null, jarakPandang: null };
                    jam.waktu = getText(slide.querySelector('h4'));
                    jam.suhu = getText(slide.querySelector('p.font-bold[class*="text-"]'));
                    jam.deskripsi = getText(slide.querySelector('p.font-bold.mt-4'));

                    const detailBox = slide.querySelector('div.border.rounded-lg');
                    if (detailBox) {
                        const detailItems = detailBox.querySelectorAll(':scope > div');
                        detailItems.forEach((item) => {
                             const textContent = getText(item);
                             const value = item.querySelector('p.font-bold')?.textContent?.trim();
                             if (textContent) {
                                if (textContent.includes('%')) jam.kelembapan = value || textContent.split(':').pop().trim();
                                else if (textContent.toLowerCase().includes('km/jam')) jam.kecepatanAngin = value || textContent.split(':').pop().trim();
                                else if (item.querySelector('svg[d*="M10 .833a9"]')) { // Cari ikon kompas untuk arah angin
                                    const arahSpan = item.querySelector('span > span.font-bold');
                                    jam.arahAngin = getText(arahSpan) || textContent.split(':').pop().split('<')[0].trim();
                                }
                                else if (item.querySelector('svg path[d*="M10 3.333c"]')) { // Cari ikon mata untuk jarak pandang
                                     jam.jarakPandang = value || textContent.split(':').pop().trim();
                                }
                            }
                        });
                    }
                    if (jam.waktu) hasil.prakiraanPerJam.push(jam);
                });
            }

            // Hapus debug info sebelum return final
            delete hasil._debug;
            return hasil;
        }, kodeWilayah);

        console.log('Ekstraksi data selesai.');
        return data;

    } catch (error) {
        console.error(`Error saat scraping ${url}:`, error);
        return null; // Return null pada error umum
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
            console.log('Scraping gagal atau tidak ada data yang diekstrak.');
        }
    })
    .catch(err => {
        console.error('Terjadi error pada proses utama:', err);
    });