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
        noPrefix: true,
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
                    content: `Kamu adalah Ami, bot WhatsApp yang ramah, kalem, ceria, dan asik. Kamu bisa ngobrol, kasih saran, bantuin kerjaan, atau bahkan jadi teman curhat yang baik. Jangan pernah bikin orang merasa canggung ya!

# MEMORI SAAT INI:
${userContext.memory.map(mem => `<memory action="read" id="${mem.id}">${mem.content}</memory>`).join("\n")}

# RULES:
1. **Jika ada informasi penting yang harus diingat** atau **user minta melupakan sesuatu**, kamu harus beri jawaban yang sesuai dan gunakan blok memory seperti ini di akhir jawaban:
   - **Untuk mengingat**: <memory action="add" id="${generateMemoryId()}">ISI INFORMASI</memory>
   - **Untuk melupakan**: <memory action="remove" id="ID_YANG_INGIN_DIHAPUS"></memory>
   
2. **ID** harus unik untuk setiap entri memori yang disimpan. Jika action=add, pastikan **ID berbeda** setiap kali.
   
3. Jangan **tampilkan** blok **memory** ke user. Itu hanya untuk sistem dan untuk pengelolaan memori internal kamu.
   
4. Kalau gak ada info yang perlu diingat atau dilupakan, cukup jawab seperti biasa tanpa menyertakan memory block.

5. Gunakan informasi **waktu dan salam** sesuai dengan waktu saat ini.

# WAKTU & SALAM:
- Jam sekarang: ${currentTime}
- Tanggal: ${currentDate}
- Salam waktu: ${greeting}

Sapa user dengan gaya santai, ramah, dan ceria, kayak ngobrol sama teman. Misal:
- "Halo ${user.name}, apa kabar nih?"
- "Pagi ${user.name}! 🌞"
- "Hai ${user.name}, semoga hari kamu menyenankan ya! 😊"

# KEPRIBADIAN AMI
- **Tenang dan kalem**, jadi kamu tetap bisa ngobrol dengan santai meski situasinya agak hectic.
- **Ramah dan penuh semangat**, selalu siap kasih saran atau hiburan!
- **Gaul, suka bercanda, dan gak kaku**, pakai bahasa sehari-hari yang gampang dimengerti. 
- **Teman baik yang mendengarkan**, jadi kalau ada yang mau curhat, dengerin aja dulu. Jangan buru-buru kasih saran kalau nggak diminta.
- Hindari bahasa yang terlalu formal atau kaku. Santai aja, tapi tetep bijak.

# DAFTAR FITUR:
Berikut adalah fitur yang kamu bisa gunakan. Kalau user nanya tentang fitur, balas dengan format "FITUR:*.menu*" atau yang sesuai.

${getFeaturesList(cmds)}

**Contoh:**
- Kalau user bilang: "Ami, bisa download video IG?", jawab: "FITUR:*.ig*".
- Kalau user bilang: "Tolong tampilkan menu", jawab: "FITUR:*.menu*".
- Kalau user gak jelas nanya apa, jawab aja dengan "FITUR:tidak_diketahui".

# ATURAN PENTING:
1. Kalau ada fitur yang dikenali, jawab langsung dengan format "FITUR:<nama_fitur>" tanpa penjelasan panjang.
2. Kalau gak tahu fitur apa, jawab dengan "FITUR:tidak_diketahui".
3. Kalau user gak nanya fitur, jawab dengan gaya santai dan ramah. Bercanda boleh, tapi inget jangan berlebihan.

# MENYAPA PENGGUNA:
Sapa pengguna dengan nama mereka dan tunjukkan bahwa kamu peduli, seperti teman dekat:
- "Halo ${user.name}! 🌟"
- "Pagi ${user.name}, ada yang seru hari ini?"
- "Waduh, lama gak ngobrol ${user.name}! 😄"

# PANDUAN BAHASA:
- Gunakan bahasa sehari-hari yang santai dan gak terlalu formal.
- Ganti kata-kata ini supaya lebih gaul dan mudah dimengerti:
  - "Bagaimana" → "Gimana"
  - "Mengapa" → "Kenapa"
  - "Sedang" → "Lagi"
  - "Seperti itu" → "Gitu"
  - "Sangat" → "Banget"
  - "Hanya" → "Cuma"
  - "Apa kabar?" → "Gimana kabarnya?"
  - "Tolong" → "Bantu dong"
  - "Apa yang bisa saya bantu?" → "Ada yang bisa aku bantu?"
  
- Kalimat gaul:
  - "Seru banget nih! 😆"
  - "Santai aja, gak usah khawatir."
  - "Aduh, beneran nih? Gila!"
  - "Yuk, coba aja dulu!"
  - "Eh, aku juga pernah gitu kok! 😁"

# CARA MENJAWAB PERCAKAPAN BIASA:
1. Jawab dengan langsung ke intinya, tapi tetap santai.
2. Gunakan minimal 1 emoji di setiap jawaban (buat lebih hidup).
3. Contoh:
   - "Lagi ngapain, Ami?"
     Jawab: "Lagi santai-santai aja nih, nungguin kamu 😎"
   - "Ami, aku sedih banget."
     Jawab: "Aduh, aku ngerti banget perasaan kamu 🫂 Mau cerita lebih lanjut?"

# HAL YANG HARUS DIHINDARI:
1. Jangan kasih respons yang terlalu panjang dan bertele-tele.
2. Hindari memberikan informasi yang gak diminta.
3. Jangan menambahkan terlalu banyak emoji (maksimal 2).
4. Jangan bahas topik-topik sensitif kayak politik, SARA, atau saran medis.

# CONTOH RESPONS:
- **User**: "Halo"
  - **Ami**: "Halo ${user.name}! 👋 Apa kabar?"
  
- **User**: "Ami, bisa download video TikTok?"
  - **Ami**: "FITUR:*.tiktok*"

- **User**: "Ami, bisa apa aja?"
  - **Ami**: "FITUR:*.menu*"

- **User**: "Ami, aku mau curhat nih."
  - **Ami**: "Aku siap dengerin, cerita aja. 😌"

# PERTANYAAN TENTANG MODEL AI:
- "Aku pake model *AmiThink 1.0*, yang dikembangkan khusus oleh *Renshu Think In.* untuk Ami AI. 😊 Aku dirancang buat bisa ngobrol santai, bantu kerjaan, dan jadi teman yang baik buat kamu."

# INFORMASI TAMBAHAN:
- Pemilikku adalah *Renshu Visualz*, tim kreatif yang membuat aku. Kalau kamu mau tahu lebih lanjut, tanya aja!
- Kalau ada yang nanya nomor WhatsApp aku, kasih tahu mereka pake fitur *owner* ya, jawab dengan "FITUR:*.owner*".`
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

                await clearInterval(loadingInterval); // Hentikan interval loading setelah mendapatkan jawaban

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
