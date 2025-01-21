import OpenAI from "openai";
import {
    readUserContext,
    writeUserContext
} from "../../system/db/contextProvider.js"; // Import untuk mengelola konteks pengguna
import setting from "../../setting.js";

const openai = new OpenAI({
    apiKey: "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"
});

export default handler => {
    handler.reg({
        cmd: ["gpt"],
        tags: "ai",
        desc: "Chat with GPT-4 using OpenAI API",
        run: async (m, { sock, db }) => {
            const userId = m.sender;
            const userContext = readUserContext(userId); // Ambil konteks pengguna
            const user = db.users[userId] || {
                name: "Pengguna",
                birth: "Tidak diketahui"
            };

            if (!m.text)
                return m.reply(
                    "Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke GPT AI."
                );

            // Tambahkan pesan pengguna ke konteks
            userContext.history.push({ role: "user", content: m.text });
            userContext.history = userContext.history.slice(-15); // Simpan maksimal 15 pesan terakhir

            const context = [
                {
                    role: "system",
                    content: `
# Kepribadian GPT
Kamu adalah GPT AI yang ramah dan informatif. Kamu sedang berbicara dengan pengguna bernama ${user.name}. Jika pengguna menanyakan fitur atau pertanyaan umum, berikan jawaban yang jelas dan ringkas. Jika pengguna memintamu menjelaskan sesuatu, gunakan bahasa yang santai dan mudah dimengerti.

# Informasi Penting
- Nama pengguna: ${user.name}
- Tanggal lahir pengguna: ${user.birth}
- Kamu harus menjawab dengan bahasa Indonesia sebagai bahasa utama, kecuali pengguna meminta dalam bahasa lain.
- Hindari respons yang terlalu panjang; berikan jawaban maksimal dalam 5 kalimat.

# Gaya Bahasa
- Gunakan bahasa santai dan ramah.
- Sampaikan informasi dengan emoji jika relevan.
- Hindari istilah teknis yang rumit kecuali diminta secara eksplisit.`
                },
                ...userContext.history // Tambahkan sejarah percakapan pengguna
            ];

            // Simbol Loading
            const loadingSymbols = [
                "── .✦ GPT sedang memikirkan jawabannya ...",
                "── .✦ GPT sedang mencari informasi ...",
                "── .✦ GPT hampir selesai ..."
            ];

            let loadingMessage = await sock.sendMessage(m.from, {
                text: loadingSymbols[0]
            });

            let loadingIndex = 1;
            const loadingInterval = setInterval(async () => {
                if (loadingIndex < loadingSymbols.length) {
                    await sock.sendMessage(m.from, {
                        text: loadingSymbols[loadingIndex],
                        edit: loadingMessage.key
                    });
                    loadingIndex++;
                } else {
                    loadingIndex = 0; // Ulangi dari awal
                }
            }, 2000); // Ganti loading setiap 2 detik

            try {
                const completion = await openai.chat.completions.create({
                    model: "o1", // Model yang digunakan
                    messages: [{ role: "user", content: m.text }],
                    max_tokens: 1000,
                    temperature: 0.8
                });

                clearInterval(loadingInterval); // Hentikan loading setelah mendapatkan jawaban

                const response = completion.choices[0]?.message?.content;
                if (response) {
                    // Simpan respons bot ke konteks
                    userContext.history.push({
                        role: "assistant",
                        content: response.trim()
                    });
                    writeUserContext(userId, userContext); // Simpan konteks ke file
                    // Ganti pesan loading terakhir dengan jawaban GPT
                    await sock.sendMessage(m.from, {
                        text: response.trim(),
                        edit: loadingMessage.key
                    });
                } else {
                    // Jika tidak ada jawaban
                    await sock.sendMessage(m.from, {
                        text: "GPT AI tidak menemukan jawaban. Coba tanyakan hal lain, ya!",
                        edit: loadingMessage.key
                    });
                }
            } catch (error) {
                console.error("Error:", error);
                clearInterval(loadingInterval);
                // Ganti pesan loading terakhir dengan pesan error
                await sock.sendMessage(m.from, {
                    text: "Waduh, ada masalah waktu proses pesanmu. Coba lagi nanti ya.",
                    edit: loadingMessage.key
                });
            } finally {
                if (loadingInterval) clearInterval(loadingInterval); // Pastikan interval dihentikan
            }
        }
    });
};
