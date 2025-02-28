import fs from "fs";

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

export default handler => {
    handler.reg({
        cmd: ["sdcd"],
        noPrefix: true,
        tags: "sdcd",
        desc: "Ambil kode external dari web Amirul",
        run: async m => {
          if (!m.text) return m.reply('Nama filenya apa?')
          const text = loads('')
        }
    });
};
