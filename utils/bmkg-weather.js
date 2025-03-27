import axios from 'axios';
import cheerio from 'cheerio';
import moment from 'moment';

async function scrapeBMKG(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const data = {};

    // 1. Informasi Lokasi
    data.lokasi = $('title').text().replace(' - Cuaca - BMKG', '');

    // 2. Cuaca Saat Ini
    const cuacaSaatIni = {};
    const updateTimeText = $('div.flex.items-center > p').text()
    
    cuacaSaatIni.pemutakhiran = updateTimeText.replace("Saat iniPemutakhiran: ","")

    cuacaSaatIni.temperatur = $('div.flex.items-center > p').parent().next().text().trim();
    cuacaSaatIni.kondisi = $('div.flex.items-center > p').parent().next().next().text().trim();
    cuacaSaatIni.lokasiDetail = $('div.flex.items-center > p').parent().next().next().next().text().trim();
    cuacaSaatIni.kelembapan = $('div.flex.items-center > p').parent().next().next().next().next().find("div.flex.w-full.md\\:w-auto.gap-2.items-center.py-1.px-3.border.border-\\[\\#CBD5E1\\].rounded-lg > p").first().find('span.text-black-primary.font-bold').text();

    cuacaSaatIni.kecepatanAngin = $('div.flex.items-center > p').parent().next().next().next().next().find("div.flex.w-full.md\\:w-auto.gap-2.items-center.py-1.px-3.border.border-\\[\\#CBD5E1\\].rounded-lg > p").eq(1).find('span.text-black-primary.font-bold').text();
    cuacaSaatIni.arahAngin = $('div.flex.items-center > p').parent().next().next().next().next().find("div.flex.w-full.md\\:w-auto.gap-2.items-center.py-1.px-3.border.border-\\[\\#CBD5E1\\].rounded-lg > p").eq(2).find('span.text-black-primary.font-bold').text();
    cuacaSaatIni.jarakPandang = $('div.flex.items-center > p').parent().next().next().next().next().find("div.flex.w-full.md\\:w-auto.gap-2.items-center.py-1.px-3.border.border-\\[\\#CBD5E1\\].rounded-lg > p").eq(3).find('span.text-black-primary.font-bold').text();

    data.cuacaSaatIni = cuacaSaatIni

    // 3. Prakiraan Cuaca Hari Ini (Per Jam)
    data.prakiraanHariIni = [];
    $('div.mt-6.md\\:mt-12.relative > div.swiper.relative.\\!pl-6.md\\:!pl-0 > div > div').children().each((i, el) => {
      const jam = $(el).find('h4.text-base.leading-\\[25px\\].md\\:text-2xl.font-bold').text().trim();
      const temperatur = $(el).find('p.text-\\[32px\\].leading-\\[48px\\].md\\:text-\\[48px\\].md\\:leading-\\[62px\\].font-bold').text().trim();
      const kondisi = $(el).find('p.text-sm.md\\:text-lg.font-bold.mt-4').text().trim();
      const kelembapan = $(el).find('div.flex.w-full.gap-2.items-center.justify-between > p > span').text().trim();
      const kecepatanAngin = $(el).find('div.flex.w-full.gap-2.items-center.justify-between').eq(1).find('p > span').text().trim();
      const arahAngin = $(el).find('div.flex.w-full.gap-2.items-center.justify-between').eq(2).find('p > span > span').text().trim();
      const jarakPandang = $(el).find('div.flex.w-full.gap-2.items-center.justify-between').eq(3).find('p > span').text().trim();
      data.prakiraanHariIni.push({jam, temperatur, kondisi, kelembapan, kecepatanAngin, arahAngin, jarakPandang });
    });

    // 4. Prakiraan Cuaca Mingguan (7 Hari ke Depan)
    data.prakiraanMingguan = [];
    const today = moment();
    const endDate = moment().add(7, 'days'); // Sampai 7 hari ke depan
    
    $('div.bg-white.pb-10 > div > div > div.mt-6.md\\:mt-12.grid.gap-4.lg\\:gap-8.grid-cols-3.sm\\:grid-cols-2.lg\\:grid-cols-3.xl\\:grid-cols-4 > a').each((i, el) => {
        const link = $(el).attr('href');
        const provinsi = $(el).find('p.text-xs.leading-5.md\\:text-base.md\\:leading-\\[25px\\].font-bold.text-gray-primary').text().trim();
        data.prakiraanMingguan.push({ link, provinsi });
      });

    return data;
  } catch (error) {
    console.error('Error scraping BMKG:', error);
    return null;
  }
}

// Contoh penggunaan
const bmkgURL = 'https://www.bmkg.go.id/cuaca/prakiraan-cuaca/12.76.01.1001';

scrapeBMKG(bmkgURL)
  .then(result => {
    if (result) {
      console.log(JSON.stringify(result, null, 2)); // Output data JSON
    }
  });