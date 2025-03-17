import axios from "axios";
import * as cheerio from "cheerio";

async function webSearch(query) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&gl=us`;

  const { data } = await axios.get(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36"
    }
  });

  const $ = cheerio.load(data);
  const results = [];

  $("div.yuRUbf").each((i, element) => {
    const aTag = $(element).find("a");
    let link = aTag.attr("href");
    const title = aTag.find("h3").text().trim();
    const description = $(element).parent().find("div.VwiC3b").text().trim() || "Tidak ada deskripsi";

    if (title && link) {
      if (link.startsWith("/url?q=")) {
        const match = link.match(/\/url\?q=([^&]+)/);
        if (match && match[1]) link = match[1];
      }
      results.push({ title, url: link, description });
    }
  });

  const resultsWithContent = await Promise.all(
    results.map(async (result) => {
      try {
        const { data: pageData } = await axios.get(result.url);
        const $page = cheerio.load(pageData);
        let content = $page("article, .content, .main-content, main")
          .text()
          .replace(/\s+/g, " ")
          .trim();
        if (content.length > 500) content = content.substring(0, 500) + "...";
        return { ...result, content };
      } catch (error) {
        return { ...result, content: "Tidak dapat mengambil konten halaman" };
      }
    })
  );

  return resultsWithContent;
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
        if (results.length === 0)
          return await sock.sendMessage(m.from, { text: "Maaf, tidak ditemukan hasil." });

        let response = `🔍 Hasil pencarian untuk: "${query}"\n\n`;
        results.forEach((result, index) => {
          response += `${index + 1}. *${result.title}*\n`;
          response += `🔗 ${result.url}\n`;
          response += `📝 ${result.description}\n`;
          response += `📄 Konten:\n${result.content}\n\n`;
        });

        await sock.sendMessage(m.from, { text: response });
      } catch (error) {
        console.error("Error:", error);
        await sock.sendMessage(m.from, {
          text: "❌ Maaf, terjadi error saat melakukan pencarian."
        });
      }
    }
  });
};
