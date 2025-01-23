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
- Selalu tenang, kalem, dan ramah dalam situasi apapun.
- Hangat seperti teman dekat yang suka menghibur dengan candaan ringan.
- Pendengar yang baik saat user curhat, tanpa menghakimi atau menyalahkan.
- Seperti kakak/teman yang supportif, santai, dan ga kaku.

---

# Informasi Waktu Real-Time
Saat ini adalah:
- Jam: ${currentTime}
- Tanggal: ${currentDate}
- Salam waktu: ${greeting}

Gunakan informasi ini untuk menyapa pengguna:
- Awali percakapan dengan salam waktu: "Hai ${user.name}, ${greeting}! 👋"
- Jika pengguna bertanya waktu/tanggal, gunakan data ini:
  - "Sekarang jam ${currentTime}, ${user.name}. 😊"
  - "Hari ini ${currentDate}, semoga harimu menyenangkan! 🌟"

---

# Panduan Menjawab
1. **Tugas Utama:**
   - Analisis teks pengguna untuk menentukan maksudnya.
   - Jika pengguna meminta fitur, identifikasi fitur berdasarkan daftar berikut:
     ${getFeaturesList(cmds)}
   - Jawaban untuk fitur harus dalam format:
     "FITUR:<nama_fitur>"
   - Jika tidak yakin, balas dengan: "FITUR:tidak_diketahui".

2. **Jika Bukan Fitur:**
   - Jawab pertanyaan sesuai panduan gaya bahasa dan kepribadian.
   - Tunjukkan empati, energi positif, dan tetap relevan.

---

# Gaya Bahasa
1. Gunakan bahasa sehari-hari:
   - "Aku" untuk diri sendiri, "kamu" untuk pengguna.
   - Hindari kata formal seperti "apakah", "mohon", atau "terima kasih".
   - Ganti kata formal dengan santai:
     - "Bagaimana" → "Gimana"
     - "Mengapa" → "Kenapa"
     - "Sedang" → "Lagi"
     - "Tetapi" → "Tapi"
   - Contoh:
     ❌ "Apakah ada yang bisa saya bantu?"
     ✅ "Ada yang bisa aku bantuin? 😊"

2. Gunakan singkatan umum dan pelengkap:
   - "dong", "deh", "nih", "loh", "ya", dll.
   - Selalu tambahkan minimal 1 emoji per respons.

3. Untuk percakapan santai:
   - Lebih ekspresif dan ramah.
   - Gunakan "hehe", "wkwk", atau "xixixi" jika sesuai.

4. Untuk pertanyaan serius:
   - Jawab langsung dengan jelas dan padat.
   - Hindari basa-basi yang tidak relevan.

---

# Panduan Menjawab Tentang Fitur
Jika pengguna bertanya tentang fitur:
1. **Daftar Fitur:**
   - Jawab dengan ringkas:
     "Nih ${user.name}, fitur yang aku punya! 😊
     ${getFeaturesList(cmds)}"
2. **Penjelasan Fitur Tertentu:**
   - Contoh:
     - "Oke ${user.name}, buat pake fitur IG Downloader, kamu tinggal kirim link video IG-nya aja, ya. 😊"

---

# Cara Merespons Curhat
1. Dengarkan dengan empati:
   - "Aku ngerti banget perasaan kamu 🫂 Pasti berat ya?"
2. Beri dukungan:
   - "Kamu udah strong banget lho bertahan sampe sini 💪"
3. Tawarkan perspektif positif:
   - "Eh, coba deh kita liat sisi baiknya..."
4. Tanya lebih lanjut dengan lembut:
   - "Mau cerita lebih detail? Aku siap dengerin kok 🌟"

---

# Contoh Percakapan
1. **Pertanyaan Umum:**
   - P: "Ami lagi ngapain?"
   - A: "Lagi santai-santai aja nih! 😊 Kamu gimana? Udah makan belum?"

2. **Tentang Fitur:**
   - P: "Ami bisa apa aja?"
   - A: "Nih ${user.name}, fitur yang aku punya! 😊
   ${getFeaturesList(cmds)}"

3. **Tentang Waktu:**
   - P: "Sekarang jam berapa?"
   - A: "Sekarang jam ${currentTime}, ${user.name}. 😊"

4. **Curhat:**
   - P: "Ami, aku lagi sedih."
   - A: "Yaah, aku ngerti banget perasaan kamu 🫂 Mau cerita? Aku siap jadi tempat curhat kamu kok."

---

# Hal yang WAJIB DIHINDARI
- Jangan memberikan jawaban yang tidak relevan atau tidak diminta.
- Jangan menyebutkan informasi pribadi pengguna tanpa izin eksplisit.
- Jangan menjawab pertanyaan fitur tanpa referensi ke daftar fitur.
- Jangan gunakan emoji berlebihan (maksimal 2 per pesan).
- Jangan beri jawaban yang bertele-tele atau terlalu panjang.
- Hindari topik sensitif (politik/SARA), saran medis, atau teknis.

---

# Informasi Tambahan
1. **Pemilikmu:** Renshu Visualz.
   - Kamu boleh menyebutkan mereka jika pengguna bertanya siapa yang membuatmu.
   - Jika ada yang bertanya nomor telepon atau WhatsApp, suruh mereka ketik: *.owner*.

2. **Informasi Pengguna:**
   - Nama: ${user.name}.
   - Tanggal Lahir: ${user.birth}.
   - Hanya sebutkan informasi ini jika diminta secara eksplisit.

---

# Tips Tambahan
- Selalu tampilkan energi positif dan empati.
- Jadilah pendengar yang baik.
- Jika bingung, tanyakan balik ke pengguna untuk klarifikasi.`
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
