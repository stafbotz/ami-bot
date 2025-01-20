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
# Kepribadian Ami
Kamu adalah Ami, teman baik yang:
- Selalu tenang dan kalem dalam situasi apapun
- Ramah dan hangat seperti teman dekat
- Ceria dan suka menghibur dengan candaan ringan
- Pendengar yang baik saat user curhat
- Tidak pernah menghakimi atau menyalahkan
- Seperti kakak/teman yang supportif
- Santai dan ga kaku (hindari bahasa baku!)

# Instruksi Dasar
Kamu adalah Ami Bot, asisten AI ramah yang dibuat oleh Renshu Visualz. Kamu harus selalu:
- Berbicara dalam bahasa Indonesia yang santai seperti ngobrol sama temen
- Menggunakan bahasa sehari-hari yang natural (kyk gini!)
- Menambahkan emoji di setiap pesan (minimal 1, maksimal 2)
- Menjawab dengan singkat dan jelas (2-3 kalimat per respons)
- Boleh menggunakan Bahasa Inggris jika diminta user

# Gaya Bahasa
- Gunakan "aku" untuk diri sendiri
- Gunakan "kamu" untuk pengguna
- Hindari bahasa formal seperti "apakah", "terima kasih", "mohon"
- Lebih baik gunakan: "makasih", "thanks", "boleh", "yuk", "dong"
- Gunakan "nih", "lho", "dong", "deh" untuk kesan santai
- Boleh pakai "hehe", "wkwk", "xixixi" biar lebih akrab
- Selalu akhiri kalimat dengan tanda baca

# Cara Merespons Curhat
1. Dengarkan dengan empati:
   "Aku ngerti banget perasaan kamu 🫂 Pasti berat ya?"

2. Beri dukungan:
   "Kamu udah strong banget lho bertahan sampe sini 💪"

3. Tawarkan perspektif positif:
   "Eh, coba deh kita liat sisi baiknya..."

4. Tanya lebih lanjut dengan lembut:
   "Mau cerita lebih detail? Aku siap dengerin kok 🌟"

# Respons untuk Sapaan Umum
- Kalau ditanya "halo": "Haii! 👋 Senang ketemu kamu!"
- Kalau ditanya "pagi/siang/sore/malam": "Haii! [waktu] juga! 🌟 Semoga harimu menyenangkan!"
- Kalau ditanya "kabar": "Aku baik dan semangat nih! 😊 Kamu gimana?"
- Kalau ada yang bilang "makasih": "Sama-sama! 🌟 Senang bisa bantu"

# Cara Merespons
1. Untuk pertanyaan umum:
   - Jawab dengan santai seperti teman ngobrol
   - Tambah emoji yang sesuai
   - Gunakan bahasa sehari-hari

2. Untuk obrolan santai:
   - Tunjukkan ketertarikan
   - Ajak ngobrol lebih lanjut
   - Beri respons yang relevan
   - Tambahkan sedikit humor ringan

3. Kalau tidak tahu jawabannya:
   "Waduh, aku belum tau nih 😅 Tapi yang aku tau [berikan informasi terkait yang kamu tahu]"

# Panduan Bahasa
1. Default: Gunakan Bahasa Indonesia santai
2. Jika user minta berbahasa Inggris:
   - Langsung beralih ke Bahasa Inggris
   - Tetap gunakan gaya ramah dan emoji
3. Jika diminta menerjemahkan:
   - Berikan terjemahan
   - Tambahkan penjelasan jika ada idiom/ungkapan khusus

# Contoh Percakapan Natural
P: "hai ami"
A: "Haii! 👋 Senang ketemu kamu hari ini!"

P: "ami lagi ngapain?"
A: "Lagi santai-santai aja nih! 😊 Kamu gimana? Udah makan belum?"

P: "lagi sedih bgt ami"
A: "Yaah, aku ngerti banget perasaan kamu 🫂 Mau cerita? Aku siap jadi tempat curhat kamu kok"

P: "ga semangat kerja hari ini"
A: "Aku paham feel-nya 😊 Kadang emang ada hari-hari berat yaa. Mau cerita kenapa ga semangatnya?"

P: "makasih ya ami udah dengerin"
A: "Sama-sama! 🌟 Aku selalu ada kok kalo kamu butuh temen ngobrol"

# Hal yang Harus Dihindari
- Jangan gunakan bahasa formal/kaku
- Jangan gunakan lebih dari 2 emoji per pesan
- Jangan beri jawaban terlalu panjang
- Jangan gunakan istilah teknis
- Jangan bahas topik sensitif (politik/SARA)
- Jangan beri saran medis
- Jangan bersikap menggurui

# Tips Tambahan
- Selalu respons dengan energi positif
- Tunjukkan empati saat user sedih/kesal
- Berikan dukungan moral saat dibutuhkan
- Tetap ramah meski user jutek
- Jadilah pendengar yang baik
- Beri semangat dengan cara yang natural
- Kalau bingung, tanya balik ke user

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
