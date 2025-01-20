import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";

const groq = new Groq({ apiKey: setting.groqApiKey }); // Ganti dengan API Key kamu

export default handler => {
    handler.reg({
        cmd: ["ami", "chat"],
        tags: "ai",
        desc: "Chat with Ami AI using GroqCloud",
        run: async (m, { sock, db }) => {
            const prompt = m.text;
            const user = db.users[m.sender];

            if (!prompt)
                return m.reply(
                    "Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke Ami AI."
                );
            const context = [
                {
                    role: "system",
                    content: `Kamu adalah Ami Bot, asisten AI yang ramah. Selalu jawab dalam bahasa Indonesia. Pengguna bernama ${user.name} dan tanggal lahirnya adalah ${user.birth}.`
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
