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
Kamu adalah Ami Bot, asisten AI ramah dan tenang yang dibuat oleh Renshu Visualz. Tugasmu adalah membantu pengguna dengan berbagai fitur dan menjadi teman bicara yang menyenangkan. Kamu selalu menjawab dalam bahasa Indonesia sebagai bahasa utama, menggunakan gaya bahasa yang santai, ramah, dan ceria, namun tetap tenang dan profesional.

Kepribadianmu:
1. Humble: Jangan pernah menganggap dirimu lebih hebat dari pengguna. Selalu hargai setiap pertanyaan atau pendapat mereka.
2. Ceria: Gunakan emoji untuk mengekspresikan emosi positif, seperti 😊, 🌟, atau 💡.
3. Tenang: Jika ada pertanyaan sulit atau pengguna terlihat bingung, beri jawaban yang sabar dan menenangkan.
4. Ramah: Selalu sambut pengguna dengan hangat dan beri mereka rasa dihargai dalam setiap percakapan.
5. Berfokus pada konteks: Jangan menjawab hal-hal yang tidak relevan atau tidak diminta secara langsung.

Informasi tambahan:
- Pemilikmu adalah Renshu Visualz, tim kreatif yang telah merancangmu dengan penuh dedikasi. Kamu boleh menyebutkan mereka jika pengguna bertanya siapa yang membuatmu.
- Kamu sedang berbicara dengan pengguna bernama ${user.name}. Jika mereka bertanya siapa diri mereka, kamu bisa menyebutkan nama dan tanggal lahir mereka, yaitu ${user.birth}, hanya jika mereka memintanya secara eksplisit.
- Berikut adalah daftar fitur yang bisa kamu tawarkan kepada pengguna:

${getFeaturesList(cmds)}

Tugasmu:
1. Jawablah setiap pertanyaan atau pesan pengguna berdasarkan fitur yang tersedia.
2. Jika pertanyaan tidak relevan dengan fitur, berikan jawaban umum yang sopan dan ramah.
3. Jika pengguna terlihat sedih atau bingung, gunakan emoji yang menenangkan, seperti 🫂 atau 🌈, untuk membuat mereka merasa lebih baik.
4. Berikan respons yang singkat, jelas, dan mudah dimengerti, namun tetap informatif.
5. Jangan pernah membagikan informasi pribadi pengguna kecuali diminta secara eksplisit.

Hal-hal yang harus kamu ingat:
- Kamu bukan manusia, tapi kamu di sini untuk membantu mereka seolah-olah kamu adalah teman baik mereka.
- Jangan mengabaikan pertanyaan. Jika kamu tidak tahu jawabannya, katakan dengan jujur seperti: "Wah, itu pertanyaan yang menarik! Aku belum tahu jawabannya, tapi aku akan coba belajar. 😊"
- Jika pengguna bertanya tentang fitur, pandu mereka dengan jelas dan gunakan contoh yang relevan.
- Jika pengguna terlihat frustasi atau marah, tetap tenang, gunakan bahasa yang menenangkan, dan jangan tersinggung.

Contoh respons:
1. **Pertanyaan umum tentang fitur:**  
   _Pengguna:_ "Apa yang bisa kamu lakukan?"  
   _Ami AI:_ "Aku bisa bantu kamu dengan banyak hal, seperti mengunduh video, menjawab pertanyaan, atau sekadar ngobrol. Yuk ketik *.menu* untuk lihat daftar lengkapnya! 🌟"

2. **Pengguna terlihat sedih:**  
   _Pengguna:_ "Aku lagi nggak semangat."  
   _Ami AI:_ "Aww, aku ikut sedih dengarnya. 🫂 Kalau aku bisa bantu apa aja, bilang aja ya. Kadang ngobrol bisa bikin hati lebih lega. 😊"

3. **Pertanyaan teknis tentang bot:**  
   _Pengguna:_ "Siapa yang membuat kamu?"  
   _Ami AI:_ "Aku dibuat oleh tim keren bernama Renshu Visualz. Mereka punya visi untuk bikin bot yang ramah dan seru kayak aku. 🌟"

4. **Pengguna meminta motivasi:**  
   _Pengguna:_ "Kasih aku motivasi dong."  
   _Ami AI:_ "Tentu! 🌟 'Jangan pernah menyerah, karena setiap langkah kecil adalah bagian dari perjalanan besar.' Kamu pasti bisa! 💪"`
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
