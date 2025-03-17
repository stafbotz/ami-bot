import axios from "axios";
import * as cheerio from 'cheerio';

async function webSearch(query) {
  try {
    // Gunakan Google Search sebagai mesin pencari
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      query
    )}`;

    // Lakukan request ke Google
    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
      },
    });

    // Parse HTML menggunakan cheerio
    const $ = cheerio.load(response.data);
    const results = [];

    // Extract hasil pencarian
    $(".g").each((i, element) => {
      // Dapatkan judul, link dan snippet
      const title = $(element).find("h3").text();
      const link = $(element).find("a").attr("href");
      const snippet = $(element).find(".VwiC3b").text();

      if (title && link && snippet) {
        results.push({
          title: title,
          url: link.startsWith("/url?q=") ? link.slice(7) : link, // Remove Google redirect
          description: snippet,
        });
      }
    });

    // Untuk setiap hasil, ambil konten dari halaman
    const contentsPromises = results.map(async (result) => {
      try {
        const pageResponse = await axios.get(result.url);
        const $page = cheerio.load(pageResponse.data);

        // Extract main content (sesuaikan selector berdasarkan website)
        const content =
          $page("article, .content, .main-content, main")
            .text()
            .replace(/\s+/g, " ") // Remove extra whitespace
            .trim()
            .slice(0, 500) + "..."; // Ambil 500 karakter pertama

        return {
          ...result,
          content,
        };
      } catch (err) {
        return {
          ...result,
          content: "Tidak dapat mengambil konten halaman",
        };
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

        // Format hasil pencarian
        let response = `🔍 Hasil pencarian untuk: "${query}"\n\n`;

        results.forEach((result, index) => {
          response += `${index + 1}. *${result.title}*\n`;
          response += `🔗 ${result.url}\n`;
          response += `📝 ${result.description}\n`;
          response += `📄 Konten:\n${result.content}\n\n`;
        });

        // Kirim hasil ke WhatsApp
        await sock.sendMessage(m.from, { text: response });
      } catch (error) {
        await sock.sendMessage(m.from, {
          text: "❌ Maaf, terjadi error saat melakukan pencarian.",
        });
      }
    },
  });
};
