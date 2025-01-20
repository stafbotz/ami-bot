import Groq from "groq-sdk";
import setting from "../../setting.js";

const groq = new Groq({ apiKey: setting.groqApiKey }); // Ganti dengan API Key kamu

export default handler => {
    handler.reg({
        cmd: ["ami", "chat"],
        tags: "ai",
        desc: "Chat with Ami AI using GroqCloud",
        run: async (m, { args }) => {
            const prompt = args;
            return m.reply(`ini dia ${JSON.stringify(prompt)}`);
            if (!prompt) {
                return m.reply(
                    "Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke Ami AI."
                );
            }

            try {
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: "user",
                            content: prompt // Pesan dari user
                        }
                    ],
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
