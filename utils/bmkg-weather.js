import puppeteer from 'puppeteer';

// Fungsi terpisah untuk mengekstrak data per jam dari slide saat ini
async function extractHourlyForecast(page) {
    try { // Tambahkan try-catch di sini untuk isolasi error evaluate
        return await page.evaluate(() => {
            const hourlyForecast = [];
            const getText = (element) => element?.textContent?.trim() || null;

            const hourlyContainer = document.querySelector('.swiper-wrapper');
            if (hourlyContainer) {
                const hourlySlides = Array.from(hourlyContainer.querySelectorAll('.swiper-slide'));
                hourlySlides.forEach(slide => {
                    const jam = { waktu: null, suhu: null, deskripsi: null, kelembapan: null, kecepatanAngin: null, arahAngin: null, jarakPandang: null };
                    jam.waktu = getText(slide.querySelector('h4'));
                    jam.suhu = getText(slide.querySelector('p.font-bold[class*="text-\\["]'));
                    jam.deskripsi = getText(slide.querySelector('p.font-bold.mt-4'));

                    const detailBox = slide.querySelector('div.border.rounded-lg');
                    if (detailBox) {
                        const detailItems = detailBox.querySelectorAll(':scope > div');
                        detailItems.forEach((item) => {
                            const textContent = getText(item);
                            const value = item.querySelector('p.font-bold')?.textContent?.trim();
                            const svgs = item.querySelectorAll('svg');

                            if (textContent) {
                                if (textContent.includes('%')) {
                                    jam.kelembapan = value || textContent.split(':').pop().trim();
                                } else if (textContent.toLowerCase().includes('km/jam')) {
                                    jam.kecepatanAngin = value || textContent.split(':').pop().trim();
                                } else if (item.querySelector('p > span > span.font-bold')) { // Cari struktur p > span > span.font-bold
                                    jam.arahAngin = item.querySelector('p > span > span.font-bold').textContent.trim();
                                } else if (item.querySelector('svg path[d*="M10 3.333c"]')) { // Ikon mata
                                    jam.jarakPandang = value || textContent.split(':').pop().trim();
                                }
                            }
                        });
                    }
                    if (jam.waktu) hourlyForecast.push(jam);
                });
            }
            return hourlyForecast;
        });
    } catch (evalError) {
        console.error("Error di dalam extractHourlyForecast evaluate:", evalError);
        return [{ error: "Gagal mengevaluasi data per jam" }]; // Kembalikan indikasi error
    }
}


async function scrapeBmkgCuaca(kodeWilayah) {
    if (!kodeWilayah) {
        console.error('Error: Kode wilayah diperlukan.');
        console.log('Contoh penggunaan: node scrapeBmkg.js 53.01.06.2018');
        return null;
    }

    const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${kodeWilayah}`;
    console.log(`Mencoba scraping dari: ${url}`);

    let browser = null;
    let page = null; // <-- Deklarasi page di sini

    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });

        page = await browser.newPage(); // <-- Inisialisasi page di sini
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36');

        console.log(`Navigasi ke: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: 90000
        });
        console.log('Halaman berhasil dimuat.');

        try {
            await page.waitForSelector('.swiper-wrapper, time.font-medium', { timeout: 25000 });
            console.log('Elemen kunci ditemukan. Memulai ekstraksi data awal...');
        } catch (waitError) {
            console.error('Elemen kunci (slider/waktu) tidak ditemukan setelah menunggu.');
            throw waitError;
        }
        // await page.waitForTimeout(1000); // <-- HAPUS INI

        const initialData = await page.evaluate((inputKodeWilayah) => {
             const hasil = {
                lokasi: { kode: inputKodeWilayah || null, kelurahan: null, provinsi: null, kabupaten: null, kecamatan: null },
                timezone: null,
                cuacaSaatIni: { waktuPembaruan: null, suhu: null, deskripsi: null, kelembapan: null, kecepatanAngin: null, arahAngin: null, jarakPandang: null },
                peringatan: null,
                prakiraan: {}
            };

            const getText = (element) => element?.textContent?.trim() || null;
            const getCleanText = (element, prefixToRemove) => {
                const text = getText(element);
                return text ? text.replace(prefixToRemove, '').trim() : null;
            }

            // --- Lokasi ---
            const headingElement = document.querySelector('h1');
            hasil.lokasi.kelurahan = getCleanText(headingElement, /^Prakiraan Cuaca\s+/i);

            const headingContainer = headingElement?.closest('div.flex-col');
            let descriptionElement = null;
            if (headingContainer) {
                 const pElements = headingContainer.parentElement?.querySelectorAll('p.text-gray-primary');
                 if (pElements) {
                    for (const p of pElements) {
                        if (getText(p)?.toLowerCase().startsWith('prakiraan cuaca di')) {
                            descriptionElement = p;
                            break;
                        }
                    }
                 }
            }

            const descriptionTextRaw = getText(descriptionElement);
            if (descriptionTextRaw && descriptionTextRaw.includes(',')) {
                const parts = descriptionTextRaw.split(',').map(part => part.trim());
                 if (parts.length >= 4) {
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    hasil.lokasi.kabupaten = parts[parts.length - 2].replace(/^Kabupaten\s+/i, '');
                    hasil.lokasi.kecamatan = parts[parts.length - 3].replace(/^Kecamatan\s+/i, '');
                    const kelurahanDariDesc = parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                    if(kelurahanDariDesc) hasil.lokasi.kelurahan = kelurahanDariDesc;
                } else if (parts.length === 3) {
                     hasil.lokasi.provinsi = parts[parts.length - 1];
                     hasil.lokasi.kecamatan = parts[parts.length - 2].replace(/^Kecamatan\s+/i, '');
                     hasil.lokasi.kabupaten = parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                     if (!hasil.lokasi.kelurahan) hasil.lokasi.kelurahan = hasil.lokasi.kabupaten;
                } else if (parts.length === 2) {
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    if (!hasil.lokasi.kelurahan) {
                         const namaMatch = parts[0].match(/di\s+(.*?)$/i);
                         hasil.lokasi.kelurahan = namaMatch ? namaMatch[1].trim() : parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                    }
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
            let currentTimeAnchor = null;
            const timeElements = Array.from(document.querySelectorAll('time.font-medium'));
            timeElements.forEach(t => {
                if(getText(t)?.toLowerCase().startsWith('saat ini')) {
                    currentTimeAnchor = t;
                }
            });

            if (currentTimeAnchor) {
                const currentSection = currentTimeAnchor.closest('div.md\\:flex');
                if (currentSection) {
                     const updateTimeEl = currentSection.querySelector('time span span');
                     hasil.cuacaSaatIni.waktuPembaruan = getCleanText(updateTimeEl, 'Pemutakhiran:');

                     const tempEl = currentSection.querySelector('p[class*="text-"][class*="leading-"]');
                     hasil.cuacaSaatIni.suhu = getText(tempEl);

                     const descEl = currentSection.querySelector('p.font-medium.text-black-primary');
                     hasil.cuacaSaatIni.deskripsi = getText(descEl);

                     const detailContainer = currentSection.querySelector('.flex.flex-wrap.items-center.gap-3');
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

                    // Peringatan
                    const warningDiv = currentSection.querySelector('div[class*="border-"][class*="bg-"]');
                    if (warningDiv && warningDiv.querySelector('svg path[d*="M8.485 2.495c"]')) {
                       hasil.peringatan = warningDiv.querySelector('p span')?.textContent?.trim() || warningDiv.textContent?.trim() || null;
                    }
                }
            }
            return hasil;
        }, kodeWilayah);

        if (!initialData) {
            throw new Error("Gagal mengambil data awal.");
        }

        console.log("Mengekstrak prakiraan jam untuk tanggal pertama...");
        const firstDateButton = await page.$('div.overflow-x-scroll button.border-blue-primary');
        const firstDateText = firstDateButton ? await page.evaluate(el => el.textContent.trim(), firstDateButton) : "Tanggal_1"; // Fallback key
        initialData.prakiraan[firstDateText] = await extractHourlyForecast(page);

        const dateButtons = await page.$$('div.overflow-x-scroll button.border:not(.border-blue-primary)');
        console.log(`Menemukan ${dateButtons.length} tombol tanggal tambahan.`);

        for (let i = 0; i < dateButtons.length; i++) {
            // Re-fetch tombol setiap iterasi karena DOM bisa berubah
            const currentButtons = await page.$$('div.overflow-x-scroll button.border:not(.border-blue-primary)');
            if (i >= currentButtons.length) {
                console.warn(`Tombol index ${i} tidak ditemukan lagi setelah klik sebelumnya.`);
                break; // Keluar loop jika tombol menghilang
            }
            const button = currentButtons[i];
            const dateText = await page.evaluate(el => el.textContent.trim(), button);
            console.log(`\nMengklik tombol tanggal: ${dateText}`);

            try {
                await button.click();
                console.log(`Menunggu data untuk ${dateText} dimuat...`);
                // Tunggu jaringan selesai dan beri sedikit jeda
                await page.waitForNetworkIdle({ idleTime: 750, timeout: 25000 }); // Idle time sedikit lebih lama
                // await new Promise(resolve => setTimeout(resolve, 500)); // Jeda JS jika perlu

                console.log(`Data untuk ${dateText} selesai dimuat. Mengekstrak...`);
                initialData.prakiraan[dateText] = await extractHourlyForecast(page);

            } catch (clickError) {
                console.error(`Gagal memproses tanggal ${dateText}: ${clickError.message}`);
                initialData.prakiraan[dateText] = [{ error: `Gagal memuat data: ${clickError.message}` }];
                // Coba log HTML saat error klik/tunggu
                try {
                    const htmlContent = await page.content();
                    console.log(`---------- HTML Content (Error Klik/Tunggu ${dateText}) ----------`);
                    console.log(htmlContent.substring(0, 8000));
                    console.log("---------------------------------------------------------------");
                } catch (htmlErr) { console.error("Gagal log HTML"); }
                // Pertimbangkan untuk berhenti jika satu tanggal gagal, atau lanjut?
                // break; // Uncomment jika ingin berhenti saat tanggal pertama gagal
            }
        }

        console.log('Ekstraksi data multi-tanggal selesai.');
        return initialData;

    } catch (error) {
        console.error(`Error saat scraping ${url}:`, error);
         // Perbaikan blok catch utama
        if (page && !page.isClosed()) { // <-- Cek page di sini
             try {
                const htmlContent = await page.content();
                console.log("---------- HTML Content (General Error) ----------");
                console.log(htmlContent.substring(0, 10000));
                console.log("--------------------------------------------------");
             } catch (htmlError) {
                 console.error("Gagal mendapatkan HTML setelah error umum:", htmlError);
             }
        } else if (!page) {
            console.error("Objek 'page' tidak berhasil diinisialisasi.");
        }
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
            console.log('Scraping gagal atau tidak ada data yang diekstrak.');
        }
    })
    .catch(err => {
        console.error('Terjadi error pada proses utama:', err);
    });