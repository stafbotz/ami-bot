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

        // Tunggu elemen kunci (misal, kontainer slide prakiraan)
        try {
            await page.waitForSelector('.swiper-wrapper', { timeout: 15000 });
            console.log('Kontainer prakiraan ditemukan. Memulai ekstraksi data...');
        } catch (waitError) {
            console.error('Kontainer prakiraan tidak ditemukan setelah menunggu.');
            // Jika elemen dasar ini tidak ada, kemungkinan besar scraping akan gagal total
            throw new Error('Kontainer prakiraan tidak ditemukan, halaman mungkin tidak dimuat dengan benar.');
        }

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
                // --- DEBUG ---
                _debug: {
                    descriptionTextRaw: null,
                    currentSectionFound: false,
                    updateTimeTextRaw: null,
                    tempTextRaw: null,
                    descTextRaw: null,
                    detailContainerFound: false,
                    warningContainerFound: false,
                    hourlyContainerFound: false,
                }
                // --- END DEBUG ---
            };

            const getText = (element) => element?.textContent?.trim() || null;
            const getCleanText = (element, prefixToRemove) => {
                const text = getText(element);
                return text ? text.replace(prefixToRemove, '').trim() : null;
            }

            // --- Lokasi dari Deskripsi ---
            const descriptionElement = document.querySelector('h1 + p');
            const descriptionTextRaw = getText(descriptionElement);
            hasil._debug.descriptionTextRaw = descriptionTextRaw; // Simpan teks mentah untuk debug

            if (descriptionTextRaw && descriptionTextRaw.includes(',')) {
                const parts = descriptionTextRaw.split(',').map(part => part.trim());
                 if (parts.length >= 4) {
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    hasil.lokasi.kabupaten = parts[parts.length - 2].replace(/^Kabupaten\s+/i, '');
                    hasil.lokasi.kecamatan = parts[parts.length - 3].replace(/^Kecamatan\s+/i, '');
                    hasil.lokasi.nama = parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                } else if (parts.length >= 3 && parts[0].toLowerCase().includes('prakiraan cuaca di')) {
                    // Fallback jika hanya ada 3 bagian (Kota/Kab, Kecamatan, Provinsi)
                     hasil.lokasi.provinsi = parts[parts.length - 1];
                     hasil.lokasi.kecamatan = parts[parts.length - 2].replace(/^Kecamatan\s+/i, '');
                     const namaMatch = parts[0].match(/di\s+(.*?)(?:,\s+Kecamatan|$)/i); // Coba ambil nama sebelum koma Kecamatan
                     hasil.lokasi.nama = namaMatch ? namaMatch[1].trim() : parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                     hasil.lokasi.kabupaten = hasil.lokasi.nama; // Asumsi kabupaten = nama lokasi jika tidak ada
                 } else if (parts.length >= 2 && parts[0].toLowerCase().includes('prakiraan cuaca di')) {
                    // Fallback jika hanya 2 bagian (Lokasi, Provinsi)
                    hasil.lokasi.provinsi = parts[parts.length - 1];
                    const namaMatch = parts[0].match(/di\s+(.*?)$/i);
                    hasil.lokasi.nama = namaMatch ? namaMatch[1].trim() : parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                    // Asumsi Kec/Kab tidak ada atau sama dengan nama
                    hasil.lokasi.kabupaten = hasil.lokasi.nama;
                    hasil.lokasi.kecamatan = hasil.lokasi.nama;
                 }
            }
            if (!hasil.lokasi.nama) {
                const mainHeading = document.querySelector('h1');
                hasil.lokasi.nama = getCleanText(mainHeading, /^Prakiraan Cuaca\s+/i);
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
            // Coba cari kontainer utama dengan cara yang lebih visual/umum
            // Cari div yang punya background gradient dan di dalamnya ada elemen <time>
            const allDivs = document.querySelectorAll('div');
            let currentSection = null;
            allDivs.forEach(div => {
                // Periksa style background atau kelas yang relevan
                 const hasGradientBg = div.className.includes('bg-\\[linear-gradient\\(151deg') || (div.style.backgroundImage && div.style.backgroundImage.includes('linear-gradient'));
                const hasTimeEl = div.querySelector('time');
                if (hasGradientBg && hasTimeEl) {
                    currentSection = div; // Anggap ini kontainer yang benar
                }
            });

             hasil._debug.currentSectionFound = !!currentSection;

            if (currentSection) {
                const updateTimeEl = currentSection.querySelector('time span span');
                hasil.cuacaSaatIni.waktuPembaruan = getCleanText(updateTimeEl, 'Pemutakhiran:');
                hasil._debug.updateTimeTextRaw = getText(updateTimeEl);

                // Selector suhu: Cari <p> dengan font-bold dan kelas text-[...]
                const tempEl = currentSection.querySelector('p.font-bold[class*="text-"]');
                hasil.cuacaSaatIni.suhu = getText(tempEl);
                hasil._debug.tempTextRaw = getText(tempEl); // Debug

                // Selector deskripsi: Cari <p> font-medium setelah elemen suhu atau dalam flex container
                let descEl = tempEl?.nextElementSibling?.querySelector('p.font-medium'); // Coba elemen setelah suhu
                if (!descEl) { // Jika tidak ada, cari di dalam flex container lain
                    descEl = currentSection.querySelector('.md\\:flex p.font-medium');
                }
                hasil.cuacaSaatIni.deskripsi = getText(descEl);
                hasil._debug.descTextRaw = getText(descEl); // Debug

                // Detail (Kelembapan, Angin, dll.)
                // Cari kontainer detail (biasanya punya margin atas dan berisi div-div kecil)
                const detailContainer = currentSection.querySelector('.mt-5.md\\:mt-6');
                hasil._debug.detailContainerFound = !!detailContainer;
                if(detailContainer) {
                    const detailElements = detailContainer.querySelectorAll(':scope > div.border'); // Cari div anak langsung yg punya border
                    detailElements.forEach(div => {
                        const textContent = getText(div);
                        const valueSpan = div.querySelector('span.font-bold'); // Nilai biasanya di span bold
                        const value = getText(valueSpan);

                        if (textContent) {
                             if (textContent.includes('Kelembapan')) hasil.cuacaSaatIni.kelembapan = value || null;
                             else if (textContent.includes('Kecepatan Angin')) hasil.cuacaSaatIni.kecepatanAngin = value || null;
                             else if (textContent.includes('Arah Angin')) {
                                 // Cari span bold kedua (nama arahnya)
                                 const directionSpans = div.querySelectorAll('span.font-bold');
                                 hasil.cuacaSaatIni.arahAngin = directionSpans.length > 0 ? getText(directionSpans[directionSpans.length - 1]) : null; // Ambil yang terakhir
                             }
                             else if (textContent.includes('Jarak Pandang')) hasil.cuacaSaatIni.jarakPandang = value || null;
                        }
                    });
                }

                // Peringatan
                // Cari div yang berisi ikon warning (SVG)
                const warningIcon = currentSection.querySelector('svg path[d*="M8.485 2.495c"]'); // Path SVG warning
                const warningDiv = warningIcon?.closest('div[class*="border-"]'); // Cari parent ber-border
                 hasil._debug.warningContainerFound = !!warningDiv;
                if (warningDiv) {
                    hasil.peringatan = warningDiv.querySelector('p span')?.textContent?.trim() || warningDiv.textContent?.trim() || null;
                }
            } // end if currentSection

            // --- Prakiraan Per Jam ---
            const hourlyContainer = document.querySelector('.swiper-wrapper');
            hasil._debug.hourlyContainerFound = !!hourlyContainer;
            if (hourlyContainer) {
                const hourlySlides = Array.from(hourlyContainer.querySelectorAll('.swiper-slide'));
                hourlySlides.forEach(slide => {
                    const jam = { // Inisialisasi semua null
                        waktu: null, suhu: null, deskripsi: null,
                        kelembapan: null, kecepatanAngin: null, arahAngin: null, jarakPandang: null
                    };
                    const timeEl = slide.querySelector('h4');
                    jam.waktu = getText(timeEl);

                    const tempEl = slide.querySelector('p.font-bold[class*="text-"]'); // Suhu
                    jam.suhu = getText(tempEl);

                    const descEl = slide.querySelector('p.font-bold.mt-4'); // Deskripsi
                    jam.deskripsi = getText(descEl);

                    const detailBox = slide.querySelector('div.border.rounded-lg'); // Box detail biasanya punya border & rounded
                    if (detailBox) {
                        const detailItems = detailBox.querySelectorAll(':scope > div');
                        detailItems.forEach((item, index) => {
                            const textContent = getText(item);
                            const value = item.querySelector('p.font-bold')?.textContent?.trim(); // Nilai bold

                            if (textContent) {
                                if (index === 0 && textContent.includes('%')) jam.kelembapan = value || textContent.split(':').pop().trim();
                                else if (index === 1 && textContent.toLowerCase().includes('km/jam')) jam.kecepatanAngin = value || textContent.split(':').pop().trim();
                                else if (index === 2) { // Arah angin
                                    const arahSpan = item.querySelector('span > span.font-bold');
                                    jam.arahAngin = getText(arahSpan) || textContent.split(':').pop().split('<')[0].trim(); // Fallback & bersihkan svg
                                }
                                else if (index === 3 && (textContent.toLowerCase().includes('km') || textContent.includes('>'))) jam.jarakPandang = value || textContent.split(':').pop().trim();
                            }
                        });
                    }

                    if (jam.waktu) {
                        hasil.prakiraanPerJam.push(jam);
                    }
                });
            }

            return hasil;
        }, kodeWilayah);

        console.log('Ekstraksi data selesai.');
        // Hapus bagian debug sebelum production
        // delete data._debug;
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