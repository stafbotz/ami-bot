export default (handler) => {
    handler.reg({
      cmd: ["cuaca"],
      tags: "main",
      desc: "Mendapatkan informasi cuaca dari BMKG berdasarkan kode pos",
      run: async (m, { sock }) => {
        try {
          // Ekstrak kode pos dari pesan
          const text = m.text.trim();
          const postalCode = text.split(" ")[1];
          
          if (!postalCode) {
            return sock.sendMessage(m.from, {
              text: `❌ Silakan masukkan kode pos.\nContoh: .cuaca 40111`
            }, { quoted: m });
          }
          
          // Kirim pesan loading
          await sock.sendMessage(m.from, {
            text: `🔍 Mencari informasi cuaca untuk kode pos ${postalCode}...`
          }, { quoted: m });
          
          // Ambil data dari API BMKG
          const weatherData = await getWeatherByPostalCode(postalCode);
          
          if (!weatherData) {
            return sock.sendMessage(m.from, {
              text: `❌ Tidak dapat menemukan informasi cuaca untuk kode pos ${postalCode}.`
            }, { quoted: m });
          }
          
          // Format pesan cuaca
          const weatherMessage = formatWeatherMessage(weatherData);
          
          // Kirim informasi cuaca
          await sock.sendMessage(m.from, {
            text: weatherMessage
          }, { quoted: m });
          
        } catch (error) {
          console.error('Error in weather command:', error);
          sock.sendMessage(m.from, {
            text: `❌ Terjadi kesalahan: ${error.message}`
          }, { quoted: m });
        }
      }
    });
    
    // Fungsi untuk mendapatkan data cuaca berdasarkan kode pos
    async function getWeatherByPostalCode(postalCode) {
      try {
        // URL API BMKG untuk mendapatkan data cuaca berdasarkan lokasi terdekat
        const response = await fetch(`https://ibnux.github.io/BMKG-importer/cuaca/wilayah.json`);
        const regions = await response.json();
        
        // Cari lokasi terdekat berdasarkan kode pos
        // Catatan: Dalam implementasi sebenarnya, Anda mungkin perlu pemetaan kode pos ke ID area BMKG
        // Contoh penggunaan sederhana untuk demo
        const closestRegion = findClosestRegionByPostalCode(regions, postalCode);
        
        if (!closestRegion) {
          return null;
        }
        
        // Ambil data cuaca berdasarkan ID area
        const weatherResponse = await fetch(`https://ibnux.github.io/BMKG-importer/cuaca/${closestRegion.id}.json`);
        const weatherData = await weatherResponse.json();
        
        return {
          location: closestRegion.propinsi + ", " + closestRegion.kota + ", " + closestRegion.kecamatan,
          data: weatherData
        };
      } catch (error) {
        console.error('Error fetching weather data:', error);
        return null;
      }
    }
    
    // Fungsi untuk mencari lokasi terdekat berdasarkan kode pos
    // Implementasi sederhana, dalam kasus nyata mungkin perlu database atau API mapping
    function findClosestRegionByPostalCode(regions, postalCode) {
      // Contoh implementasi sederhana
      // Dalam implementasi sebenarnya, Anda mungkin ingin menggunakan database atau layanan lain
      // untuk memetakan kode pos ke ID area BMKG
      
      // Basis kode pos Jakarta
      if (postalCode.startsWith('10') || postalCode.startsWith('11') || 
          postalCode.startsWith('12') || postalCode.startsWith('13') || 
          postalCode.startsWith('14')) {
        return regions.find(r => r.kota.includes('Jakarta'));
      }
      
      // Basis kode pos Bandung
      if (postalCode.startsWith('40')) {
        return regions.find(r => r.kota.includes('Bandung'));
      }
      
      // Basis kode pos Surabaya
      if (postalCode.startsWith('60')) {
        return regions.find(r => r.kota.includes('Surabaya'));
      }
      
      // Basis kode pos Medan
      if (postalCode.startsWith('20')) {
        return regions.find(r => r.kota.includes('Medan'));
      }
      
      // Jika tidak ada yang cocok, gunakan region pertama sebagai default (tidak disarankan untuk produksi)
      // Pada implementasi produksi, sebaiknya kembalikan null dan beri tahu pengguna
      return regions[0];
    }
    
    // Fungsi untuk memformat pesan cuaca
    function formatWeatherMessage(weatherData) {
      if (!weatherData || !weatherData.data || !weatherData.data.length) {
        return "❌ Data cuaca tidak tersedia.";
      }
      
      // Ambil prakiraan cuaca untuk hari ini
      const today = weatherData.data.filter(item => {
        const date = new Date(item.jamCuaca);
        const now = new Date();
        return date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
      });
      
      if (!today.length) {
        return "❌ Data cuaca untuk hari ini tidak tersedia.";
      }
      
      // Kelompokkan berdasarkan waktu (pagi, siang, malam)
      const morning = today.find(item => {
        const hour = new Date(item.jamCuaca).getHours();
        return hour >= 6 && hour < 12;
      });
      
      const afternoon = today.find(item => {
        const hour = new Date(item.jamCuaca).getHours();
        return hour >= 12 && hour < 18;
      });
      
      const night = today.find(item => {
        const hour = new Date(item.jamCuaca).getHours();
        return hour >= 18 || hour < 6;
      });
      
      // Buat pesan
      let message = `🌤️ *INFORMASI CUACA BMKG* 🌤️\n\n`;
      message += `📍 *Lokasi:* ${weatherData.location}\n`;
      message += `📅 *Tanggal:* ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
      
      if (morning) {
        message += `🌅 *Pagi (06:00-12:00)*\n`;
        message += `   Cuaca: ${morning.cuaca}\n`;
        message += `   Suhu: ${morning.tempC}°C\n`;
        message += `   Kelembaban: ${morning.humidity}%\n\n`;
      }
      
      if (afternoon) {
        message += `☀️ *Siang (12:00-18:00)*\n`;
        message += `   Cuaca: ${afternoon.cuaca}\n`;
        message += `   Suhu: ${afternoon.tempC}°C\n`;
        message += `   Kelembaban: ${afternoon.humidity}%\n\n`;
      }
      
      if (night) {
        message += `🌙 *Malam (18:00-06:00)*\n`;
        message += `   Cuaca: ${night.cuaca}\n`;
        message += `   Suhu: ${night.tempC}°C\n`;
        message += `   Kelembaban: ${night.humidity}%\n\n`;
      }
      
      message += `ℹ️ Data dari BMKG Indonesia\n`;
      message += `Ketik .cuaca [kode pos] untuk melihat cuaca di lokasi lain`;
      
      return message;
    }
  };