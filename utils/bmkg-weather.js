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
            waitUntil: 'networkidle2', // Cukup fleksibel
            timeout: 90000
        });

        console.log('Halaman berhasil dimuat.');

        // Tunggu slider prakiraan jam
        try {
            await page.waitForSelector('.swiper-wrapper', { timeout: 20000 });
            console.log('Kontainer prakiraan jam ditemukan. Memulai ekstraksi data...');
        } catch (waitError) {
            console.error('Kontainer prakiraan jam tidak ditemukan setelah menunggu.');
            const htmlContent = await page.content();
            console.log("---------- HTML Content (Failure - Swiper) ----------");
            console.log(htmlContent.substring(0, 5000)); // Log sebagian HTML untuk debug
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
            const headingElement = document.querySelector('h1');
            hasil.lokasi.nama = getCleanText(headingElement, /^Prakiraan Cuaca\s+/i);

            // Cari <p> deskripsi dengan lebih toleran
            const descriptionCandidates = Array.from(document.querySelectorAll('p.text-gray-primary.text-center'));
            let descriptionElement = null;
            for (const p of descriptionCandidates) {
                if (getText(p)?.toLowerCase().startsWith('prakiraan cuaca di')) {
                    descriptionElement = p;
                    break;
                }
            }

            const descriptionTextRaw = getText(descriptionElement);
            if (descriptionTextRaw && descriptionTextRaw.includes(',')) {
                const parts = descriptionTextRaw.split(',').map(part => part.trim());
                if (parts.length >= 4) { // Kelurahan, Kec, Kab, Prov
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    hasil.lokasi.kabupaten = parts[parts.length - 2].replace(/^Kabupaten\s+/i, '');
                    hasil.lokasi.kecamatan = parts[parts.length - 3].replace(/^Kecamatan\s+/i, '');
                    // Nama sudah diambil dari H1
                } else if (parts.length === 3) { // Kab/Kota, Kec, Prov
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    hasil.lokasi.kecamatan = parts[parts.length - 2].replace(/^Kecamatan\s+/i, '');
                    hasil.lokasi.kabupaten = parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                } else if (parts.length === 2) { // Lokasi, Prov
                    hasil.lokasi.provinsi = parts[parts.length - 1];
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

                    const descEl = currentSection.querySelector('p.font-medium[class*="text-"]');
                     hasil.cuacaSaatIni.deskripsi = getText(descEl);

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

                    // Peringatan
                    let potentialWarningContainer = detailContainer?.parentElement?.nextElementSibling;
                     if(potentialWarningContainer && potentialWarningContainer.querySelector('svg path[d*="M8.485 2.495c"]')) {
                         const warningDiv = potentialWarningContainer.querySelector('div[class*="border-"]');
                         if (warningDiv) {
                            hasil.peringatan = warningDiv.querySelector('p span')?.textContent?.trim() || warningDiv.textContent?.trim() || null;
                         }
                     } else {
                         const warningIcon = document.querySelector('svg path[d*="M8.485 2.495c"]');
                         const warningDivGlobal = warningIcon?.closest('div[class*="border-"]');
                          if (warningDivGlobal && !warningDivGlobal.closest('.swiper-slide')) {
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
                            const svgs = item.querySelectorAll('svg'); // Hitung SVG di dalam item

                             if (textContent) {
                                if (textContent.includes('%')) {
                                    jam.kelembapan = value || textContent.split(':').pop().trim();
                                } else if (textContent.toLowerCase().includes('km/jam')) {
                                    jam.kecepatanAngin = value || textContent.split(':').pop().trim();
                                } else if (svgs.length >= 2) { // Identifikasi Arah Angin berdasarkan punya 2 SVG (kompas & panah)
                                    const arahSpan = item.querySelector('span > span.font-bold'); // Target span bold di dalam span lain
                                    jam.arahAngin = getText(arahSpan);
                                    // Fallback jika struktur span berubah
                                    if (!jam.arahAngin) {
                                        // Coba ambil semua text node sebelum SVG pertama
                                        let directionText = '';
                                        let currentNode = item.querySelector('p')?.firstChild; // Mulai dari anak pertama <p>
                                        while (currentNode) {
                                            if (currentNode.nodeType === Node.TEXT_NODE) {
                                                directionText += currentNode.textContent;
                                            } else if (currentNode.nodeName === 'svg') {
                                                break; // Berhenti jika ketemu SVG
                                            } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
                                                 // Jika ada elemen lain (misal <span>), ambil teksnya juga
                                                 directionText += currentNode.textContent;
                                            }
                                            currentNode = currentNode.nextSibling;
                                        }
                                        jam.arahAngin = directionText.replace(/Arah Angin dari:/i,'').trim() || null;
                                    }
                                } else if (textContent.toLowerCase().includes('km') || textContent.includes('>')) { // Jarak pandang
                                     jam.jarakPandang = value || textContent.split(':').pop().trim();
                                }
                            }
                        });
                    }
                    if (jam.waktu) hasil.prakiraanPerJam.push(jam);
                });
            }

            return hasil;
        }, kodeWilayah);

        console.log('Ekstraksi data selesai.');
        return data;

    } catch (error) {
        console.error(`Error saat scraping ${url}:`, error);
         // Log HTML saat error di evaluate
        if (error.message.includes('evaluate')) {
             try {
                const htmlContent = await page.content();
                console.log("---------- HTML Content (Evaluation Error) ----------");
                console.log(htmlContent.substring(0, 5000));
                console.log("-----------------------------------------------------");
             } catch (htmlError) {
                 console.error("Gagal mendapatkan HTML setelah error evaluate:", htmlError);
             }
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