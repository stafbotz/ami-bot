import axios from "axios";
import * as cheerio from "cheerio";

async function webSearch(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      query
    )}&hl=en`;

    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      },
    });

    // Debug: Cetak sebagian HTML untuk memastikan responnya sesuai
    console.log("Scraped HTML snippet:", response.data.slice(0, 200));

    const $ = cheerio.load(response.data);
    const results = [];

    $("div.g").each((i, element) => {
      const title = $(element).find("div.yuRUbf > a > h3").text().trim();
      const link = $(element).find("div.yuRUbf > a").attr("href");
      const snippet =
        $(element).find("div.IsZvec").text().trim() ||
        $(element).find(".VwiC3b").text().trim();

      if (title && link) {
        let url = link;
        if (link.startsWith("/url?q=")) {
          const endIndex = link.indexOf("&", 7);
          url = link.slice(7, endIndex !== -1 ? endIndex : undefined);
        }
        results.push({
          title,
          url,
          description: snippet || "Deskripsi tidak tersedia",
        });
      }
    });

    console.log("Parsed results:", results);

    const contentsPromises = results.map(async (result) => {
      try {
        const pageResponse = await axios.get(result.url);
        const $page = cheerio.load(pageResponse.data);
        const content =
          (
            $page("article").text() ||
            $page(".content").text() ||
            $page(".main-content").text() ||
            $page("main").text()
          )
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500) + "...";
        return { ...result, content };
      } catch (err) {
        return { ...result, content: "Tidak dapat mengambil konten halaman" };
      }
    });

    const finalResults = await Promise.all(contentsPromises);
    return finalResults;
  } catch (error) {
    console.error("Error:", error);
    throw new Error("Gagal melakukan pencarian web");
  }
}

export default (handler) => {
  handler.reg({
    cmd: ["websearch"],
    tags: "main",
    desc: "Search on Internet",
    run: async (m, { sock }) => {
      if (!m.text) return m.reply("Yang Mau Dicari Apa?");
      const query = m.text;

      try {
        const results = await webSearch(query);

        let response = `🔍 Hasil pencarian untuk: "${query}"\n\n`;

        results.forEach((result, index) => {
          response += `${index + 1}. *${result.title}*\n`;
          response += `🔗 ${result.url}\n`;
          response += `📝 ${result.description}\n`;
          response += `📄 Konten:\n${result.content}\n\n`;
        });

        await sock.sendMessage(m.from, { text: response });
      } catch (error) {
        await sock.sendMessage(m.from, {
          text: "❌ Maaf, terjadi error saat melakukan pencarian.",
        });
      }
    },
  });
};
