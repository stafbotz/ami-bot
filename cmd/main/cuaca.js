import BMKGWeather from '../../utils/bmkg-weather.js';
import KodeposScraper from '../../utils/kodepos-scraper.js';

export default (handler) => {
  handler.reg({
    cmd: ["cuaca"],
    tags: "main",
    desc: "Detail cuaca",
    run: async (m, { sock }) => {
      // Ambil query (kode pos/nama lokasi) dari pesan user
      const query = m.text.trim();

      if (!query) {
        return sock.sendMessage(m.from, {
          text: "Masukkan nama lokasi."
        });
      }

      try {
        // Dapatkan data cuaca BMKG
        const scuaca = new BMKGWeather();
        const skodepos = new KodeposScraper();
        const kodepos = await skodepos.getByKodePos(query);
        //const cuaca = await scuaca.getWeatherForecast(query);
      

       sock.sendMessage(m.from, { text: skodepos });
      } catch (err) {
        console.log(err);
        sock.sendMessage(m.chat, {
          text: "Terjadi kesalahan saat mendapatkan data cuaca."
        });
      }
    }
  });
};