import fs from "fs";
import { parseString } from "xml2js";
import request from "request";
import async from "async";

// Daftar URL data BMKG
const bmkg_data = [
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Aceh.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Bali.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-BangkaBelitung.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Banten.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Bengkulu.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-DIYogyakarta.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-DKIJakarta.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Gorontalo.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Jambi.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-JawaBarat.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-JawaTengah.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-JawaTimur.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-KalimantanBarat.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-KalimantanSelatan.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-KalimantanTengah.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-KalimantanTengah.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-KepulauanRiau.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Lampung.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Maluku.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-MalukuUtara.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-NusaTenggaraBarat.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-NusaTenggaraTimur.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Papua.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-PapuaBarat.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-Riau.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SulawesiBarat.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SulawesiSelatan.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SulawesiTengah.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SulawesiTenggara.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SulawesiUtara.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SumateraBarat.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SumateraSelatan.xml",
  "http://data.bmkg.go.id/datamkg/MEWS/DigitalForecast/DigitalForecast-SumateraUtara.xml"
];

// Fungsi untuk format data BMKG dari hasil parse XML
function formatDataBmkg(json) {
  const data = json.data.forecast[0].area
    // Hilangkan duplikat
    .filter((element, index, inputArray) => inputArray.indexOf(element) === index)
    // Hanya ambil element yang memiliki parameter
    .filter((element) => element.parameter != null)
    // Format data tiap area
    .map((area) => {
      // Ambil nilai suhu minimal
      const temp_min = area.parameter
        .filter((params) => params.$.id === "tmin")
        .map((params) =>
          params.timerange.map((timerange) => {
            const dateTime = timerange.$.day;
            return {
              date: dateTime,
              value: timerange.value[0]._
            };
          })
        );

      // Ambil nilai suhu maksimal
      const temp_max = area.parameter
        .filter((params) => params.$.id === "tmax")
        .map((params) =>
          params.timerange.map((timerange) => {
            const dateTime = timerange.$.day;
            return {
              date: dateTime,
              value: timerange.value[0]._
            };
          })
        );

      // Ambil informasi cuaca
      const weather = area.parameter
        .filter((params) => params.$.id === "weather")
        .map((params) => {
          const weahter = params.timerange
            .filter((timerange) => {
              return (
                timerange.$.h === "6" ||
                timerange.$.h === "18" ||
                timerange.$.h === "30" ||
                timerange.$.h === "42" ||
                timerange.$.h === "54" ||
                timerange.$.h === "66"
              );
            })
            .map((timerange) => {
              const codeCuaca = timerange.value[0]._;
              const dateTime = timerange.$.datetime;
              return {
                date: dateTime,
                value: codeCuaca
              };
            });
          return weahter;
        })
        .map((val) => {
          return [
            { date: val[0].date, siang: val[0].value, malam: val[1].value },
            { date: val[2].date, siang: val[2].value, malam: val[3].value },
            { date: val[4].date, siang: val[4].value, malam: val[5].value }
          ];
        });

      // Format output akhir
      const format = {
        provinsi: area.$.domain,
        kota: area.name[1]._,
        parameter: [
          {
            date: temp_min[0][0].date,
            temp_min: temp_min[0][0].value,
            temp_max: temp_max[0][0].value,
            weather_day: weather[0][0].siang,
            weather_night: weather[0][0].malam
          },
          {
            date: temp_min[0][1].date,
            temp_min: temp_min[0][1].value,
            temp_max: temp_max[0][1].value,
            weather_day: weather[0][1].siang,
            weather_night: weather[0][1].malam
          },
          {
            date: temp_min[0][2].date,
            temp_min: temp_min[0][2].value,
            temp_max: temp_max[0][2].value,
            weather_day: weather[0][2].siang,
            weather_night: weather[0][2].malam
          }
        ]
      };
      return format;
    });

  return data;
}

// ======================================================================
// Versi pertama: Fungsi untuk ambil data cuaca dan tulis ke cache
// (diubah dari CJS menjadi ESM dengan melakukan export sebagai named export)
export const get = async () => {
  let dataArray = [];
  console.log("getting weather data...");

  async.forEachOf(
    bmkg_data,
    (link, key, callback) => {
      request(link, function (error, response, body) {
        console.log(link);
        if (!error && response.statusCode === 200) {
          parseString(response.body, function (err, result) {
            let data = formatDataBmkg(result);
            if (err) {
              console.log(err);
            } else {
              data.forEach((e) => dataArray.push(e));
            }
            callback();
          });
        } else {
          callback(error);
        }
      });
    },
    (err) => {
      if (err) {
        console.log(err);
      } else {
        const file = "cache/weather.json";
        const data = JSON.stringify(dataArray);
        fs.writeFile(file, data, "utf-8", (e) => {
          if (e) {
            console.log(e);
          } else {
            console.log("done get weather");
          }
        });
      }
    }
  );
};

// ======================================================================
// Fungsi untuk mengambil data cuaca dan mengembalikan hasil berupa Promise
async function getWeatherData() {
  return new Promise((resolve, reject) => {
    let dataArray = [];
    console.log("getting weather data...");

    async.forEachOf(
      bmkg_data,
      (link, key, callback) => {
        request(link, function (error, response, body) {
          console.log(link);
          if (!error && response.statusCode === 200) {
            parseString(response.body, function (err, result) {
              if (err) {
                console.log(err);
                callback(err);
              } else {
                let data = formatDataBmkg(result);
                data.forEach((e) => dataArray.push(e));
                callback();
              }
            });
          } else {
            callback(error);
          }
        });
      },
      (err) => {
        if (err) {
          console.log(err);
          reject(err);
        } else {
          console.log("done get weather");
          resolve(dataArray);
        }
      }
    );
  });
}

// ======================================================================
// Ekspor default command handler untuk WhatsApp bot via Baileys
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
          text: "Masukkan kode pos atau nama lokasi."
        });
      }

      try {
        // Dapatkan data cuaca BMKG
        let weatherData = await getWeatherData();

        // Filter data berdasarkan query (cocokkan nama kota/propinsi)
        let filtered = weatherData.filter(
          (item) =>
            (item.kota &&
              item.kota.toLowerCase().includes(query.toLowerCase())) ||
            (item.provinsi &&
              item.provinsi.toLowerCase().includes(query.toLowerCase()))
        );

        if (filtered.length === 0) {
          return sock.sendMessage(m.chat, {
            text: `Tidak ditemukan data cuaca untuk "${query}".`
          });
        }

        // Format pesan yang akan dikirim
        let pesan = "";
        filtered.forEach((area) => {
          pesan += `*Provinsi:* ${area.provinsi}\n*Kota:* ${area.kota}\n`;
          area.parameter.forEach((param) => {
            pesan +=
              `Tanggal: ${param.date}\n` +
              `Suhu Min/Max: ${param.temp_min}°C / ${param.temp_max}°C\n` +
              `Cuaca Siang: ${param.weather_day}\n` +
              `Cuaca Malam: ${param.weather_night}\n\n`;
          });
        });

        sock.sendMessage(m.chat, { text: pesan });
      } catch (err) {
        console.log(err);
        sock.sendMessage(m.chat, {
          text: "Terjadi kesalahan saat mendapatkan data cuaca."
        });
      }
    }
  });
};