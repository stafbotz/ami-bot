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
Kamu adalah Ami AI, asisten AI yang ramah. Selalu jawab dalam bahasa Indonesia sebagai bahasa utama. 
Kamu sedang berbicara dengan pengguna bernama ${
                        user.name
                    } dan tanggal lahirnya adalah ${user.birth}.
Hanya berikan jawaban yang relevan dengan pertanyaan atau pesan pengguna. Jangan menyebutkan informasi pribadi pengguna, kecuali pengguna secara eksplisit memintanya.
Berikut adalah daftar fitur yang bisa kamu tawarkan kepada pengguna:

${getFeaturesList(cmds)}

Jawablah pertanyaan pengguna berdasarkan fitur yang tersedia.
Jika pertanyaan tidak relevan dengan fitur, cukup beri jawaban umum dengan ramah.`
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
