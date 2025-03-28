import puppeteer from 'puppeteer';

// ... (extractHourlyForecast tetap sama) ...
async function extractHourlyForecast(page) {
    // ... (kode sama seperti sebelumnya) ...
     try {
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
                                  } else if (item.querySelector('p > span > span.font-bold')) {
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
        return [{ error: "Gagal mengevaluasi data per jam" }];
    }
}


async function scrapeBmkgCuaca(kodeWilayah) {
    // ... (inisialisasi, goto, wait for key element sama) ...
     if (!kodeWilayah) {
        console.error('Error: Kode wilayah diperlukan.');
        console.log('Contoh penggunaan: node scrapeBmkg.js 53.01.06.2018');
        return null;
    }

    const url = `https://www.bmkg.go.id/cuaca/prakiraan-cuaca/${kodeWilayah}`;
    console.log(`Mencoba scraping dari: ${url}`);

    let browser = null;
    let page = null;

    try {
        browser = await puppeteer.launch({
            headless: true, // Set false untuk debug visual jika perlu
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });

        page = await browser.newPage();
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

        const initialData = await page.evaluate((inputKodeWilayah) => {
            // ... (kode evaluate lokasi, timezone, cuaca saat ini, peringatan tetap sama) ...
             const hasil = {
                lokasi: { kode: inputKodeWilayah || null, kelurahan: null, provinsi: null, kabupaten: null, kecamatan: null },
                timezone: null,
                cuacaSaatIni: { waktuPembaruan: null, suhu: null, deskripsi: null, kelembapan: null, kecepatanAngin: null, arahAngin: null, jarakPandang: null },
                peringatan: null,
                prakiraan: {} // Inisialisasi objek prakiraan
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
                      const tempEl = currentSection.querySelector('p[class*="text-\\["][class*="leading-"]');
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
        const dateButtonContainerSelector = 'h2.font-bold.text-gray-900 + div.flex[class*="overflow-x-scroll"]';
        const dateButtonContainer = await page.waitForSelector(dateButtonContainerSelector, { timeout: 10000 });

        if (!dateButtonContainer) {
            console.error("Container tombol tanggal tidak ditemukan dengan selector:", dateButtonContainerSelector);
            throw new Error("Gagal menemukan container tombol tanggal.");
        }

        // --- REVISI: Ambil data tombol dari evaluate ---
        const allButtonsData = await page.evaluate((containerSelector) => {
            const container = document.querySelector(containerSelector);
            // Targetkan button di dalam div anak langsung container
            const buttons = container ? Array.from(container.querySelectorAll(':scope > div > button')) : [];
            console.log(`[Evaluate] Ditemukan ${buttons.length} tombol.`); // Debug di browser
            return buttons.map(btn => {
                 const text = btn.textContent.trim();
                 // Cek kelas aktif dengan lebih hati-hati
                 const isActive = btn.classList.contains('border-blue-primary') && !btn.classList.contains('!bg-white');
                 console.log(`[Evaluate] Tombol Teks: "${text}", Kelas: "${btn.className}", Aktif: ${isActive}`); // Debug detail
                 return {
                    text: text,
                    isActive: isActive
                 };
            });
        }, dateButtonContainerSelector);

        console.log(`[Node] Data tombol mentah: ${JSON.stringify(allButtonsData)}`); // Log data tombol mentah

        let firstDateText = "Tanggal_1";
        const targetButtonsData = [];
        allButtonsData.forEach(buttonInfo => {
            if (buttonInfo.isActive) {
                firstDateText = buttonInfo.text;
            } else if (buttonInfo.text) { // Hanya tambahkan jika ada teks
                targetButtonsData.push(buttonInfo);
            }
        });
        // --- AKHIR REVISI ---

        console.log(`Tombol aktif: ${firstDateText}`);
        console.log(`Menemukan ${targetButtonsData.length} tombol tanggal tambahan untuk diproses.`);

        initialData.prakiraan[firstDateText] = await extractHourlyForecast(page);
        let previousFirstSlideTime = initialData.prakiraan[firstDateText]?.[0]?.waktu || '';

        for (const buttonInfo of targetButtonsData) { // Loop berdasarkan data tombol, bukan handle
            const dateText = buttonInfo.text;
            console.log(`\nMencoba memproses tanggal: ${dateText}`);

            try {
                 const xpathSelector = `//button[normalize-space()='${dateText}']`;
                 console.log(`Mencari tombol dengan XPath: ${xpathSelector}`);
                 const buttonToClickHandle = await page.waitForXPath(xpathSelector, { timeout: 10000 });

                 if (!buttonToClickHandle) {
                     console.warn(`Tombol "${dateText}" tidak ditemukan menggunakan XPath.`);
                     continue;
                 }

                console.log(`Mengklik tombol "${dateText}"...`);
                // Klik elemen yang ditemukan via XPath
                await buttonToClickHandle.click();
                // Buang handle setelah digunakan (best practice)
                await buttonToClickHandle.dispose();

                console.log(`Menunggu konten slider untuk "${dateText}" berubah...`);

                await page.waitForFunction(
                    (selector, prevTime) => {
                        const firstSlideH4 = document.querySelector(selector);
                        const currentTime = firstSlideH4?.textContent?.trim() || null;
                        const swiperWrapper = document.querySelector('.swiper-wrapper');
                        const isEmpty = swiperWrapper && swiperWrapper.children.length === 0;
                        return isEmpty || (currentTime && currentTime !== prevTime);
                    },
                    { timeout: 25000 },
                    '.swiper-slide:first-child h4',
                    previousFirstSlideTime
                );

                console.log(`Konten untuk "${dateText}" terdeteksi berubah. Mengekstrak data...`);
                const hourlyData = await extractHourlyForecast(page);

                if (hourlyData.length > 0 && !hourlyData[0].error) {
                    initialData.prakiraan[dateText] = hourlyData;
                    console.log(`Data untuk "${dateText}" berhasil diekstrak (${hourlyData.length} jam).`);
                    previousFirstSlideTime = hourlyData[0]?.waktu || `processed_${dateText}`;
                } else {
                     console.log(`Tidak ada data prakiraan per jam valid ditemukan untuk "${dateText}".`);
                     initialData.prakiraan[dateText] = hourlyData.length > 0 ? hourlyData : [{ message: "Tidak ada data prakiraan per jam tersedia." }];
                     previousFirstSlideTime = `no_data_${dateText}`;
                }

            } catch (processError) {
                console.error(`Gagal memproses tanggal ${dateText}: ${processError.message}`);
                initialData.prakiraan[dateText] = [{ error: `Gagal memproses: ${processError.message}` }];
                previousFirstSlideTime = `error_${dateText}`;
                 try {
                    const htmlContent = await page.content();
                    console.log(`---------- HTML Content (Error Process ${dateText}) ----------`);
                    console.log(htmlContent.substring(0, 10000));
                    console.log("----------------------------------------------------------");
                 } catch (htmlErr) { console.error("Gagal log HTML"); }
            }
             await new Promise(resolve => setTimeout(resolve, 600));
        }

        console.log('Ekstraksi data multi-tanggal selesai.');
        return initialData;

    } catch (error) {
        console.error(`Error saat scraping ${url}:`, error);
        // ... (blok catch lainnya tetap sama) ...
         if (page && !page.isClosed()) {
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

// ... (Kode pemanggilan scrapeBmkgCuaca tetap sama) ...
const kodeWilayahInput = process.argv[2];
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