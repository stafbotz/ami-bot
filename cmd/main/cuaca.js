import BMKGWeather from '../../utils/bmkg-weather.js';

export default (handler) => {
  handler.reg({
    cmd: ["cuaca"],
    tags: "main",
    desc: "Detail cuaca",
    run: async (m, { sock }) => {
      // Ambil query (kode pos/nama lokasi) dari pesan user
      const query = m.text.trim();

      if (!query) {
        return sock.sendMessage(m.chat, {
          text: "Masukkan nama lokasi."
        });
      }

      try {
        // Dapatkan data cuaca BMKG
        const cuaca = new BMKGWeather();
        cosnt result = cuaca.getWeatherForecast(query);
      

        sock.sendMessage(m.chat, { text: result });
      } catch (err) {
        console.log(err);
        sock.sendMessage(m.chat, {
          text: "Terjadi kesalahan saat mendapatkan data cuaca."
        });
      }
    }
  });
};