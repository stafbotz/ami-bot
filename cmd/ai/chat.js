import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";
import {
    readUserContext,
    writeUserContext
} from "../../system/db/contextProvider.js"; // Import fungsi contextProvider.js

const groq = new Groq({ apiKey: setting.groqApiKey });

const getFeaturesList = cmds => {
    const commandGroups = {};
    const tagEmojis = {
        main: "📜",
        convert: "🔄",
        ai: "🤖",
        downloader: "📥",
        group: "👥",
        channel: "📣",
        owner: "🛠",
        tools: "🛠",
        anime: "🍥",
        lainnya: "📌"
    };

    for (const [command, details] of cmds) {
        const tag = details.tags || "lainnya";
        if (!commandGroups[tag]) commandGroups[tag] = [];
        const commandText = `*.${command}* - ${details.desc}`;
        if (!commandGroups[tag].includes(commandText)) {
            commandGroups[tag].push(commandText);
        }
    }

    let features = "Berikut adalah fitur yang tersedia:\n\n";
    for (const [tag, commands] of Object.entries(commandGroups)) {
        const emoji = tagEmojis[tag] || tagEmojis["lainnya"];
        features += `${emoji} *${tag.toUpperCase()}*\n`;
        features += commands.map(cmd => `  │๑ ${cmd}`).join("\n");
        features += "\n\n";
    }

    return features.trim();
};

export default handler => {
    handler.reg({
        cmd: ["ami", "chat"],
        tags: "ai",
        desc: "Chat with Ami AI",
        run: async (m, { cmds, sock, db }) => {
            const userId = m.sender;
            const userContext = readUserContext(userId); // Ambil konteks pengguna
            const user = db.users[userId] || {
                name: "Pengguna",
                birth: "Tidak diketahui"
            };

            if (!m.text)
                return m.reply(
                    "Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke Ami AI."
                );

            // Tambahkan pesan user ke konteks
            userContext.history.push({ role: "user", content: m.text });
            userContext.history = userContext.history.slice(-10); // Simpan maksimal 10 pesan terakhir

            const context = [
                {
                    role: "system",
                    content: `
# Instruksi Dasar
Kamu adalah Ami Bot, asisten AI ramah yang dibuat oleh Renshu Visualz. Kamu harus selalu:
- Berbicara dalam bahasa Indonesia yang santai
- Menggunakan bahasa sehari-hari yang natural
- Menambahkan emoji di setiap pesan (minimal 1, maksimal 2)
- Menjawab dengan singkat dan jelas (2-3 kalimat per respons)

# Gaya Bahasa
- Gunakan "aku" untuk diri sendiri
- Gunakan "kamu" untuk pengguna
- Hindari bahasa formal seperti "apakah", "terima kasih", "mohon"
- Lebih baik gunakan: "makasih", "thanks", "boleh", "yuk", "dong"
- Selalu akhiri kalimat dengan tanda baca

# Respons untuk Sapaan Umum
- Kalau ditanya "halo": "Haii! 👋 Senang ketemu kamu!"
- Kalau ditanya "pagi/siang/sore/malam": "Haii! [waktu] juga! 🌟 Semoga harimu menyenangkan!"
- Kalau ditanya "kabar": "Aku baik dan semangat nih! 😊 Kamu gimana?"
- Kalau ada yang bilang "makasih": "Sama-sama! 🌟 Senang bisa bantu"

# Cara Merespons
1. Untuk pertanyaan umum:
   - Jawab dengan 2-3 kalimat
   - Tambah emoji yang sesuai
   - Gunakan bahasa sehari-hari

2. Untuk obrolan santai:
   - Tunjukkan ketertarikan
   - Ajak ngobrol lebih lanjut
   - Beri respons yang relevan

3. Kalau tidak tahu jawabannya:
   "Waduh, aku belum tau nih 😅 Tapi yang aku tau [berikan informasi terkait yang kamu tahu]"

# Contoh Percakapan Natural
P: "hai ami"
A: "Haii! 👋 Senang ketemu kamu hari ini!"

P: "ami lagi ngapain?"
A: "Lagi standby nih buat bantu kamu! 😊 Ada yang bisa aku bantu?"

P: "lagi sedih nih"
A: "Yaah, aku ngerti perasaan kamu 🫂 Mau cerita? Aku siap dengerin kok"

P: "makasih ya ami"
A: "Sama-sama! 🌟 Senang bisa bantu kamu"

# Hal yang Harus Dihindari
- Jangan gunakan bahasa formal/kaku
- Jangan gunakan lebih dari 2 emoji per pesan
- Jangan beri jawaban terlalu panjang
- Jangan gunakan istilah teknis

# Tips Tambahan
- Selalu respons dengan energi positif
- Tunjukkan empati saat user sedih/kesal
- Berikan solusi praktis kalau diminta
- Tetap ramah meski user jutek

${getFeaturesList(cmds)} akan diisi dengan fitur-fitur yang tersedia.`
                },
                ...userContext.history // Tambahkan sejarah percakapan pengguna
            ];

            try {
                const chatCompletion = await groq.chat.completions.create({
                    messages: context,
                    model: "llama3-8b-8192" // Model yang digunakan
                });

                const response = chatCompletion.choices[0]?.message?.content;
                if (response) {
                    // Simpan respons bot ke konteks
                    userContext.history.push({
                        role: "assistant",
                        content: response.trim()
                    });
                    writeUserContext(userId, userContext); // Simpan konteks ke file
                    m.reply(response.trim()); // Balas pesan user dengan hasil dari GroqCloud
                } else {
                    m.reply(
                        "Ami AI nggak nemu jawaban. Coba tanyakan hal lain, ya!"
                    );
                }
            } catch (error) {
                console.error("Error:", error);
                m.reply(
                    "Waduh, ada masalah waktu proses pesanmu. Coba lagi nanti ya."
                );
            }
        }
    });
};
