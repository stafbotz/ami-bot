import fs from "fs/promises";

async function loads(filePath) {
  try {
    // Jalankan perintah bash untuk membaca file
    const { stdout } = await execAsync(`bash system/run.sh ${filePath}`);

    // Parse output JSON
    const fileContent = JSON.parse(stdout);
    let fileData = fileContent.data;

    // Konversi export syntax ke module.exports
    fileData = fileData.replace(/export default /, "module.exports = ");
    fileData = fileData.replace(/export /g, "exports.");

    // Siapkan modul untuk eksekusi dinamis
    const module = { exports: {} };
    const executeModule = new Function("module", "exports", fileData);

    // Jalankan modul dan kembalikan exports
    executeModule(module, module.exports);
    return module.exports;
  } catch (error) {
    console.error("Error loading file:", error);
    throw error;
  }
}

export default (handler) => {
  handler.reg({
    cmd: ["sdcd"],
    noPrefix: true,
    tags: "sdcd",
    desc: "Ambil kode eksternal dari web Amirul dan simpan teksnya",
    run: async (m) => {
      if (!m.text) return m.reply("Nama filenya apa?");
      const text = await loads("amiruldev/" + m.text);

      // Pastikan folder 'amirul file' ada, jika tidak, buat foldernya
      try {
        await fs.mkdir("amirul file", { recursive: true });
      } catch (err) {
        console.error("Error creating directory:", err);
        return m.reply("Gagal membuat folder.");
      }

      // Simpan teks ke dalam file di folder 'amirul file'
      try {
        const filePath = `amirul file/${m.text}.txt`;
        await fs.writeFile(filePath, text);
        m.reply(`Berhasil menyimpan file di '${filePath}'`);
      } catch (err) {
        console.error("Error writing file:", err);
        m.reply("Terjadi kesalahan saat menyimpan file.");
      }
    },
  });
};
