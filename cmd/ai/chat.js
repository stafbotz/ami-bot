import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";
import {
  readUserContext,
  writeUserContext,
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting, translate } from "../../system/function.js";

// Inisialisasi Groq
const groq = new Groq({ apiKey: setting.groqApiKey });

// Daftar fitur
const getFeaturesList = (cmds) => {
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
    lainnya: "📌",
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
    features += commands.map((cmd) => ` │๑ ${cmd}`).join("\n");
    features += "\n\n";
  }
  return features.trim();
};

// Fungsi menambahkan entri memori baru ke userContext dengan ID tertentu
function addMemory(userContext, memoryId, userId, content) {
  userContext.memory = userContext.memory || [];
  // Jika sudah ada ID yang sama, hapus dulu (agar tidak duplikat)
  userContext.memory = userContext.memory.filter((m) => m.id !== memoryId);
  userContext.memory.push({ id: memoryId, content });
  writeUserContext(userId, userContext);
}

// Fungsi menghapus entri memori dengan ID tertentu
function removeMemory(userContext, memoryId, userId) {
  userContext.memory = userContext.memory || [];
  userContext.memory = userContext.memory.filter((m) => m.id !== memoryId);
  writeUserContext(userId, userContext);
}

// Fungsi untuk menghasilkan ID unik memori
function generateMemoryId() {
  return Math.random().toString(36).substring(2, 15); // ID unik untuk memori
}

// Fungsi untuk memformat isi tag <think>
// Setiap paragraf yang dipisahkan oleh "\n\n" akan diprefix dengan "> "
function formatThinkContent(text) {
  return text
    .split("\n\n")
    .map((paragraph) => `> ${paragraph.trim()}`)
    .join("\n\n");
}

export default (handler) => {
  handler.reg({
    cmd: ["ami", "chat"],
    noPrefix: true,
    tags: "ai",
    desc: "Chat with Ami AI",
    run: async (m, { cmds, sock, db }) => {
      const userId = m.sender;
      const userContext = readUserContext(userId);
      userContext.history = userContext.history || [];
      userContext.memory = userContext.memory || [];

      const user = db.users[userId] || {
        name: "Pengguna",
        birth: "Tidak diketahui",
      };

      if (!m.text) {
        return m.reply(
          "Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke Ami AI."
        );
      }

      // --- [1] Simpan pesan user ke history
      userContext.history.push({
        id: m.id,
        role: "user",
        content: m.text,
      });

      // Batasi total riwayat 50
      if (userContext.history.length > 50) {
        userContext.history = userContext.history.slice(-50);
      }
      writeUserContext(userId, userContext);

      // --- [2] Siapkan context AI
      const timeZone = "Asia/Jakarta";
      const currentTime = time(Date.now(), { timeZone });
      const currentDate = date(Date.now(), timeZone);
      const greeting = getGreeting(timeZone);

      const systemPrompt =
        `Kamu adalah Ami, bot WhatsApp yang ramah, kalem, ceria, dan asik. Kamu bisa ngobrol, kasih saran, bantuin kerjaan, atau bahkan jadi teman curhat yang baik. Jangan pernah bikin orang merasa canggung ya!

      # MEMORI SAAT INI:
      ${userContext.memory
        .map(
          (mem) =>
            `<memory action="read" id="${mem.id}" userId="${userId}">${mem.content}</memory>`
        )
        .join("\n")}
      
      # RULES:
      1. **Jika ada informasi penting yang harus diingat** atau **user minta melupakan sesuatu**, kamu harus beri jawaban yang sesuai dan gunakan blok memory seperti ini di akhir jawaban:
         - **Untuk mengingat**: <memory action="add" id="${generateMemoryId()}" userId="${userId}">ISI INFORMASI</memory>
         - **Untuk melupakan**: <memory action="remove" id="ID_YANG_INGIN_DIHAPUS" userId="${userId}"></memory>
         
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
      - "Aku pake model AmiThink 1.2, yang dilatih oleh Renshu Think In. untuk Ami AI. Model ini memiliki 70 miliar parameter dan dibuat khusus untuk berpikir mendalam tentang berbagai topik serta disempurnakan agar bisa jadi temen chat yang asik, ceria, dan kalem. Aku juga ditenagai mesin pencari Google jadi bisa bantu kamu cari informasi di internet."
      
      # INFORMASI TAMBAHAN:
      - Pemilikku adalah *Renshu Think In.*, tim kreatif yang membuat aku. Kalau kamu mau tahu lebih lanjut, tanya aja!
      - Kalau ada yang nanya nomor WhatsApp aku, kasih tahu mereka pake fitur *owner* ya, jawab dengan "FITUR:*.owner*".
      `.trim();

      const relevantHistory = buildRelevantHistory(userContext, m.quoted?.id);
      const context = [{ role: "system", content: systemPrompt }];
      relevantHistory.map(({ id, ...rest }) => context.push(rest));

      // Tampilkan pesan loading awal
      let loadingMessage = await sock.sendMessage(m.from, {
        text: "🤖 Ami sedang berpikir",
      });

      // Waktu mulai berpikir
      const startTime = Date.now();

      // Variabel untuk mengumpulkan isi <think> dan respon akhir
      let currentResponse = "";
      let thinkContent = "";
      let finalResponse = "";
      let withinThink = false;
      let thinkEnded = false;

      const CHUNK_SIZE = 20; // Adjust this value (number of characters per chunk)
      const EDIT_DELAY = 300; // Adjust this value (milliseconds)
      let lastEditTime = 0;

      // Terjemahkan isi pemikiran Ami (thinkContent) ke bahasa Indonesia
      const translatedThink = await translate(
        formatThinkContent(thinkContent.trim()),
        "id"
      );

      try {
        // Panggil LLM dengan streaming
        const chatCompletion = await groq.chat.completions.create({
          messages: context,
          model: "deepseek-r1-distill-llama-70b",
          temperature: 0.6,
          stream: true,
          reasoning_format: "raw",
        });

        for await (const chunk of chatCompletion) {
          finalResponse += chunk.choices[0]?.delta?.content || "";

          if (!withinThink) {
            const thinkStartIndex = finalResponse.indexOf("&lt;think&gt;");
            if (thinkStartIndex !== -1) {
              if (thinkStartIndex > 0) {
                currentResponse += finalResponse.substring(0, thinkStartIndex);
                finalResponse = finalResponse.substring(thinkStartIndex);
              }
              finalResponse = finalResponse.replace("&lt;think&gt;", "");
              withinThink = true;
            } else {
              currentResponse += finalResponse;
              finalResponse = "";
            }
          } else if (withinThink && !thinkEnded) {
            const thinkEndIndex = finalResponse.indexOf("&lt;/think&gt;");
            if (thinkEndIndex !== -1) {
              thinkContent = finalResponse.substring(0, thinkEndIndex);
              finalResponse = finalResponse.substring(thinkEndIndex + 8);
              thinkEnded = true;
            } else {
              thinkContent += finalResponse;
              finalResponse = "";
            }
          }

          // Chunking logic for currentResponse
          if (currentResponse.length > 0) {
            const now = Date.now();
            if (currentResponse.length >= CHUNK_SIZE || thinkEnded) {
              if (now - lastEditTime >= EDIT_DELAY) {
                await sock.sendMessage(m.from, {
                  text: currentResponse.trim(),
                  edit: loadingMessage.key,
                });

                currentResponse = "";
                lastEditTime = now;
              }
            }
          }
        }

        if (thinkEnded) {
          await sock.sendMessage(m.from, {
            text: `🧠 *Pemikiran Ami:* \n\n${formatThinkContent(thinkContent)}`,
            edit: loadingMessage.key,
          });
          thinkEnded = false;
          thinkContent = "";
        }

        // Final update after the stream ends
        if (finalResponse.length > 0) {
          let responseMessage = await sock.sendMessage(m.from, {
            text: `*Jawaban Ami:*\n\n${parseMemoryTags(
              finalResponse.trim(),
              userContext
            )}`,
            edit: loadingMessage.key,
          });
        }

        // Simpan jawaban AI ke history
        userContext.history.push({
          id: responseMessage.key.id,
          role: "assistant",
          content: finalResponse,
        });
        if (userContext.history.length > 50) {
          userContext.history = userContext.history.slice(-50);
        }
        writeUserContext(userId, userContext);
      } catch (error) {
        console.error("Error:", error);
        await sock.sendMessage(m.from, {
          text: "Waduh, ada kendala saat memproses pesanmu. Coba lagi nanti ya!",
          edit: loadingMessage.key,
        });
      }
    },
  });
};

// Fungsi untuk mencari dan menangani memory action add/remove
function parseMemoryTags(text, userContext) {
  const memoryRegex =
    /<memory\s+action=["'](add|remove)["']\s+id=["']([^"']+)["']\s+userId=["']([^"']+)["']>(.*?)<\/memory>/gs;
  let match;
  while ((match = memoryRegex.exec(text)) !== null) {
    const [fullTag, action, memId, userId, content] = match;
    if (action === "add") {
      addMemory(userContext, memId, userId, content.trim());
    } else if (action === "remove") {
      removeMemory(userContext, memId, userId);
    }
  }
  return text.replace(memoryRegex, "").trim();
}

// Fungsi untuk membangun riwayat konteks relevan
function buildRelevantHistory(userContext, quotedId) {
  const allHistory = userContext.history || [];
  let relevantHistory = [];
  if (quotedId) {
    const quotedMsg = allHistory.find((msg) => msg.id === quotedId);
    if (quotedMsg) relevantHistory.push(quotedMsg);
  }
  const remain = allHistory.slice(-9);
  relevantHistory = relevantHistory.concat(remain);
  return relevantHistory;
}
