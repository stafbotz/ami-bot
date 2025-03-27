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
            headless: true, // Ganti jadi false untuk debug visual
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        await page.goto(url, {
            waitUntil: 'networkidle2', // Cukup fleksibel
            timeout: 90000
        });

        console.log('Halaman berhasil dimuat.');

        // --- Tambahkan waitForSelector ---
        // Tunggu elemen yang berisi waktu pemutakhiran muncul (indikator konten utama siap)
        try {
            await page.waitForSelector('time span span', { timeout: 15000 }); // Tunggu max 15 detik lagi
            console.log('Elemen kunci (waktu pemutakhiran) ditemukan. Memulai ekstraksi data...');
        } catch (waitError) {
            console.error('Elemen kunci tidak ditemukan setelah menunggu, scraping mungkin gagal.');
            // Bisa throw error atau lanjut dengan data null
            // throw new Error('Elemen kunci tidak ditemukan');
        }
        // --- Akhir waitForSelector ---


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

             // Fungsi helper untuk mendapatkan teks, aman dari null
            const getText = (element) => element?.textContent?.trim() || null;
            const getCleanText = (element, prefixToRemove) => {
                const text = getText(element);
                return text ? text.replace(prefixToRemove, '').trim() : null;
            }

            // --- Ekstrak Lokasi dari Deskripsi ---
            const descriptionElement = document.querySelector('h1 + p'); // Targetkan paragraf setelah H1
             if (descriptionElement) {
                const descriptionText = getText(descriptionElement);
                if (descriptionText && descriptionText.includes(',')) {
                    const parts = descriptionText.split(',').map(part => part.trim());
                    if (parts.length >= 4) {
                        hasil.lokasi.provinsi = parts[parts.length - 1];
                        hasil.lokasi.kabupaten = parts[parts.length - 2].replace(/^Kabupaten\s+/i, '');
                        hasil.lokasi.kecamatan = parts[parts.length - 3].replace(/^Kecamatan\s+/i, '');
                        hasil.lokasi.nama = parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                    } else if (parts.length === 3 && parts[0].toLowerCase().includes('prakiraan cuaca di')) {
                        // Fallback jika hanya Kota/Kab, Kecamatan, Provinsi
                        hasil.lokasi.provinsi = parts[parts.length - 1];
                         hasil.lokasi.kecamatan = parts[parts.length - 2].replace(/^Kecamatan\s+/i, '');
                         // Coba ekstrak nama lokasi dari bagian pertama
                         const namaMatch = parts[0].match(/di\s+(.*?)$/i);
                         hasil.lokasi.nama = namaMatch ? namaMatch[1] : parts[0].replace(/^Prakiraan cuaca di\s+/i, '');
                         // Kabupaten mungkin sama dengan nama lokasi
                         hasil.lokasi.kabupaten = hasil.lokasi.nama; // Asumsi
                    }
                }
            }
            // Fallback Nama dari H1 jika belum ada
            if (!hasil.lokasi.nama) {
                const mainHeading = document.querySelector('h1');
                hasil.lokasi.nama = getCleanText(mainHeading, /^Prakiraan Cuaca\s+/i);
            }
             // Fallback Kode dari URL jika belum ada
             if (!hasil.lokasi.kode) {
                try { // window.location bisa error di beberapa konteks evaluate
                    const currentUrl = window.location.href;
                    const urlParts = currentUrl.split('/');
                    hasil.lokasi.kode = urlParts[urlParts.length - 1] || null;
                } catch (e) { /* abaikan error */ }
            }

            // --- Ekstrak Timezone dari Prakiraan Jam ---
            const firstHourTitle = document.querySelector('.swiper-slide h4'); // Ambil dari slide pertama
            if (firstHourTitle) {
                const match = getText(firstHourTitle)?.match(/(WIB|WITA|WIT)/);
                hasil.timezone = match ? match[0] : null;
            }

            // --- Ekstrak Cuaca Saat Ini ---
            // Cari kontainer utama berdasarkan elemen 'time' yang lebih stabil
            const updateTimeEl = document.querySelector('time span span');
            hasil.cuacaSaatIni.waktuPembaruan = getCleanText(updateTimeEl, 'Pemutakhiran:');

            // Cari parent container dari elemen waktu
            const currentSection = updateTimeEl?.closest('.flex-shrink-0 + div'); // Cari div setelah elemen flex-shrink-0 (SVG)
            if (currentSection) {
                // Cari suhu (biasanya elemen <p> besar setelah <time>)
                const tempEl = currentSection.querySelector('time + div > p'); // <p> di dalam div setelah time
                hasil.cuacaSaatIni.suhu = getText(tempEl);

                // Cari deskripsi (biasanya <p> di dalam flex container)
                const descContainer = currentSection.querySelector('p.font-bold + div'); // Div setelah suhu
                const descEl = descContainer?.querySelector('p.font-medium'); // p di dalam flex container tsb
                hasil.cuacaSaatIni.deskripsi = getText(descEl);

                // Cari detail (humidity, wind, etc.) - Kontainer biasanya setelah deskripsi/suhu
                const detailContainer = currentSection.querySelector('.mt-5, .mt-6'); // Cari div dengan margin atas
                if(detailContainer) {
                    const detailElements = detailContainer.querySelectorAll(':scope > div'); // Hanya anak langsung
                    detailElements.forEach(div => {
                        const textContent = getText(div);
                        if (textContent) {
                             if (textContent.includes('Kelembapan:')) {
                                hasil.cuacaSaatIni.kelembapan = textContent.split(':')[1]?.trim() || null;
                            } else if (textContent.includes('Kecepatan Angin:')) {
                                hasil.cuacaSaatIni.kecepatanAngin = textContent.split(':')[1]?.trim() || null;
                            } else if (textContent.includes('Arah Angin dari:')) {
                                const arahFull = textContent.split(':')[1]?.trim();
                                const arahNama = arahFull?.split('<')[0]?.trim(); // Bersihkan SVG
                                hasil.cuacaSaatIni.arahAngin = arahNama || arahFull || null;
                            } else if (textContent.includes('Jarak Pandang:')) {
                                hasil.cuacaSaatIni.jarakPandang = textContent.split(':')[1]?.trim() || null;
                            }
                        }
                    });
                }

                // --- Ekstrak Peringatan ---
                // Cari div peringatan di dalam currentSection (biasanya setelah <time>)
                const potentialWarningContainer = currentSection.querySelector('time + div + div'); // div ke-2 setelah time
                if(potentialWarningContainer) {
                     // Cari div di dalamnya yang memiliki ikon warning (SVG)
                    const warningIcon = potentialWarningContainer.querySelector('svg path[d*="M8.485 2.495c"]'); // Cari path ikon warning
                    const warningDiv = warningIcon?.closest('div.flex.w-full'); // Cari parent container flex-nya
                     if (warningDiv) {
                        // Ambil teks dari span di dalamnya
                         hasil.peringatan = warningDiv.querySelector('p span')?.textContent?.trim() || warningDiv.textContent?.trim() || null;
                    }
                }
            }


            // --- Ekstrak Prakiraan Per Jam ---
            const hourlyContainer = document.querySelector('.swiper-wrapper');
            if (hourlyContainer) {
                const hourlySlides = Array.from(hourlyContainer.querySelectorAll('.swiper-slide'));
                hourlySlides.forEach(slide => {
                    const jam = {};
                    const timeEl = slide.querySelector('h4');
                    jam.waktu = getText(timeEl);

                    const tempEl = slide.querySelector('p.font-bold[class*="text-"]'); // Cari <p> bold dengan kelas text size
                    jam.suhu = getText(tempEl);

                    // Deskripsi biasanya <p> bold setelah suhu
                    const descEl = slide.querySelector('p.font-bold.mt-4');
                    jam.deskripsi = getText(descEl);

                    const detailBox = slide.querySelector('div[class*="bg-[#FFFFFF"]'); // Cari box detail dg background putih transparan
                    if (detailBox) {
                        const detailItems = detailBox.querySelectorAll(':scope > div'); // Anak langsung
                        detailItems.forEach((item, index) => {
                            const textContent = getText(item);
                            const value = item.querySelector('p.font-bold')?.textContent?.trim(); // Ambil nilai bold
                            if (textContent) {
                                if (index === 0 && textContent.includes('%')) jam.kelembapan = value || textContent;
                                else if (index === 1 && textContent.toLowerCase().includes('km/jam')) jam.kecepatanAngin = value || textContent;
                                else if (index === 2) { // Arah angin
                                    const arahSpan = item.querySelector('span > span.font-bold'); // Cari span bold di dalam span
                                    let arahAnginText = getText(arahSpan);
                                     if (!arahAnginText) { // Fallback jika tidak ada span bold
                                        arahAnginText = textContent.split('<')[0]?.trim(); // Bersihkan SVG
                                    }
                                    jam.arahAngin = arahAnginText;
                                }
                                else if (index === 3 && (textContent.toLowerCase().includes('km') || textContent.includes('>'))) jam.jarakPandang = value || textContent;
                            }
                        });
                    }

                    if (jam.waktu) {
                        hasil.prakiraanPerJam.push(jam);
                    }
                });
            } // Akhir if (hourlyContainer)

            return hasil;
        }, kodeWilayah); // <-- Pass kodeWilayah

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