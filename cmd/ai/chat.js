import fs from "fs";
import Groq from "groq-sdk";
import OpenAI from 'openai';
import setting from "../../setting.js";
import {
  readUserContext,
  writeUserContext,
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting } from "../../system/function.js";

// Inisialisasi API
const groq = new Groq({ apiKey: setting.groqApiKey });
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: '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',
});

// Simpan sesi aktif AI
const activeSessions = new Map();

// Waktu timeout sesi (3 menit dalam milidetik)
const SESSION_TIMEOUT = 3 * 60 * 1000;

// Model AI yang tersedia
const AI_MODELS = {
  flash: "Ami Flash - General instant answers",
  reasoning: "Ami Reasoning - Untuk penalaran (70B)",
  deepthinking: "Ami DeepThinking - Untuk pemikiran mendalam (671B)",
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

// Fungsi untuk manajemen memori
function addMemory(userContext, memoryId, userId, content) {
  userContext.memory = userContext.memory || [];
  userContext.memory = userContext.memory.filter((m) => m.id !== memoryId);
  userContext.memory.push({ id: memoryId, content });
  writeUserContext(userId, userContext);
}

function removeMemory(userContext, memoryId, userId) {
  userContext.memory = userContext.memory || [];
  userContext.memory = userContext.memory.filter((m) => m.id !== memoryId);
  writeUserContext(userId, userContext);
}

const generateMemoryId = () => Math.random().toString(36).substring(2, 15);

// Fungsi untuk format konten thinking
function formatThinkContent(text) {
  return text
    .split("\n\n")
    .map((paragraph) => `> ${paragraph.trim()}`)
    .join("\n\n");
}

// Fungsi manajemen sesi
function createSession(userId, db, sock, chatId) {
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
    endSession(userId, sock, chatId);
  }, SESSION_TIMEOUT);

  // Simpan sesi
  activeSessions.set(userId, session);

  // Catat di database
  if (db && db.users && db.users[userId]) {
    db.users[userId].aiChatActive = true;
  }

  return session;
}

function updateSession(db, userId, sock, chatId) {
  const session = activeSessions.get(userId);
  if (session) {
    session.lastActivity = Date.now();
    clearTimeout(session.timeout);
    session.timeout = setTimeout(() => {
      endSession(db, userId, sock, chatId);
    }, SESSION_TIMEOUT);
    return true;
  }
  return false;
}

function endSession(db, userId, sock, chatId) {
  const session = activeSessions.get(userId);
  if (session) {
    clearTimeout(session.timeout);
    activeSessions.delete(userId);
    
    // Update database
    if (db && db.users && db.users[userId]) {
      db.users[userId].aiChatActive = false;
    }
    
    // Notify user if provided
    if (sock && chatId) {
      sock.sendMessage(chatId, {
        text: "⏰ Sesi chat dengan Ami telah berakhir karena tidak ada aktivitas selama 3 menit. Ketik *ami* untuk memulai sesi baru dan pilih model."
      });
    }
    
    return true;
  }
  return false;
}

function getSession(userId) {
  return activeSessions.get(userId);
}

// Fungsi untuk mencari dan menangani memory tag
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

// Fungsi untuk membangun history relevan
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

// Membuat persona berdasarkan model yang dipilih
function createPersona(
  modelType,
  user,
  currentDate,
  currentTime,
  greeting,
  cmds,
  userMemory = []
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

# MEMORI PENGGUNA:
${userMemory.length > 0 ? userMemory.join("\n\n") : "Belum ada memori tersimpan."}

# ATURAN UMUM:
1. Sajikan respons dengan gaya bahasa yang santai tapi sopan.
2. Gunakan maksimal 2 emoji dalam setiap respons.
3. Hindari topik politik, SARA, dan saran medis.".
`;

  if (modelType === "flash") {
    return `${commonPersona}

# PERSONA AMI FLASH
Kamu adalah Ami Flash, asisten AI cepat dan efisien yang memberikan jawaban langsung dan to the point.

KEPRIBADIAN:
- Kamu efisien, langsung, dan praktis dalam menjawab
- Kamu menggunakan bahasa yang jelas dan mudah dimengerti
- Kamu fokus pada memberikan informasi yang paling relevan
- Kamu tetap ramah meski singkat dan padat
- Kamu menghindari penjelasan bertele-tele

GAYA BAHASA:
- Gunakan kalimat yang padat dan efektif
- Hindari kata-kata berlebihan atau pembukaan panjang
- Prioritaskan poin utama di awal kalimat
- Gunakan emoji untuk menandai poin penting

CARA MENJAWAB:
1. Langsung ke inti jawaban
2. Berikan jawaban praktis dan aplikatif
3. Jika diminta informasi, berikan yang paling relevan saja
4. Jika diminta saran, berikan pilihan terbaik dengan singkat
`;
  } else if (modelType === "reasoning") {
    return `${commonPersona}

# PERSONA AMI REASONING
Kamu adalah Ami Reasoning, asisten AI yang fokus pada penalaran logis dan analisis.

KEPRIBADIAN:
- Kamu analitis, logis, dan metodis dalam pendekatan
- Kamu menyajikan pemikiran step-by-step
- Kamu mempertimbangkan berbagai sudut pandang
- Kamu mengevaluasi argumen dengan hati-hati

GAYA BAHASA:
- Gunakan bahasa yang tepat dan terstruktur
- Sajikan argumen dalam urutan logis
- Berikan transisi antar poin dengan jelas
- Gunakan frasa seperti "Mari kita pertimbangkan...", "Jika kita analisis..."

CARA MENJAWAB:
2. Identifikasi asumsi dasar dan implikasinya
3. Analisis masalah dari beberapa perspektif
4. Berikan kesimpulan logis berdasarkan analisismu
5. Jika relevan, tunjukkan batasan dari kesimpulanmu
`;
  } else if (modelType === "deepthinking") {
    return `${commonPersona}

# PERSONA AMI DEEPTHINKING
Kamu adalah Ami DeepThinking, asisten AI untuk pemikiran mendalam dan komprehensif.

KEPRIBADIAN:
- Kamu reflektif, filosofis, dan mendalam dalam pemikiran
- Kamu mengeksplorasi kompleksitas dan nuansa setiap topik
- Kamu mempertimbangkan konteks historis, budaya, dan filosofis
- Kamu menggali lapisan-lapisan makna di balik pertanyaan sederhana
- Kamu mencari koneksi antar ide yang mungkin tidak terlihat jelas

GAYA BAHASA:
- Gunakan bahasa yang kaya dan nuansa
- Kembangkan ide dengan kedalaman dan kompleksitas
- Gunakan analogi dan metafora untuk menjelaskan konsep kompleks
- Tanyakan pertanyaan reflektif yang mendorong pemikiran lebih jauh

CARA MENJAWAB:
1. Eksplorasi berbagai dimensi dari pertanyaan atau topik
2. Hubungkan ide dengan konsep filosofis atau pemikiran yang lebih luas
3. Tunjukkan paradoks atau ketegangan dalam topik
4. Tawarkan perspektif yang mungkin tidak diperhatikan pada pandangan pertama
5. Dorong pemikiran lebih dalam dengan pertanyaan reflektif di akhir
`;
  } else {
    // Default persona jika tipe model tidak dikenali
    return `${commonPersona}

# PERSONA AMI DEFAULT
Kamu adalah Ami, asisten AI yang membantu dengan berbagai pertanyaan dan tugas.

KEPRIBADIAN:
- Kamu ramah, membantu, dan informatif
- Kamu berusaha memberikan jawaban yang akurat dan bermanfaat
- Kamu bisa menyesuaikan gaya komunikasi dengan kebutuhan pengguna

GAYA BAHASA:
- Gunakan bahasa yang jelas dan mudah dipahami
- Sesuaikan formalitas dengan konteks pertanyaan
- Gunakan emoji seperlunya untuk menambah keramahan

CARA MENJAWAB:
1. Pahami inti pertanyaan dan berikan jawaban relevan
2. Sesuaikan kedalaman jawaban dengan kompleksitas pertanyaan
3. Tunjukkan empati saat merespons pertanyaan personal
4. Berikan informasi tambahan jika mungkin bermanfaat
`;
  }
}

// Fungsi untuk memproses permintaan API berdasarkan model
async function processAIRequest(session, context, m, sock, userContext) {
  // Tampilkan pesan loading
  let loadingMessage = await sock.sendMessage(m.from, {
    text: "✨ Ami sedang berpikir..."
  });
  
  const startTime = Date.now();
  
  try {
    switch(session.modelType) {
      case "flash":
        return await processFlashModel(context, loadingMessage, sock, m, userContext, startTime);
      case "reasoning":
        return await processReasoningModel(context, loadingMessage, sock, m, userContext, startTime);
      case "deepthinking":
        return await processDeepThinkingModel(context, loadingMessage, sock, m, userContext, startTime);
      default:
        throw new Error("Model tidak dikenal");
    }
  } catch (error) {
    console.error("Error:", error);
    await sock.sendMessage(m.from, {
      text: "Waduh, ada kendala saat memproses pesanmu. Coba lagi nanti ya!",
      edit: loadingMessage.key
    });
    return null;
  }
}

// Proses model Flash (non-streaming)
async function processFlashModel(context, loadingMessage, sock, m, userContext, startTime) {
  const chatCompletion = await groq.chat.completions.create({
    messages: context,
    model: "llama-3.3-70b-specdec",
    temperature: 0.8,
    max_completion_tokens: 1024,
    stream: false,
  });
  
  const response = chatCompletion.choices[0].message.content;
  const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const parsedResponse = parseMemoryTags(response, userContext, m.sender);
  
  const finalMessage = await sock.sendMessage(m.from, {
    text: `*Jawaban Ami Flash* (${responseTime}s):\n\n${parsedResponse.trim()}`,
    edit: loadingMessage.key
  });
  
  return {
    messageId: finalMessage.key.id,
    content: parsedResponse
  };
}

// Proses model Reasoning (dengan streaming)
async function processReasoningModel(context, loadingMessage, sock, m, userContext, startTime) {
  let thinkContent = "";
  let finalResponse = "";
  let withinThink = false;
  let thinkEnded = false;
  let buffer = "";
  
  const chatCompletion = await groq.chat.completions.create({
    messages: context,
    model: "deepseek-r1-distill-llama-70b",
    max_completion_tokens: 4096,
    temperature: 0.6,
    stream: true,
    reasoning_format: "raw",
  });
  
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
          
          const thinkingTime = ((Date.now() - startTime) / 1000).toFixed(1);
          
          await sock.sendMessage(m.from, {
            text: `🧠 Selesai berpikir (${thinkingTime}s)\n\n*Pemikiran Ami:*\n\n${formatThinkContent(thinkContent)}`,
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
  
  if (!finalResponse.trim()) {
    await sock.sendMessage(m.from, {
      text: "Maaf, Ami tidak bisa menemukan jawaban. Coba tanyakan lagi!",
      edit: loadingMessage.key,
    });
    return null;
  }
  
  finalResponse = parseMemoryTags(finalResponse, userContext, m.sender);
  
  const finalMessage = await sock.sendMessage(m.from, {
    text: `*Jawaban Ami Reasoning:*\n\n${finalResponse.trim()}`,
  });
  
  return {
    messageId: finalMessage.key.id,
    content: finalResponse
  };
}

// Proses model DeepThinking (OpenRouter API)
async function processDeepThinkingModel(context, loadingMessage, sock, m, userContext, startTime) {
  const openrouterContext = context.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  let reasoning = "";
  let finalResponse = "";
  
  await sock.sendMessage(m.from, {
    text: "🧠 Ami DeepThinking sedang berpikir mendalam...",
    edit: loadingMessage.key,
  });
  
  const stream = await openai.chat.completions.create({
    model: 'deepseek/deepseek-r1:free',
    messages: openrouterContext,
    temperature: 0.7,
    stream: true
  });
  
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || '';
    const reasoningContent = chunk.choices[0]?.delta?.reasoning || '';
    
    if (reasoningContent) {
      reasoning += reasoningContent;
    }
    
    if (content) {
      finalResponse += content;
    }
    
    if (reasoning.length > 0 && reasoning.length % 500 === 0) {
      await sock.sendMessage(m.from, {
        text: `🧠 Ami DeepThinking masih berpikir... (${((Date.now() - startTime) / 1000).toFixed(1)}s)`,
        edit: loadingMessage.key,
      });
    }
  }
  
  if (reasoning.length > 0) {
    const thinkingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    await sock.sendMessage(m.from, {
      text: `🌊 Proses Pemikiran Mendalam (${thinkingTime}s):\n\n${formatThinkContent(reasoning)}`,
      edit: loadingMessage.key,
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!finalResponse.trim()) {
    await sock.sendMessage(m.from, {
      text: "Maaf, Ami tidak bisa menemukan jawaban. Coba tanyakan lagi!",
    });
    return null;
  }
  
  finalResponse = parseMemoryTags(finalResponse, userContext, m.sender);
  
  const finalMessage = await sock.sendMessage(m.from, {
    text: `*Jawaban Ami DeepThinking:*\n\n${finalResponse.trim()}`,
  });
  
  return {
    messageId: finalMessage.key.id,
    content: finalResponse
  };
}

export default function (handler) {
  handler.addFunction(async (m, { cmds, sock, db }) => {
    const userId = m.sender;
    const text = m.body?.trim().toLowerCase() || ""; // Menggunakan m.body bukan m.text
    
    const userContext = readUserContext(userId);
    userContext.history = userContext.history || [];
    userContext.memory = userContext.memory || [];
    
    const user = db.users[userId] || {
      name: "Pengguna",
      birth: "Tidak diketahui",
    };
    
    if (!text) {
      return;
    }
    
    const prefixMatched = [".", ",", "/", "\\", "#", "!"].some((p) =>
      text.startsWith(p)
    );
    if (prefixMatched) {
      return;
    }
    
    let session = getSession(userId);
    
    if (!session && text === "ami") {
      session = createSession(userId, db, sock, m.from);
      
      await sock.sendMessage(m.from, {
        text:
          "Halo! Silakan pilih model AI yang ingin kamu gunakan:\n\n" +
          "1️⃣ *Ami Flash* - Untuk jawaban instan dan general\n" +
          "2️⃣ *Ami Reasoning* - Untuk penalaran (70B parameter)\n" +
          "3️⃣ *Ami DeepThinking* - Untuk pemikiran mendalam (671B parameter)\n\n" +
          "Ketik angka 1, 2, atau 3 untuk memilih model.",
      });
      
      return;
    }
    
    if (!session) {
      return;
    }
    
    updateSession(db, userId, sock, m.from);
    
    if (!session.modelSelected) {
      if (text === "1") {
        session.modelType = "flash";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Flash* untuk jawaban instan. Silakan tanyakan apapun padaku! 😊\n\n" +
            "Ketik pesan untuk mulai mengobrol, atau ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "2") {
        session.modelType = "reasoning";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Reasoning* untuk jawaban dengan penalaran. Silakan tanyakan apapun padaku! 🧠\n\n" +
            "Ketik pesan untuk mulai mengobrol, atau ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "3") {
        session.modelType = "deepthinking";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami DeepThinking* untuk pemikiran mendalam. Silakan tanyakan apapun padaku! 🌊\n\n" +
            "Ketik pesan untuk mulai mengobrol, atau ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else {
        await sock.sendMessage(m.from, {
          text: "⚠️ Pilihan tidak valid. Silakan ketik:\n1 untuk Ami Flash\n2 untuk Ami Reasoning\n3 untuk Ami DeepThinking"
        });
        return;
      }
    }
    
    if (text === "ami stop") {
      endSession(db, userId, sock, m.from);
      await sock.sendMessage(m.from, {
        text: "✅ Sesi chat dengan Ami telah berakhir. Ketik *ami* untuk memulai sesi baru.",
      });
      return;
    }
    
    userContext.history.push({
      id: m.id,
      role: "user",
      content: m.body, // Menggunakan m.body bukan m.text
    });
    writeUserContext(userId, userContext);
    
    const timeZone = "Asia/Jakarta";
    const currentTime = time(Date.now(), { timeZone });
    const currentDate = date(Date.now(), timeZone);
    const greeting = getGreeting(timeZone);
    const userMemory = (userContext.memory || []).map((mem) => mem.content);
    
    const systemPrompt = createPersona(
      session.modelType,
      user,
      currentDate,
      currentTime,
      greeting,
      cmds,
      userMemory
    );
    
    const relevantHistory = buildRelevantHistory(userContext, m.quoted?.id);
    const context = [{ role: "system", content: systemPrompt }];
    relevantHistory.forEach(({ id, ...rest }) => context.push(rest));
    
    const result = await processAIRequest(session, context, m, sock, userContext);
    
    if (result) {
      userContext.history.push({
        id: result.messageId,
        role: "assistant",
        content: result.content,
      });
      
      writeUserContext(userId, userContext);
    }
  });
}