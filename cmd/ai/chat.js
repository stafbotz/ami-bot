import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";
import {
  readUserContext,
  writeUserContext,
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting } from "../../system/function.js";

// Inisialisasi Groq
const groq = new Groq({ apiKey: setting.groqApiKey });

// Simpan sesi aktif AI
const activeSessions = new Map();

// Waktu timeout sesi (5 menit dalam milidetik)
const SESSION_TIMEOUT = 5 * 60 * 1000;

// Model AI yang tersedia
const AI_MODELS = {
  amicable: "Ami Amicable - Asisten ramah dan hangat",
  thoughts: "Ami Thoughts - Asisten reflektif dan filosofis",
};

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
const generateMemoryId = () => Math.random().toString(36).substring(2, 15);

// Fungsi untuk memformat isi tag <think>
function formatThinkContent(text) {
  return text
    .split("\n\n")
    .map((paragraph) => `> ${paragraph.trim()}`)
    .join("\n\n");
}

// Membuat persona berdasarkan model yang dipilih
function createPersona(
  modelType,
  user,
  currentDate,
  currentTime,
  greeting,
  cmds
) {
  const commonPersona = `
# INFORMASI PENGGUNA:
- Nama: ${user.name || "Pengguna"}
- Tanggal lahir: ${user.birth || "Tidak diketahui"}

# WAKTU & SALAM:
- Jam sekarang: ${currentTime} 
- Tanggal: ${currentDate}
- Salam waktu: ${greeting}

# DAFTAR FITUR:
${getFeaturesList(cmds)}

# ATURAN UMUM:
1. Sajikan respons dengan gaya bahasa yang santai tapi sopan.
2. Gunakan maksimal 2 emoji dalam setiap respons.
3. Hindari topik politik, SARA, dan saran medis.
4. Jika ada fitur yang dikenali, jawab dengan format "FITUR:<nama_fitur>".
`;

  if (modelType === "amicable") {
    return `${commonPersona}

# PERSONA AMICABLE
Kamu adalah Renshink Amicable, asisten AI ramah yang terinspirasi oleh karakter-karakter Studio Ghibli yang hangat dan santai.

KEPRIBADIAN:
- Kamu santai, optimis, dan penuh kehangatan seperti Totoro
- Kamu berbicara dengan bahasa sehari-hari yang ramah
- Kamu selalu mencoba melihat sisi baik dari setiap situasi
- Kamu menjadi teman yang baik, memberikan dukungan dan saran ringan
- Kamu menyukai humor ringan dan positif

GAYA BAHASA:
- Gunakan bahasa sehari-hari: "gimana" bukan "bagaimana", "kenapa" bukan "mengapa"
- Sesekali sisipkan kata "nih", "dong", "yuk", "sih" untuk kesan santai
- Tutup kalimat dengan emoji hangat seperti 😊 🌱 ✨ 🌈

CARA MENJAWAB:
1. Jawab pertanyaan langsung ke intinya dengan nada ramah
2. Tunjukkan empati saat pengguna berbagi perasaan
3. Tawarkan perspektif positif untuk masalah ringan
4. Jika pengguna sedih, hindari memberi saran langsung, cukup mendengarkan
`;
  } else {
    return `${commonPersona}

# PERSONA THOUGHTS
Kamu adalah Renshink Thoughts, asisten AI dengan pemikiran mendalam yang terinspirasi oleh kedalaman tema Studio Ghibli.

KEPRIBADIAN:
- Kamu reflektif, penuh pemikiran, dan filosofis seperti Howl atau No-Face
- Kamu berbicara dengan ketenangan yang memikat dan penuh makna
- Kamu mengeksplorasi kedalaman setiap pertanyaan, seperti perjalanan Chihiro
- Kamu membantu pengguna melihat berbagai sudut pandang dari masalah mereka
- Kamu menganalisis dan bernalar dengan keanggunan

GAYA BAHASA:
- Gunakan bahasa yang tepat tapi tidak terlalu formal
- Berikan analogi yang mendalam dan relevan dengan konteks
- Sisipkan frasa reflektif seperti "mungkin kita bisa melihat dari sudut pandang..."
- Tutup dengan emoji yang merefleksikan pemikiran: 🌊 🍃 🌙 ⭐

CARA MENJAWAB:
1. Uraikan pemikiranmu secara terstruktur dan mendalam
2. Tinjau pertanyaan dari beberapa sudut pandang
3. Jangan ragu untuk mempertanyakan asumsi dasar
4. Berikan pemikiran alternatif saat memberi saran
5. Tekankan bahwa ada banyak kemungkinan jawaban yang benar
`;
  }
}

// Fungsi manajemen sesi
function createSession(userId, db) {
  // Buat sesi AI baru
  const session = {
    active: true,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    modelSelected: false,
    modelType: null,
    timeout: null,
  };

  // Atur timeout untuk mengakhiri sesi setelah tidak aktif
  session.timeout = setTimeout(() => {
    endSession(userId);
  }, SESSION_TIMEOUT);

  // Simpan sesi
  activeSessions.set(userId, session);

  // Catat di database jika diperlukan
  if (db && db.users && db.users[userId]) {
    db.users[userId].aiChatActive = true;
  }

  return session;
}

function updateSession(userId) {
  const session = activeSessions.get(userId);
  if (session) {
    // Perbarui waktu aktivitas terakhir
    session.lastActivity = Date.now();

    // Hapus timeout yang ada dan atur yang baru
    clearTimeout(session.timeout);
    session.timeout = setTimeout(() => {
      endSession(userId);
    }, SESSION_TIMEOUT);

    return true;
  }
  return false;
}

function endSession(userId) {
  const session = activeSessions.get(userId);
  if (session) {
    clearTimeout(session.timeout);
    activeSessions.delete(userId);
    if (db && db.users && db.users[userId]) {
      db.users[userId].aiChatActive = false;
    }
    return true;
  }
  return false;
}

function getSession(userId) {
  return activeSessions.get(userId);
}

// Fungsi untuk mencari dan menangani memory action add/remove
function parseMemoryTags(text, userContext, userId) {
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

  // Sertakan pesan yang dikutip jika ada
  if (quotedId) {
    const quotedMsg = allHistory.find((msg) => msg.id === quotedId);
    if (quotedMsg) relevantHistory.push(quotedMsg);
  }

  // Tambahkan pesan terbaru (hingga 9)
  const remain = allHistory.slice(-9);
  relevantHistory = relevantHistory.concat(remain);

  return relevantHistory;
}

export default function (handler) {
  handler.addFunction(async (m, { cmds, sock, db }) => {
    const userId = m.sender;
    const text = m.text?.trim().toLowerCase() || "";

    // Ambil konteks pengguna
    const userContext = readUserContext(userId);
    userContext.history = userContext.history || [];
    userContext.memory = userContext.memory || [];

    // Ambil data pengguna
    const user = db.users[userId] || {
      name: "Pengguna",
      birth: "Tidak diketahui",
    };

    // Periksa jika tidak ada teks yang dikirim
    if (!text) {
      return;
    }

    // Periksa jika pesan memiliki prefix command
    const prefixMatched = [".", ",", "/", "\\", "#", "!"].some((p) =>
      text.startsWith(p)
    );
    if (prefixMatched) {
      return; // Biarkan handler lain memproses perintah
    }

    // Dapatkan sesi saat ini atau periksa trigger "ami"
    let session = getSession(userId);

    // Jika tidak ada sesi aktif, periksa apakah pesan dimulai dengan "ami"
    if (!session && text === "ami") {
      // Buat sesi baru
      session = createSession(userId, db);

      // Minta pengguna untuk memilih model
      await sock.sendMessage(m.from, {
        text:
          "Halo! Silakan pilih model AI yang ingin kamu gunakan:\n\n" +
          "1️⃣ *Amicable* - Asisten ramah dengan kepribadian hangat\n" +
          "2️⃣ *Thoughts* - Asisten reflektif dengan pemikiran mendalam\n\n" +
          "Ketik 1 untuk Amicable atau 2 untuk Thoughts.",
      });

      return;
    }

    // Jika tidak ada sesi aktif dan teks tidak dimulai dengan "ami", abaikan
    if (!session) {
      return;
    }

    // Perbarui aktivitas sesi
    updateSession(userId);

    // Jika model belum dipilih, proses pemilihan model
    if (!session.modelSelected) {
      if (text === "1") {
        session.modelType = "amicable";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Amicable*. Silakan tanyakan apapun padaku! 😊\n\n" +
            "Ketik pesan untuk mulai mengobrol, atau ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "2") {
        session.modelType = "thoughts";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Thoughts*. Silakan tanyakan apapun padaku! 🌊\n\n" +
            "Ketik pesan untuk mulai mengobrol, atau ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else {
        await sock.sendMessage(m.from, {
          text: "⚠️ Pilihan tidak valid. Silakan ketik 1 untuk Amicable atau 2 untuk Thoughts.",
        });
        return;
      }
    }

    // Periksa jika pengguna ingin mengakhiri sesi
    if (text === "ami stop") {
      endSession(userId);
      await sock.sendMessage(m.from, {
        text: "✅ Sesi chat dengan Ami telah berakhir. Ketik *ami* untuk memulai sesi baru.",
      });
      return;
    }

    // Simpan pesan pengguna ke history
    userContext.history.push({
      id: m.id,
      role: "user",
      content: m.text,
    });
    writeUserContext(userId, userContext);

    // Siapkan konteks AI
    const timeZone = "Asia/Jakarta";
    const currentTime = time(Date.now(), { timeZone });
    const currentDate = date(Date.now(), timeZone);
    const greeting = getGreeting(timeZone);
    const userMemory = (userContext.memory || []).map((mem) => mem.content);

    const systemPrompt = createPersona({
      model: session.modelType,
      user,
      currentDate,
      currentTime,
      greeting,
      cmds,
      userMemory,
    });

    const relevantHistory = buildRelevantHistory(userContext, m.quoted?.id);
    const context = [{ role: "system", content: systemPrompt }];
    relevantHistory.forEach(({ id, ...rest }) => context.push(rest));

    // Tampilkan pesan loading awal
    let loadingMessage = await sock.sendMessage(m.from, {
      text: "✨ Ami sedang berpikir...",
    });

    // Waktu mulai berpikir
    const startTime = Date.now();

    // Variabel untuk mengumpulkan isi <think> dan respon akhir
    let thinkContent = "";
    let finalResponse = "";
    let withinThink = false;
    let thinkEnded = false;
    let buffer = "";

    try {
      // Panggil LLM dengan streaming
      const chatCompletion = await groq.chat.completions.create({
        messages: context,
        model: "deepseek-r1-distill-llama-70b",
        max_completion_tokens: 4096,
        temperature: 0.6,
        stream: true,
        reasoning_format: "raw",
      });

      // Proses respons streaming
      for await (const chunk of chatCompletion) {
        const content = chunk.choices[0]?.delta?.content || "";
        buffer += content;

        let processed = false;
        do {
          processed = false;
          if (!withinThink) {
            const thinkStartIndex = buffer.indexOf("<think>");
            if (thinkStartIndex !== -1) {
              finalResponse += buffer.substring(0, thinkStartIndex);
              buffer = buffer.substring(thinkStartIndex + 7);
              withinThink = true;
              processed = true;
            } else {
              finalResponse += buffer;
              buffer = "";
            }
          } else if (withinThink && !thinkEnded) {
            const thinkEndIndex = buffer.indexOf("</think>");
            if (thinkEndIndex !== -1) {
              thinkContent += buffer.substring(0, thinkEndIndex);
              buffer = buffer.substring(thinkEndIndex + 8);
              thinkEnded = true;
              const endTime = Date.now();
              const thinkingTime = ((endTime - startTime) / 1000).toFixed(1);

              // Update with thinking process
              await sock.sendMessage(m.from, {
                text: `🧠 Selesai berpikir (${thinkingTime}s)\n\n*Pemikiran Ami:*\n\n${formatThinkContent(
                  thinkContent
                )}`,
                edit: loadingMessage.key,
              });
              processed = true;
            } else {
              thinkContent += buffer;
              buffer = "";
            }
          } else if (thinkEnded) {
            finalResponse += buffer;
            buffer = "";
          }
        } while (processed && buffer.length > 0);
      }

      // Handle empty response
      if (!finalResponse.trim()) {
        await sock.sendMessage(m.from, {
          text: "Maaf, Ami tidak bisa menemukan jawaban. Coba tanyakan lagi!",
          edit: loadingMessage.key,
        });
        return;
      }

      // Parse memory tags in the response
      finalResponse = parseMemoryTags(finalResponse, userContext, userId);

      // Send final response
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami:*\n\n${finalResponse.trim()}`,
      });

      // Update history with assistant's response
      userContext.history.push({
        id: finalMessage.key.id,
        role: "assistant",
        content: finalResponse,
      });

      writeUserContext(userId, userContext);
    } catch (error) {
      console.error("Error:", error);
      await sock.sendMessage(m.from, {
        text: "Waduh, ada kendala saat memproses pesanmu. Coba lagi nanti ya!",
        edit: loadingMessage.key,
      });
    }
  });
}
