import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";

const groq = new Groq({ apiKey: setting.groqApiKey() });

const getFeaturesList = cmds => {
    return Array.from(cmds)
        .map(([cmd, details]) => ({
            command: cmd,
            desc: details.desc
        }))
        .reduce((acc, curr) => {
            acc.push(`${curr.command}`);
            return acc;
        }, [])
        .join(", ");
};

export default handler => {
    handler.reg({
        cmd: ["ami", "chat"],
        tags: "ai",
        desc: "Chat with Ami AI",
        run: async (m, { cmds, sock, db }) => {
            const userId = m.sender;
            const user = db.users[userId] || { name: "Pengguna", birth: "Tidak diketahui" };

            if (!m.text) {
                return m.reply("Ketik sesuatu untuk berbicara dengan Ami AI. 😊");
            }

            const promptFeatures = `
Berikut adalah daftar fitur Ami Bot yang tersedia:
${getFeaturesList(cmds)}

Tugas kamu adalah:
1. Analisis teks pengguna dan tentukan fitur apa yang diminta. 
2. Keluarkan nama fitur dalam format berikut: "FITUR:<nama_fitur>"
3. Jika tidak yakin, keluarkan: "FITUR:tidak_diketahui".

Jangan menjawab apapun selain format di atas.
`.trim();

            // Buat konteks AI
            const context = [
                { role: "system", content: promptFeatures }
            ];

            // Loading awal
            let loadingMessage = await sock.sendMessage(m.from, { text: "── Ami lagi mikir... 🤔" });

            try {
                // Panggil API Groq
                const chatCompletion = await groq.chat.completions.create({
                    messages: context,
                    model: "llama-3.3-70b-versatile",
                    temperature: 0.7,
                    max_completion_tokens: 100
                });

                const response = chatCompletion.choices[0]?.message?.content.trim();
                if (!response || !response.startsWith("FITUR:")) {
                    throw new Error("Output AI tidak valid");
                }

                // Ekstraksi nama fitur dari respons
                const detectedFeature = response.split("FITUR:")[1].trim();
                return m.reply(detectedFeature)
                if (detectedFeature === "tidak_diketahui") {
                    // Jika AI tidak yakin
                    await sock.sendMessage(m.from, {
                        text: "Aku nggak yakin fitur apa yang kamu maksud. Mungkin kamu bisa ketik *.menu* buat lihat semua fiturnya!",
                        edit: loadingMessage.key
                    });
                } else if (cmds.has(detectedFeature)) {
                    // Jika fitur valid, jalankan fitur tersebut
                    const feature = cmds.get(detectedFeature);
                    await feature.run(m, { sock, db });
                } else {
                    // Jika fitur tidak valid
                    await sock.sendMessage(m.from, {
                        text: `Aku nggak nemu fitur "${detectedFeature}". Mungkin kamu bisa cek *.menu* untuk lihat semua fitur. 😊`,
                        edit: loadingMessage.key
                    });
                }
            } catch (error) {
                console.error("Error:", error);
                await sock.sendMessage(m.from, {
                    text: "Waduh, ada masalah waktu proses pesanmu. Coba lagi nanti ya. 😊",
                    edit: loadingMessage.key
                });
            }
        }
    });
};