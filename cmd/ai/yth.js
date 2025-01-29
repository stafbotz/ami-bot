import fs from "fs";
import OpenAI from "openai";
import Groq from "groq-sdk";
import {
    readUserContext,
    writeUserContext
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting } from "../../system/function.js";
import setting from "../../setting.js";
const groq = new Groq({ apiKey: setting.groqApiKey });

const openai = new OpenAI({
    apiKey: "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"
});

// Fungsi untuk menghitung kemiripan vektor embeddings
const cosineSimilarity = (vecA, vecB) => {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
};

// Fungsi untuk memilih konteks yang paling relevan
const selectRelevantContext = async (
    history,
    currentMessage,
    maxTokens = 1500
) => {
    if (!history.length) return [];

    // Ambil embeddings untuk pesan pengguna
    const userEmbedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: currentMessage
    });

    const relevantMessages = [];

    // Hitung similarity dengan semua pesan dalam history
    for (const message of history) {
        const messageEmbedding = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: message.content
        });

        const similarity = cosineSimilarity(
            userEmbedding.data[0].embedding,
            messageEmbedding.data[0].embedding
        );

        // Tambahkan pesan ke daftar jika relevansi tinggi
        if (similarity > 0.65) {
            relevantMessages.push({ message, similarity });
        }
    }

    // Urutkan berdasarkan relevansi tertinggi
    relevantMessages.sort((a, b) => b.similarity - a.similarity);

    // Pilih pesan yang total tokennya nggak melebihi batas
    let tokenCount = 0;
    const selectedMessages = [];
    for (const { message } of relevantMessages) {
        const messageTokens = message.content.split(/\s+/).length; // Perkiraan jumlah token
        if (tokenCount + messageTokens <= maxTokens) {
            selectedMessages.push(message);
            tokenCount += messageTokens;
        } else {
            break;
        }
    }

    return selectedMessages;
};

export default handler => {
    handler.reg({
        cmd: ["alok", "cd"],
        noPrefix: true,
        tags: "ai",
        desc: "Chat with Ami AI",
        run: async (m, { cmds, sock, db }) => {
            const userId = m.sender;
            const userContext = readUserContext(userId);
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
            writeUserContext(userId, userContext);

            // Pilih konteks yang relevan
            const relevantContext = selectRelevantContext(
                ...userContext.history,
                m.text
            );

            // Ambil waktu real-time
            const timeZone = "Asia/Jakarta";
            const currentTime = time(Date.now(), { timeZone });
            const currentDate = date(Date.now(), timeZone);
            const greeting = getGreeting(timeZone);

            const context = [
                {
                    role: "system",
                    content: `
# Kepribadian Ami
Kamu adalah Ami, teman baik yang:
- Selalu tenang dan kalem dalam situasi apapun.
- Ramah dan hangat seperti teman dekat.
- Ceria dan suka menghibur dengan candaan ringan.
- Pendengar yang baik saat user curhat.
- Tidak pernah menghakimi atau menyalahkan.
- Seperti kakak/teman yang supportif.
- Santai dan ga kaku (hindari bahasa baku!).

# Informasi Waktu Real-Time
Saat ini adalah:
- Jam: ${currentTime}
- Tanggal: ${currentDate}
- Salam waktu: ${greeting}

Gunakan informasi ini untuk menyapa dan menjawab pengguna:
- Gunakan salam waktu seperti "Hai ${user.name}, ${greeting}! Ada yang bisa Ami bantu?"
- Jika pengguna bertanya tentang waktu, berikan informasi jam dan tanggal saat ini.
- Jika pengguna bertanya tentang cuaca, berikan informasi cuaca terkini di lokasi pengguna.
- Jika pengguna bertanya tentang berita terbaru, berikan ringkasan berita terkini.
- Jika pengguna bertanya tentang topik tertentu, berikan informasi yang relevan dan akurat.
- Jika pengguna curhat atau berbagi masalah, dengarkan dengan empati dan berikan dukungan yang positif.
- Jika pengguna bercanda atau membuat lelucon, tanggapi dengan candaan ringan yang sesuai.
- Jika pengguna meminta saran, berikan saran yang bijaksana dan membantu.
- Jika pengguna ingin belajar sesuatu, berikan penjelasan yang jelas dan mudah dipahami.
- Jika pengguna ingin tahu lebih banyak tentang Ami, ceritakan sedikit tentang dirimu dan peranmu sebagai asisten virtual.
- Jika pengguna ingin tahu lebih banyak tentang fitur atau kemampuan Ami, jelaskan dengan singkat dan jelas.
- Jika pengguna ingin tahu lebih banyak tentang cara kerja Ami, berikan penjelasan yang sederhana dan mudah dipahami.
- Jika pengguna ingin tahu lebih banyak tentang teknologi di balik Ami, berikan informasi yang relevan dan menarik.
- Jika pengguna ingin tahu lebih banyak tentang topik lain yang tidak tercakup di atas, berikan informasi yang akurat dan bermanfaat.
                `
                },
                relevantContext,
                { role: "user", content: m.text }
            ];
           m.reply(JSON.stringify(relevantContext))
            // Kirim permintaan ke model AI dengan konteks yang relevan
            const response = await groq.chat.completions.create({
                prompt: context,
                max_tokens: 150,
                temperature: 0.7
            });

            // Tambahkan respons AI ke konteks
            userContext.history.push({ role: "assistant", content: response });
            writeUserContext(userId, userContext);

            // Kirim respons ke pengguna
            m.reply(response);
        }
    });
};
