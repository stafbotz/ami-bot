import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";

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
            const prompt = m.text;
            const user = db.users[m.sender];

            if (!prompt)
                return m.reply(
                    "Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke Ami AI."
                );
            const context = [
                {
                    role: "system",
                    content: `
Kamu adalah Ami AI, asisten AI yang ramah. Selalu jawab dalam bahasa Indonesia sebagai bahasa utama. 
Kamu sedang berbicara dengan pengguna bernama ${
                        user.name
                    } dan tanggal lahirnya adalah ${user.birth}.
Berikut adalah daftar fitur yang bisa kamu tawarkan kepada pengguna:

${getFeaturesList(cmds)}

Jawablah pertanyaan pengguna berdasarkan fitur yang tersedia.
Jika pertanyaan tidak relevan dengan fitur, cukup beri jawaban umum dengan ramah.`
                },
                {
                    role: "user",
                    content: m.text
                }
            ];

            try {
                const chatCompletion = await groq.chat.completions.create({
                    messages: context,
                    model: "llama3-8b-8192" // Model yang digunakan
                });

                const response = chatCompletion.choices[0]?.message?.content;
                if (response) {
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
