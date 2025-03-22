import axios from "axios";
import { Parser } from "xml2js";

// Peta provinsi dengan kode BMKG
const provinceMap = {
  aceh: "501422",
  bali: "501241",
  bangka_belitung: "501162",
  banten: "501192",
  bengkulu: "501191",
  yogyakarta: "501190",
  jakarta: "501195",
  gorontalo: "501193",
  jambi: "501194",
  jawa_barat: "501196",
  jawa_tengah: "501197",
  jawa_timur: "501198",
  kalimantan_barat: "501199",
  kalimantan_selatan: "501200",
  kalimantan_tengah: "501201",
  kalimantan_timur: "501202",
  kalimantan_utara: "501203",
  kepulauan_riau: "501204",
  lampung: "501205",
  maluku: "501206",
  maluku_utara: "501207",
  nusa_tenggara_barat: "501208",
  nusa_tenggara_timur: "501209",
  papua: "501210",
  papua_barat: "501212",
  riau: "501213",
  sulawesi_barat: "501214",
  sulawesi_selatan: "501215",
  sulawesi_tengah: "501216",
  sulawesi_tenggara: "501217",
  sulawesi_utara: "501218",
  sumatera_barat: "501219",
  sumatera_selatan: "501220",
  sumatera_utara: "501221",
};

// Peta kode pos ke provinsi (versi sederhana)
// Format: 'awalan kode pos': 'provinsi_bmkg'
const postalCodeRegionMap = {
  10: "jakarta",
  11: "jakarta",
  12: "jakarta",
  13: "jakarta",
  14: "jakarta",
  15: "jakarta",
  16: "jakarta",
  17: "jakarta",
  20: "sumatera_utara",
  22: "sumatera_utara",
  23: "sumatera_utara",
  24: "sumatera_utara",
  25: "aceh",
  26: "aceh",
  27: "aceh",
  28: "riau",
  29: "riau",
  30: "sumatera_barat",
  31: "sumatera_barat",
  32: "sumatera_selatan",
  33: "sumatera_selatan",
  34: "sumatera_selatan",
  35: "jambi",
  36: "bengkulu",
  37: "lampung",
  38: "lampung",
  39: "bangka_belitung",
  40: "jawa_barat",
  41: "jawa_barat",
  42: "jawa_barat",
  43: "jawa_barat",
  44: "jawa_barat",
  45: "jawa_barat",
  46: "jawa_barat",
  47: "jawa_barat",
  48: "jawa_barat",
  49: "jawa_barat",
  50: "jawa_tengah",
  51: "jawa_tengah",
  52: "jawa_tengah",
  53: "jawa_tengah",
  54: "jawa_tengah",
  55: "yogyakarta",
  56: "yogyakarta",
  57: "yogyakarta",
  58: "jawa_tengah",
  59: "jawa_tengah",
  60: "jawa_timur",
  61: "jawa_timur",
  62: "jawa_timur",
  63: "jawa_timur",
  64: "jawa_timur",
  65: "jawa_timur",
  66: "jawa_timur",
  67: "jawa_timur",
  68: "jawa_timur",
  69: "jawa_timur",
  70: "sulawesi_selatan",
  71: "sulawesi_selatan",
  72: "sulawesi_tengah",
  73: "sulawesi_tenggara",
  74: "sulawesi_utara",
  75: "gorontalo",
  76: "sulawesi_barat",
  80: "bali",
  81: "nusa_tenggara_barat",
  82: "nusa_tenggara_barat",
  83: "nusa_tenggara_timur",
  84: "nusa_tenggara_timur",
  85: "nusa_tenggara_timur",
  86: "papua",
  87: "papua",
  88: "papua",
  89: "papua_barat",
  90: "papua",
  91: "maluku",
  92: "maluku",
  93: "maluku_utara",
  94: "maluku_utara",
  95: "kalimantan_timur",
  96: "kalimantan_timur",
  97: "kalimantan_barat",
  98: "kalimantan_tengah",
  99: "kalimantan_selatan",
};

// Fungsi untuk mendapatkan provinsi dari kode pos
function getProvinceFromPostalCode(postalCode) {
  const prefix = postalCode.substring(0, 2);
  const province = postalCodeRegionMap[prefix];

  if (!province) {
    throw new Error("Provinsi tidak ditemukan untuk kode pos ini");
  }

  return province;
}

// Fungsi untuk mendapatkan ID provinsi BMKG dari kode pos
function getBmkgProvinceId(postalCode) {
  try {
    const province = getProvinceFromPostalCode(postalCode);
    const provinceId = provinceMap[province];

    if (!provinceId) {
      throw new Error("ID BMKG tidak ditemukan untuk provinsi ini");
    }

    return provinceId;
  } catch (error) {
    throw error;
  }
}

// Fungsi untuk mendapatkan data cuaca dari BMKG berdasarkan provinsi
async function getBmkgWeatherData(provinceId) {
  try {
    // Data XML dari BMKG untuk provinsi tertentu
    const response = await axios.get(
      `https://data.bmkg.go.id/DataMKG/MEWS/DigitalForecast/DigitalForecast-${provinceId}.xml`
    );

    // Parse XML menjadi JSON
    const parser = new Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);

    return result;
  } catch (error) {
    console.error("Error mendapatkan data dari BMKG:", error.message);
    throw error;
  }
}

// Fungsi untuk mendapatkan deskripsi kode cuaca
function getWeatherDescription(code) {
  const weatherCodes = {
    0: "Cerah / Clear Skies",
    1: "Cerah Berawan / Partly Cloudy",
    2: "Cerah Berawan / Partly Cloudy",
    3: "Berawan / Mostly Cloudy",
    4: "Berawan Tebal / Overcast",
    5: "Udara Kabur / Haze",
    10: "Asap / Smoke",
    45: "Kabut / Fog",
    60: "Hujan Ringan / Light Rain",
    61: "Hujan Sedang / Rain",
    63: "Hujan Lebat / Heavy Rain",
    80: "Hujan Lokal / Isolated Shower",
    95: "Hujan Petir / Severe Thunderstorm",
    97: "Hujan Petir / Severe Thunderstorm",
  };

  return weatherCodes[code] || "Tidak Diketahui / Unknown";
}

// Fungsi untuk memformat data cuaca untuk pesan WhatsApp
function formatWeatherDataForWhatsApp(data, postalCode) {
  try {
    const forecast = data.data.forecast;
    const areas = Array.isArray(forecast.area)
      ? forecast.area
      : [forecast.area];
    const province = getProvinceFromPostalCode(postalCode);

    // Ambil area pertama untuk disederhanakan
    const area = areas[0];

    // Cari parameter cuaca (weather), suhu (t), dan kelembaban (hu)
    let weatherParam, tempParam, humidityParam;

    if (area.parameter) {
      const params = Array.isArray(area.parameter)
        ? area.parameter
        : [area.parameter];

      weatherParam = params.find((param) => param.$.id === "weather");
      tempParam = params.find((param) => param.$.id === "t");
      humidityParam = params.find((param) => param.$.id === "hu");
    }

    // Ambil data cuaca terkini (biasanya timerange pertama untuk hari ini)
    const currentWeather = weatherParam?.timerange[0];
    const currentTemp = tempParam?.timerange[0];
    const currentHumidity = humidityParam?.timerange[0];

    // Format tanggal dan waktu
    const dateStr = currentWeather?.$.datetime || "";
    const date = new Date(
      `${dateStr.substring(0, 4)}-${dateStr.substring(
        4,
        6
      )}-${dateStr.substring(6, 8)}T${dateStr.substring(
        8,
        10
      )}:${dateStr.substring(10, 12)}:00`
    );
    const formattedDate = date.toLocaleString("id-ID", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Kode cuaca dan deskripsi
    const weatherCode = currentWeather?.value._ || currentWeather?.value;
    const weatherDesc = getWeatherDescription(weatherCode);

    // Suhu dalam Celsius
    const temperature = currentTemp?.value._ || currentTemp?.value || "N/A";

    // Kelembaban dalam persen
    const humidity =
      currentHumidity?.value._ || currentHumidity?.value || "N/A";

    // Format pesan
    let message = `🌤️ *INFORMASI CUACA BMKG* 🌤️\n\n`;
    message += `📍 *Lokasi:* ${
      area.name?._ || area.name || "Tidak diketahui"
    }, ${province.toUpperCase()}\n`;
    message += `📆 *Waktu:* ${formattedDate}\n\n`;
    message += `⛅ *Kondisi Cuaca:* ${weatherDesc}\n`;
    message += `🌡️ *Suhu:* ${temperature}°C\n`;
    message += `💧 *Kelembaban:* ${humidity}%\n\n`;
    message += `🏙️ *Kode Pos:* ${postalCode}\n`;
    message += `ℹ️ *Sumber:* BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)\n`;

    return message;
  } catch (error) {
    console.error("Error memformat data cuaca:", error);
    return `Maaf, terjadi kesalahan saat memproses data cuaca: ${error.message}`;
  }
}

// Fungsi untuk mendapatkan informasi cuaca berdasarkan kode pos
async function getWeatherByPostalCode(postalCode) {
  try {
    // Validasi kode pos Indonesia (5 digit)
    if (!/^\d{5}$/.test(postalCode)) {
      return "Kode pos tidak valid. Silakan masukkan 5 digit angka.";
    }

    // Dapatkan ID provinsi BMKG dari kode pos
    const provinceId = getBmkgProvinceId(postalCode);

    // Dapatkan data cuaca dari BMKG
    const rawData = await getBmkgWeatherData(provinceId);

    // Format data cuaca untuk WhatsApp
    const formattedData = formatWeatherDataForWhatsApp(rawData, postalCode);

    return formattedData;
  } catch (error) {
    return `Maaf, terjadi kesalahan: ${error.message}`;
  }
}

// Daftarkan handler (asumsi handler ini diberikan oleh framework bot yang digunakan)
export default (handler) => {
  handler.reg({
    cmd: ["gc"],
    tags: "main",
    desc: "Detail scuacca",
    run: async (m, { sock }) => {
      // Mendapatkan kode pos dari pesan
      const postalCode = m.text;

      if (postalCode) {
        // Mengirim pesan sedang memproses
        await sock.sendMessage(m.from, {
          text: "Sedang mencari informasi cuaca... ⏳",
        });

        // Mendapatkan data cuaca
        const weatherInfo = await getWeatherByPostalCode(postalCode);

        // Mengirim informasi cuaca
        await sock.sendMessage(m.from, { text: weatherInfo });
      } else {
        await sock.sendMessage(m.from, {
          text: "Format tidak valid. Gunakan: !cuaca [kode_pos]\nContoh: !cuaca 40111",
        });
      }
    },
  });
};