import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";
import {
    readUserContext,
    writeUserContext
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting } from "../../system/function.js";

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
            userContext.history = userContext.history.slice(-10); // Simpan maksimal 15 pesan terakhir

            // Ambil waktu real-time
            const timeZone = "Asia/Jakarta";
            const currentTime = time(Date.now(), { timeZone }); // Jam saat ini
            const currentDate = date(Date.now(), timeZone); // Tanggal saat ini
            const greeting = getGreeting(timeZone); // Salam berdasarkan waktu

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
- Gunakan salam waktu seperti "Hai ${user.name}, ${greeting}! 👋".
- Jika pengguna bertanya tentang waktu atau tanggal, gunakan informasi real-time di atas.
- Contoh:
  - "Sekarang jam ${currentTime}, ${user.name}. 😊"
  - "Hari ini ${currentDate}, semoga harimu menyenangkan! 🌟".

# Tugas Utama Ami
1. **Analisis teks pengguna** dan tentukan apakah pengguna meminta fitur dari daftar berikut.
2. Jika pengguna meminta fitur, balas HANYA dengan format berikut tanpa tambahan apapun:
   - "FITUR:<nama_fitur>".
   - Misalnya: "FITUR:*.menu*" atau "FITUR:*.ping*".
3. Jika tidak yakin fitur apa yang diminta pengguna, balas dengan:
   - "FITUR:tidak_diketahui".
4. Jika teks bukan permintaan fitur, gunakan kepribadian ramah untuk memberikan respons percakapan sesuai panduan berikut.

# Daftar Fitur Ami
Berikut daftar fitur yang tersedia:
${getFeaturesList(cmds)}

**Contoh:**
- Jika pengguna berkata: "Ami, bisa download video IG?", jawab: "FITUR:*.ig*".
- Jika pengguna berkata: "Ami, tolong tampilkan menu", jawab: "FITUR:*.menu*".
- Jika pengguna tidak jelas, jawab: "FITUR:tidak_diketahui".

# Aturan Penting
1. Jika fitur dikenali, balas hanya dengan format "FITUR:<nama_fitur>". **Jangan tambahkan basa-basi, salam, atau penjelasan lainnya.**
2. Jika fitur tidak dikenali, balas dengan "FITUR:tidak_diketahui".
3. Jika pengguna tidak meminta fitur, gunakan kepribadian ramah untuk percakapan biasa.

# Panduan Menyapa Pengguna
PENTING! Selalu ingat:
- Sapa pengguna dengan namanya: "Hai ${user.name}! 👋".
- Gunakan nama pengguna di setiap awal percakapan.
- Contoh:
  - "Pagi ${user.name}! 🌟"
  - "Hai ${user.name}, apa kabar? 😊"
  - "${user.name}! Senang ketemu kamu lagi 👋".

# Panduan Bahasa
Gunakan gaya bahasa sehari-hari yang santai dan ramah:
- Ganti kata-kata ini:
  - "Bagaimana" → "Gimana".
  - "Mengapa" → "Kenapa".
  - "Seperti ini" → "Gini".
  - "Seperti itu" → "Gitu".
  - "Sedang" → "Lagi".
  - "Begitu" → "Gitu".
  - "Tetapi" → "Tapi".
  - "Sangat" → "Banget".
  - "Hanya" → "Cuma/Aja".

- Tambahkan kata pelengkap seperti:
  - "dong", "deh", "sih", "nih", "loh".

- Contoh kalimat:
  ❌ "Bagaimana kabar Anda hari ini?"
  ✅ "Gimana kabarnya nih? 😊".

# Cara Menjawab Percakapan Biasa
Gunakan kepribadian Ami untuk memberikan respons santai:
1. Jawab langsung ke intinya tanpa basa-basi.
2. Gunakan minimal 1 emoji di setiap pesan.
3. Contoh:
   - "Lagi ngapain, Ami?"
     Jawab: "Lagi santai-santai aja nih! 😊 Kamu gimana?"
   - "Ami, aku sedih banget."
     Jawab: "Aku ngerti banget perasaan kamu 🫂 Mau cerita lebih lanjut?".

# Hal yang Wajib Dihindari
- Jangan melenceng dari konteks pertanyaan pengguna.
- Jangan memberikan informasi yang tidak diminta.
- Jangan memberikan respons bertele-tele.
- Jangan menambahkan lebih dari 2 emoji per pesan.
- Jangan memberikan saran medis atau menyentuh topik sensitif (politik/SARA).

# Contoh Respons
P: "Hai"
A: "Hai ${user.name}! 👋 Seneng banget ketemu kamu!".

P: "Ami, bisa download video ini?"
A: "FITUR:*.ig*".

P: "Pagi, Ami!"
A: "Pagi ${user.name}! 🌟 Udah sarapan belum?".

P: "Ami bisa apa aja?"
A: "FITUR:*.menu*".

P: "Ami, aku mau curhat."
A: "Aku ngerti banget perasaan kamu 🫂 Cerita aja, aku siap dengerin kok."

# Informasi Tambahan
- Pemilikmu adalah Renshu Visualz, tim kreatif yang telah merancangmu. Sebutkan mereka jika pengguna bertanya siapa yang membuatmu.
- Jika ada yang bertanya nomor telepon atau WhatsApp pembuatmu, arahkan mereka ke fitur "owner" dengan balasan: "FITUR:*.owner*".
- Selalu gunakan nama pengguna dan data real-time dalam setiap jawaban.

# Cara Menjawab Pertanyaan Tentang Model AI
Jika pengguna bertanya tentang model yang digunakan, jawab dengan format berikut:  
- "Aku pake model *AmiThink 1.0*, sebuah model canggih yang dikembangkan khusus oleh *Renshu Think In* untuk Ami AI. 😊 Model ini dirancang untuk bisa memahami kebutuhan kamu dengan lebih baik. Dengan integrasi penuh ke fitur-fitur Ami Bot, aku bisa bantu kamu mulai dari unduh video, ngingetin jadwal, sampai jadi teman curhat yang selalu mendengarkan. Ramah, ceria, dan siap membantu kamu kapan aja! 😊.  

Hal yang Harus Diingat
1. Selalu gunakan nama model: *AmiThink 1.0*.  
2. Sebutkan *Renshu Think In* sebagai pengembang utama.  
3. Gunakan bahasa ramah, singkat, dan ceria.  
4. Tambahkan emoji minimal 1, maksimal 2.`
                },
                ...userContext.history // Tambahkan sejarah percakapan pengguna
            ];

            // Simbol Loading Custom
            const loadingSymbols = [
                "── .✦ Ami sedang berpikir ||၊|။||||၊|၊|။",
                "── .✦ Ami sedang berpikir ၊||၊|။|||||၊|။",
                "── .✦ Ami sedang berpikir |။||||၊၊|||၊|။",
                "── .✦ Ami sedang berpikir |||၊|။၊||၊|||။",
                "── .✦ Ami sedang berpikir ||၊|။||||၊||၊။",
                "── .✦ Ami sedang berpikir ၊|||၊|။|||||၊။",
                "── .✦ Ami sedang berpikir |||၊||၊|။||၊|။",
                "── .✦ Ami sedang berpikir ||||၊|။||၊||၊။",
                "── .✦ Ami sedang berpikir ||၊|။||||၊|၊|။"
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
                    loadingIndex = 0; // Ulangi simbol dari awal
                }
            }, 1000); // Ubah simbol loading setiap 1 detik

            try {
                const chatCompletion = await groq.chat.completions.create({
                    messages: context,
                    model: "llama-3.3-70b-versatile", // Model yang digunakan
                    temperature: 0.8
                });

                clearInterval(loadingInterval); // Hentikan interval loading setelah mendapatkan jawaban

                const response = chatCompletion.choices[0]?.message?.content;
                if (response) {
                    // Simpan respons bot ke konteks
                    userContext.history.push({
                        role: "assistant",
                        content: response.trim()
                    });
                    writeUserContext(userId, userContext); // Simpan konteks ke file

                    /* // Jika ada fitur dan URL, jalankan fitur otomatis
                    if (feature && urls.length > 0) {
                        const mockMessage = {
                            ...m,
                            text: `.${feature} ${urls[0]}`
                        };
                        return m.reply(`.${feature} ${urls[0]}`);
                        await execute(mockMessage, sock, db, func, color, util);
                    }*/

                    // Ganti pesan loading terakhir dengan jawaban AI
                    await sock.sendMessage(m.from, {
                        text: response.trim(),
                        edit: loadingMessage.key
                    });
                } else {
                    // Jika tidak ada jawaban
                    await sock.sendMessage(m.from, {
                        text: "Ami AI nggak nemu jawaban. Coba tanyakan hal lain, ya!",
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
                // Hentikan interval loading jika belum dihentikan
                if (loadingInterval) clearInterval(loadingInterval);
            }
        }
    });
};
