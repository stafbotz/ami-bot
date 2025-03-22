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
        return sock.sendMessage(m.from, {
          text: "Masukkan nama lokasi."
        });
      }

      try {
        // Dapatkan data cuaca BMKG
        const cuaca = new BMKGWeather();
        const result = cuaca.getWeatherForecast(query);
      
        console.log(result)
       // sock.sendMessage(m.from, { text: result });
      } catch (err) {
        console.log(err);
        sock.sendMessage(m.chat, {
          text: "Terjadi kesalahan saat mendapatkan data cuaca."
        });
      }
    }
  });
};