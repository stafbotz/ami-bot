import axios from "axios";
import * as cheerio from "cheerio";

async function webSearch(query) {
  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      },
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $("div.g").each((i, element) => {
      const title = $(element).find("div.yuRUbf > a > h3").text();
      const link = $(element).find("div.yuRUbf > a").attr("href");
      const snippet =
        $(element).find("div.IsZvec").text() ||
        $(element).find(".VwiC3b").text();

      if (title && link) {
        results.push({
          title,
          url: link.startsWith("/url?q=") ? link.slice(7) : link,
          description: snippet || "Deskripsi tidak tersedia",
        });
      }
    });

    const contentsPromises = results.map(async (result) => {
      try {
        const pageResponse = await axios.get(result.url);
        const $page = cheerio.load(pageResponse.data);
        const content =
          $page("article, .content, .main-content, main")
            .text()
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
