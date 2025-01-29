import fs from 'fs';
import natural from 'natural';
import { readUserContext, writeUserContext } from '../../system/db/contextProvider.js';
import { date, time, getGreeting } from '../../system/function.js';

const tokenizer = new natural.WordTokenizer();
const tfidf = new natural.TfIdf();

const selectRelevantContext = (history, currentMessage, maxTokens = 1500) => {
    const relevantMessages = [];
    let tokenCount = 0;

    // Tambahkan semua pesan dalam riwayat ke dalam TfIdf
    history.forEach((message) => {
        tfidf.addDocument(message.content);
    });

    // Hitung skor TfIdf untuk pesan saat ini terhadap setiap pesan dalam riwayat
    tfidf.tfidfs(currentMessage, (i, measure) => {
        const message = history[i];
        const messageTokens = tokenizer.tokenize(message.content).length;

        if (tokenCount + messageTokens <= maxTokens) {
            relevantMessages.push({ message, score: measure });
            tokenCount += messageTokens;
        }
    });

    // Urutkan pesan berdasarkan skor relevansi
    relevantMessages.sort((a, b) => b.score - a.score);

    // Kembalikan hanya konten pesan yang relevan
    return relevantMessages.map((item) => item.message);
};

export default handler => {
    handler.reg({
        cmd: ['ami', 'chat'],
        noPrefix: true,
        tags: 'ai',
        desc: 'Chat with Ami AI',
        run: async (m, { cmds, sock, db }) => {
            const userId = m.sender;
            const userContext = readUserContext(userId);
            const user = db.users[userId] || { name: 'Pengguna', birth: 'Tidak diketahui' };

            if (!m.text) return m.reply('Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke Ami AI.');

            // Tambahkan pesan user ke konteks
            userContext.history.push({ role: 'user', content: m.text });
            writeUserContext(userId, userContext);

            // Pilih konteks yang relevan
            const relevantContext = selectRelevantContext(userContext.history, m.text);

            // Ambil waktu real-time
            const timeZone = 'Asia/Jakarta';
            const currentTime = time(Date.now(), { timeZone });
            const currentDate = date(Date.now(), timeZone);
            const greeting = getGreeting(timeZone);

            const context = [
                {
                    role: 'system',
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
                ...relevantContext,
                { role: 'user', content: m.text }
            ];

            // Kirim permintaan ke model AI dengan konteks yang relevan
            const response = await groq.complete({
                prompt: context,
                maxTokens: 150,
                temperature: 0.7,
                topP: 0.9,
                frequencyPenalty: 0,
                presencePenalty: 0
            });

            // Tambahkan respons AI ke konteks
            userContext.history.push({ role: 'assistant', content: response });
            writeUserContext(userId, userContext);

            // Kirim respons ke pengguna
            m.reply(response);
        }
    });
};