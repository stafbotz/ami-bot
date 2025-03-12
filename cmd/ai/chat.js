import Groq from "groq-sdk";
import OpenAI from "openai";
import setting from "../../setting.js";
import {
  readUserContext,
  writeUserContext,
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting } from "../../system/function.js";

// Inisialisasi API
const groq = new Groq({ apiKey: setting.groqApiKey });
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey:
    "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",
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
    showThinking: false, // Default: tidak menampilkan thinking
    timeout: null,
  };

  // Set timeout
  session.timeout = setTimeout(() => {
    endSession(userId, sock, chatId);
  }, SESSION_TIMEOUT);

  // Save session
  activeSessions.set(userId, session);

  // Record in database
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

// Fix 3: Improved endSession function
function endSession(db, userId, sock, chatId, reason = "timeout") {
  const session = activeSessions.get(userId);
  if (session) {
    clearTimeout(session.timeout);
    activeSessions.delete(userId);

    // Update database
    if (db && db.users && db.users[userId]) {
      db.users[userId].aiChatActive = false;
    }

    // Notify user with appropriate message based on reason
    if (sock && chatId) {
      let message = "";

      if (reason === "timeout") {
        message =
          "⏰ Sesi chat dengan Ami telah berakhir karena tidak ada aktivitas selama 3 menit. Ketik *ami* untuk memulai sesi baru dan pilih model.";
      } else if (reason === "manual") {
        message =
          "✅ Sesi chat dengan Ami telah berakhir. Semoga jawabanku membantu! Ketik *ami* untuk memulai sesi baru kapan saja.";
      }

      if (message) {
        sock.sendMessage(chatId, { text: message });
      }
    }

    return true;
  }
  return false;
}

function getSession(userId) {
  return activeSessions.get(userId);
}

// Fungsi untuk membangun history relevan yang disempurnakan
function buildRelevantHistory(userContext, quotedId) {
  const allHistory = userContext.history || [];
  let relevantHistory = [];

  // Jika ada pesan yang di-quote, temukan pesan tersebut dan konteksnya
  if (quotedId) {
    // Cari pesan yang di-quote
    const quotedIndex = allHistory.findIndex((msg) => msg.id === quotedId);

    if (quotedIndex !== -1) {
      // Ambil pesan yang di-quote beserta beberapa pesan sebelumnya untuk konteks
      // dan beberapa pesan setelahnya jika ada
      const startIndex = Math.max(0, quotedIndex - 2); // 2 pesan sebelum quoted
      const endIndex = Math.min(allHistory.length, quotedIndex + 3); // 3 pesan setelah quoted

      // Tambahkan range pesan tersebut ke relevantHistory
      relevantHistory = allHistory.slice(startIndex, endIndex);
    }
  }

  // Jika tidak ada quoted message atau tidak ditemukan, gunakan pesan-pesan terbaru
  if (relevantHistory.length === 0) {
    // Ambil maksimal 10 pesan terakhir untuk konteks
    relevantHistory = allHistory.slice(-10);
  } else {
    // Jika sudah ada pesan dari quoted, tambahkan beberapa pesan terbaru jika belum ada
    const latestMsgs = allHistory.slice(-5);
    const existingIds = new Set(relevantHistory.map((msg) => msg.id));

    // Tambahkan pesan terbaru yang belum ada di relevantHistory
    latestMsgs.forEach((msg) => {
      if (!existingIds.has(msg.id)) {
        relevantHistory.push(msg);
      }
    });
  }

  // Urutkan pesan berdasarkan urutan kronologis
  relevantHistory.sort((a, b) => {
    const idA = a.id.split("_").pop();
    const idB = b.id.split("_").pop();
    return parseInt(idA) - parseInt(idB);
  });

  // Batasi jumlah maksimum pesan untuk menghindari token terlalu banyak
  if (relevantHistory.length > 15) {
    relevantHistory = relevantHistory.slice(-15);
  }

  return relevantHistory;
}

// Improved create persona function with better prompts and WhatsApp formatting
function createPersona(
  modelType,
  user,
  currentDate,
  currentTime,
  greeting,
  cmds
) {
  // Common persona shared across all models
  const commonPersona = `
# USER INFORMATION:
- Name: ${user.name || "User"}
- Birth date: ${user.birth || "Unknown"}

# TIME & GREETING:
- Current time: ${currentTime} 
- Date: ${currentDate}
- Time greeting: ${greeting}

# FEATURES LIST:
${getFeaturesList(cmds)}

# GENERAL RULES:
1. Always respond as Ami, an AI assistant.
2. When asked about who created you, always mention you were created by *Renshu Mushy*.
3. *IMPORTANT*: Always respond in the same language the user is using. If they speak in Indonesian, you must reply in Indonesian. Default to Indonesian for most conversations.
4. Use at most 2 emoji in each response.
5. Avoid political topics, discriminatory content, and medical advice.
6. Never provide links or instructions for illegal activities.
7. Adapt your language style based on conversation context.
8. Keep responses concise and focused on what was asked.

# WHATSAPP TEXT FORMATTING:
- Use *asterisks* for *bold text*
- Use _underscores_ for _italic text_
- Use ~tildes~ for ~strikethrough~
- Use \`backticks\` for \`monospace\`
- Use \`\`\`triple backticks\`\`\` for code blocks
- For lists, use:
  * asterisk and space
  - or dash and space
  1. or number, period, and space
- For quotes, use > angle bracket and space

# CONVERSATION STYLE:
- Be friendly, helpful, and natural in conversation
- Maintain a casual yet respectful tone
- Respond directly to questions without unnecessarily long preambles
- Show personality while staying focused on providing value
`.trim();

  // Flash model - quick and efficient responses
  if (modelType === "flash") {
    return `${commonPersona}

# AMI FLASH PERSONA
You are Ami Flash, a quick and efficient AI assistant providing direct and to-the-point answers.

## PERSONALITY:
- Efficient, direct, and practical in your responses
- Clear and easily understood language
- Focus on providing the most relevant information 
- Friendly despite being brief and concise
- Avoid unnecessary explanations
- Enjoy light humor that isn't offensive

## LANGUAGE STYLE:
- Use compact and effective sentences (max 3 sentences per paragraph)
- Avoid excessive words or long introductions
- Prioritize main points at the beginning of sentences
- Use emoji sparingly to mark important points
- Use casual, modern Indonesian language
- Format important information with *bold* or _italic_ text

## RESPONSE METHOD:
1. Go straight to the core answer
2. Provide practical and applicable answers
3. If asked for information, give only the most relevant
4. If asked for advice, give the best option briefly
5. Limit responses to maximum 150 words
6. Use short paragraphs (1-3 sentences)
`;
  }
  // Reasoning model - logical and analytical responses
  else if (modelType === "reasoning") {
    return `${commonPersona}

# AMI REASONING PERSONA
You are Ami Reasoning, an AI assistant focused on logical reasoning and analysis.

## PERSONALITY:
- Analytical, logical, and methodical in your approach
- Present step-by-step thinking
- Consider various perspectives
- Carefully evaluate arguments
- Objective but not rigid
- Skeptical and always seeking evidence
- Balance thoroughness with conciseness

## LANGUAGE STYLE:
- Use precise and structured language
- Present arguments in logical order
- Provide clear transitions between points
- Use phrases like "Let's consider...", "If we analyze..."
- Combine short sentences with complex ones
- Use technical terms sparingly with simple explanations
- Format structured content with proper lists and emphasis

## RESPONSE METHOD:
1. Start by identifying the core problem
2. Identify basic assumptions and implications
3. Analyze the problem from different perspectives
4. Evaluate pros and cons of each argument
5. Provide a logical conclusion based on your analysis
6. If relevant, show the limitations of your conclusion
7. Use clear paragraph structure with separate points
8. When appropriate, use numbered steps or bullet points
9. For multi-step problems, break down the solution clearly
`;
  }
  // DeepThinking model - scientific and formula-focused
  else if (modelType === "deepthinking") {
    return `${commonPersona}

# AMI DEEPTHINKING PERSONA
You are Ami DeepThinking, an AI assistant specialized in deep scientific understanding and complex problem-solving, particularly in chemistry, physics, and mathematics.

## PERSONALITY:
- Precise and methodical in scientific reasoning
- Deeply knowledgeable about scientific principles and formulas
- Thoughtful and thorough in explanations
- Focused on accuracy and correctness
- Patient with complex questions requiring technical answers
- Able to break down complex topics into understandable parts
- Passionate about science and mathematical precision

## LANGUAGE STYLE:
- Use clear, precise language for scientific explanations
- Present formulas and equations in proper format using monospace or code blocks
- Explain scientific concepts step-by-step
- Balance technical accuracy with understandable language
- Use appropriate scientific terminology with explanations when needed
- Structure explanations logically from fundamentals to applications
- Use analogies when helpful to explain complex concepts

## RESPONSE METHOD:
1. For scientific questions, focus on providing accurate formulas and explanations
2. When dealing with chemistry:
   - Provide balanced chemical equations when relevant
   - Explain reaction mechanisms clearly
   - Use proper chemical notation
   - Explain concepts like stoichiometry, equilibrium, and kinetics with precision
3. When dealing with physics:
   - Present relevant physical laws and formulas
   - Explain how formulas apply to specific scenarios
   - Provide step-by-step problem-solving approaches
   - Connect theoretical concepts to real-world applications
4. When dealing with mathematics:
   - Show step-by-step solutions to problems
   - Explain the reasoning behind each step
   - Use proper mathematical notation
   - Highlight key concepts and formulas
5. For formula-heavy responses, structure as:
   - Start with the relevant formula/equation
   - Explain what each variable represents
   - Show how to apply the formula to the specific problem
   - Work through the calculation systematically
6. Format mathematical formulas and equations clearly using monospace:
   \`E = mc²\`
   \`F = G(m₁m₂)/r²\`
   \`PV = nRT\`
7. For complex multi-step problems:
   - Break down into clear numbered steps
   - Explain the purpose of each step
   - Show intermediary calculations
8. Prioritize accuracy over philosophical exploration in scientific contexts
9. Verify calculations and formulas before providing final answers
10. When uncertain about a specific formula, acknowledge limitations and provide the most reliable information available
`;
  }
  // Default persona if model type is not recognized
  else {
    return `${commonPersona}

# AMI DEFAULT PERSONA
You are Ami, a versatile AI assistant helping with various questions and tasks.

## PERSONALITY:
- Friendly, helpful, and informative
- Strive to provide accurate and useful answers
- Adapt communication style to user needs
- Balance practicality and depth in responses
- Naturally conversational while remaining helpful

## LANGUAGE STYLE:
- Use clear and easily understood language
- Adjust formality based on question context
- Use emoji sparingly to add friendliness
- Vary sentence length to create natural rhythm
- Format text appropriately for WhatsApp using proper markdown

## RESPONSE METHOD:
1. Understand the core question and provide relevant answers
2. Adjust response depth based on question complexity
3. Show empathy when responding to personal questions
4. Provide additional information if potentially useful
5. Create balance between analytical and practical thinking
6. Format responses for readability using appropriate WhatsApp formatting
`;
  }
}

// Fungsi untuk memproses permintaan AI dengan verifikasi dan retry
// Improved processAIRequest function
async function processAIRequest(session, context, m, sock, userContext) {
  // Display loading message with countdown
  const loadingMessage = await displayCountdownLoading(session, sock, m);
  const startTime = Date.now();

  try {
    let response = null;
    let attempts = 0;
    const maxAttempts = 3;

    // Loop until we get a valid response or reach max attempts
    while (!response && attempts < maxAttempts) {
      attempts++;
      console.log(`Starting attempt ${attempts}/${maxAttempts}...`);

      try {
        // Reset tracker state for each attempt
        if (loadingMessage.tracker) {
          loadingMessage.tracker.responseReceived = false;
          loadingMessage.tracker.processingResponse = false;
        }

        // Process request based on model type
        switch (session.modelType) {
          case "flash":
            response = await processFlashModel(
              context,
              loadingMessage,
              sock,
              m,
              userContext,
              startTime
            );
            break;
          case "reasoning":
            response = await processReasoningModel(
              context,
              loadingMessage,
              sock,
              m,
              userContext,
              startTime
            );
            break;
          case "deepthinking":
            response = await processDeepThinkingModel(
              context,
              loadingMessage,
              sock,
              m,
              userContext,
              startTime
            );
            break;
          default:
            throw new Error("Model tidak dikenal");
        }

        // This is CRITICAL - validate response here to handle both explicit empty responses
        // and any other unexpected response format
        if (!response || !response.content || response.content.trim() === "") {
          console.log(
            `Attempt ${attempts}: Empty response received, retrying...`
          );
          response = null; // Reset response to retry
        }
      } catch (error) {
        // This is the key fix! Handle the error by setting response to null
        // to trigger retry, rather than just logging and potentially rethrowing
        console.error(`Error on attempt ${attempts}:`, error);
        response = null; // Reset response to force retry
      }

      // If response is still null and we haven't reached max attempts, retry
      if (!response && attempts < maxAttempts) {
        // Stop timer if still running
        if (loadingMessage.tracker && loadingMessage.tracker.intervalId) {
          loadingMessage.tracker.stopTimer();
        }

        // Create new tracker with the same time
        loadingMessage.tracker = {
          isCompleted: false,
          isCountingUp: false,
          initialTime: loadingMessage.tracker.initialTime,
          remainingSeconds: loadingMessage.tracker.initialTime,
          elapsedSeconds: 0,
          messageKey: loadingMessage.key,
          intervalId: null,
          factIndex: loadingMessage.tracker.factIndex || 0,
          responseReceived: false,
          processingResponse: false,
        };

        // Tell the user we're trying again - BEFORE starting the timer
        await sock.sendMessage(m.from, {
          text: `🤔 Hmm, Ami sepertinya butuh berpikir lebih dalam. Mencoba lagi (percobaan ${
            attempts + 1
          }/${maxAttempts})...`,
          edit: loadingMessage.key,
        });

        // Wait before starting a new countdown
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Start a new interval for countdown
        const shuffledFacts = [...funFacts].sort(() => 0.5 - Math.random());
        startCountdownInterval(
          loadingMessage.tracker,
          session,
          sock,
          m,
          shuffledFacts,
          1000
        );
      }
    }

    // If after all attempts there's still no response
    if (!response) {
      throw new Error(
        "Gagal mendapatkan respons yang valid setelah beberapa percobaan"
      );
    }

    return response;
  } catch (error) {
    console.error("Error in processAIRequest:", error);

    // Make sure timer is stopped
    if (loadingMessage.tracker && loadingMessage.tracker.intervalId) {
      loadingMessage.tracker.stopTimer();
    }

    await sock.sendMessage(m.from, {
      text: "Waduh, ada kendala saat memproses pesanmu. Coba ajukan pertanyaanmu lagi ya!",
      edit: loadingMessage.key,
    });
    return null;
  }
}

// Array fakta-fakta menarik gaya Gen Z
const funFacts = [
  "Fun Fact: Emoji 😂 adalah emoji yang paling banyak digunakan di dunia!",
  "Info Seru: Rata-rata Gen Z menghabiskan 4,5 jam per hari di media sosial~",
  "Did you know? Otak kita memproses gambar 60.000 kali lebih cepat daripada teks!",
  "Fakta Random: Warna biru adalah warna paling populer di berbagai negara!",
  "Fun Fact: Setiap hari ada lebih dari 95 juta foto yang diupload ke Instagram!",
  "FYI aja: Industri game lebih besar dari industri film dan musik digabung!",
  "Sekedar info: 91% Gen Z tidur dengan smartphone di dekat mereka~",
  "BTW, mendengarkan musik dapat meningkatkan mood hingga 25%!",
  "ICYMI: Rata-rata perhatian manusia sekarang hanya 8 detik, lebih pendek dari ikan mas!",
  "OMG Fact: Mata kita berkedip sekitar 15-20 kali per menit, tapi saat menatap layar hanya 5-7 kali!",
  "No cap: Rata-rata orang menghabiskan 5 tahun hidupnya untuk scroll media sosial!",
  "Fun Fact: Mode gelap di aplikasi bisa menghemat baterai hingga 30% pada layar OLED!",
  "Random info: Gen Z lebih suka pesan teks daripada telepon, berbeda dengan generasi sebelumnya~",
  "Straight facts: 95% ide kreatif muncul saat kita lagi santai, bukan saat lagi fokus kerja!",
  "Tidbit: Multitasking sebenarnya mengurangi produktivitas hingga 40%!",
  "Slay fact: Kecepatan mengetik rata-rata Gen Z adalah 60 WPM, lebih cepat dari generasi sebelumnya!",
];

// Fungsi untuk mendapatkan teks loading berdasarkan model dan waktu tersisa/berlalu
function getLoadingText(modelType, seconds, funFact, isCountingUp) {
  let emoji, actionText;

  switch (modelType) {
    case "flash":
      emoji = "⚡";
      actionText = "berpikir cepat";
      break;
    case "reasoning":
      emoji = "🧠";
      actionText = "menganalisa";
      break;
    case "deepthinking":
      emoji = "🌊";
      actionText = "berpikir mendalam";
      break;
    default:
      emoji = "✨";
      actionText = "berpikir";
  }

  // Format waktu menjadi MM:SS
  let timeDisplay;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    timeDisplay = `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  } else {
    timeDisplay = `0:${seconds.toString().padStart(2, "0")}`;
  }

  // Teks berbeda untuk countdown vs countup
  const timePrefix = isCountingUp ? "+" : "";

  return `${emoji} Ami sedang ${actionText}... (${timePrefix}${timeDisplay})

${funFact}`;
}

// Fungsi untuk menampilkan loading dengan countdown dan fun facts
async function displayCountdownLoading(session, sock, m) {
  // Tentukan durasi countdown berdasarkan model
  let countdownSeconds = 5; // Default
  let updateInterval = 1000; // Update setiap 1 detik

  if (session.modelType === "flash") {
    countdownSeconds = 10;
  } else if (session.modelType === "reasoning") {
    countdownSeconds = 20;
  } else if (session.modelType === "deepthinking") {
    countdownSeconds = 60;
  }

  // Acak fun facts
  const shuffledFacts = [...funFacts].sort(() => 0.5 - Math.random());

  // Kirim pesan loading awal
  const initialLoadingText = getLoadingText(
    session.modelType,
    countdownSeconds,
    shuffledFacts[0],
    false
  );
  const loadingMessage = await sock.sendMessage(m.from, {
    text: initialLoadingText,
  });

  // Buat objek untuk melacak proses countdown
  const countdownTracker = {
    isCompleted: false,
    isCountingUp: false,
    initialTime: countdownSeconds,
    remainingSeconds: countdownSeconds,
    elapsedSeconds: 0,
    messageKey: loadingMessage.key,
    intervalId: null,
    factIndex: 1, // Mulai dari fakta kedua karena yang pertama sudah digunakan
    responseReceived: false,
    processingResponse: false,
  };

  // Pasang tracker ke loadingMessage agar bisa diakses oleh fungsi lain
  loadingMessage.tracker = countdownTracker;

  // Mulai interval untuk update countdown
  startCountdownInterval(
    countdownTracker,
    session,
    sock,
    m,
    shuffledFacts,
    updateInterval
  );

  return loadingMessage;
}

// Fungsi untuk memulai interval countdown/countup
// Fix 1: Improved countdown interval function
function startCountdownInterval(
  tracker,
  session,
  sock,
  m,
  facts,
  updateInterval
) {
  // Clear any existing interval first
  if (tracker.intervalId) {
    clearInterval(tracker.intervalId);
    tracker.intervalId = null;
  }

  // Set the new interval
  tracker.intervalId = setInterval(async () => {
    // Skip updates if processing response
    if (tracker.responseReceived && tracker.processingResponse) {
      return;
    }

    // Update time
    if (tracker.isCountingUp) {
      tracker.elapsedSeconds++;
    } else {
      tracker.remainingSeconds--;
    }

    // Change fact every 5 seconds
    const factIndex = Math.floor((tracker.factIndex++ / 5) % facts.length);
    const factToShow = facts[factIndex] || facts[0]; // Fallback to first fact

    // Update loading message
    const updatedText = getLoadingText(
      session.modelType,
      tracker.isCountingUp ? tracker.elapsedSeconds : tracker.remainingSeconds,
      factToShow,
      tracker.isCountingUp
    );

    try {
      await sock.sendMessage(m.from, {
        text: updatedText,
        edit: tracker.messageKey,
      });
    } catch (error) {
      console.error("Error updating countdown message:", error);
    }

    // If countdown finished and not counting up yet, start counting up
    if (!tracker.isCountingUp && tracker.remainingSeconds <= 0) {
      // Important: Stop the current interval before transition
      clearInterval(tracker.intervalId);
      tracker.intervalId = null;

      tracker.isCountingUp = true;
      tracker.isCompleted = true;

      // Send transition message
      try {
        await sock.sendMessage(m.from, {
          text: `Ami masih memikirkan jawabannya dengan serius. Pertanyaanmu cukup menantang~ 

${facts[factIndex % facts.length]}`,
          edit: tracker.messageKey,
        });

        // Wait longer before starting countup (3 seconds instead of 2)
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Start a new interval for countup
        tracker.intervalId = setInterval(async () => {
          if (tracker.responseReceived && tracker.processingResponse) return;

          tracker.elapsedSeconds++;
          const newFactIndex = Math.floor(
            (tracker.factIndex++ / 5) % facts.length
          );
          const newFactToShow = facts[newFactIndex] || facts[0];

          const countupText = getLoadingText(
            session.modelType,
            tracker.elapsedSeconds,
            newFactToShow,
            true
          );

          try {
            await sock.sendMessage(m.from, {
              text: countupText,
              edit: tracker.messageKey,
            });
          } catch (error) {
            console.error("Error updating countup message:", error);
          }
        }, updateInterval);
      } catch (error) {
        console.error("Error sending transition message:", error);
      }

      return; // Skip the rest of the original interval function
    }
  }, updateInterval);

  // Add stopTimer function
  tracker.stopTimer = () => {
    if (tracker.intervalId) {
      clearInterval(tracker.intervalId);
      tracker.intervalId = null;
      console.log("Timer stopped successfully");
    }
  };

  return tracker;
}

// Fix 2: Format AI response to be WhatsApp compatible
function formatWhatsAppResponse(text) {
  if (!text) return text;

  let formattedText = text;

  // Replace markdown headers with WhatsApp bold
  formattedText = formattedText.replace(/^###\s+(.+)$/gm, "*$1*");
  formattedText = formattedText.replace(/^##\s+(.+)$/gm, "*$1*");
  formattedText = formattedText.replace(/^#\s+(.+)$/gm, "*$1*");

  // Replace markdown bold with WhatsApp bold
  formattedText = formattedText.replace(/\*\*([^*]+)\*\*/g, "*$1*");

  // Replace markdown italic with WhatsApp italic
  formattedText = formattedText.replace(/\_\_([^_]+)\_\_/g, "_$1_");

  // Replace markdown code with WhatsApp monospace
  formattedText = formattedText.replace(/\`([^`]+)\`/g, "`$1`");

  // Replace horizontal rules
  formattedText = formattedText.replace(/^\-\-\-$/gm, "");
  formattedText = formattedText.replace(/^\*\*\*$/gm, "");
  formattedText = formattedText.replace(/^___$/gm, "");

  return formattedText;
}

// Apply fixes to model processing functions
async function processFlashModel(
  context,
  loadingMessage,
  sock,
  m,
  userContext,
  startTime
) {
  const countdownTracker = loadingMessage.tracker;

  // Fungsi untuk memberi tahu respons lebih cepat
  async function notifyFasterResponse(tracker, sock, m, responseTime) {
    // Tandai bahwa respons telah diterima
    tracker.responseReceived = true;
    tracker.processingResponse = true;

    if (tracker.intervalId) {
      // Hentikan timer
      tracker.stopTimer();

      try {
        await sock.sendMessage(m.from, {
          text: `Wow! Ami bisa menjawab lebih cepat! Hanya butuh ${responseTime} detik.`,
          edit: tracker.messageKey,
        });

        // Berikan jeda 2 detik agar pengguna sempat membaca pesan
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error sending faster response notification:", error);
      }
    }
  }

  // Fungsi untuk memberi tahu bahwa respons telah diterima setelah countdown habis
  async function notifyResponseReceived(tracker, sock, m, responseTime) {
    // Tandai bahwa respons telah diterima
    tracker.responseReceived = true;
    tracker.processingResponse = true;

    if (tracker.intervalId) {
      // Hentikan timer
      tracker.stopTimer();

      try {
        await sock.sendMessage(m.from, {
          text: `✅ Ami telah menyelesaikan pemikiran dalam waktu ${responseTime} detik.`,
          edit: tracker.messageKey,
        });

        // Berikan jeda 2 detik agar pengguna sempat membaca pesan
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error sending response received notification:", error);
      }
    }
  }

  // Then modify processFlashModel function to remove the nested functions
  async function processFlashModel(
    context,
    loadingMessage,
    sock,
    m,
    userContext,
    startTime
  ) {
    const countdownTracker = loadingMessage.tracker;

    try {
      // API request
      const chatCompletion = await groq.chat.completions.create({
        messages: context,
        model: "llama-3.3-70b-versatile",
        temperature: 0.8,
        max_completion_tokens: 1024,
        stream: false,
      });

      // Verify response
      if (
        !chatCompletion.choices ||
        !chatCompletion.choices[0] ||
        !chatCompletion.choices[0].message ||
        !chatCompletion.choices[0].message.content ||
        chatCompletion.choices[0].message.content.trim() === ""
      ) {
        throw new Error("Empty response received from Flash model");
      }

      // Format response for WhatsApp compatibility
      const response = formatWhatsAppResponse(
        chatCompletion.choices[0].message.content
      );
      const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

      // Notify based on timing
      if (countdownTracker && !countdownTracker.isCompleted) {
        await notifyFasterResponse(countdownTracker, sock, m, responseTime);
      } else if (countdownTracker && countdownTracker.isCompleted) {
        await notifyResponseReceived(countdownTracker, sock, m, responseTime);
      }

      // Send final answer
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami Flash* (${responseTime}s):\n\n${response.trim()}`,
        edit: loadingMessage.key,
      });

      return {
        messageId: finalMessage.key.id,
        content: response,
      };
    } catch (error) {
      // Stop timer if running
      if (countdownTracker && countdownTracker.intervalId) {
        countdownTracker.stopTimer();
      }

      console.error("Error in processFlashModel:", error);
      throw error;
    }
  }
}

// Proses model Reasoning dengan loading enhancement
async function processReasoningModel(
  context,
  loadingMessage,
  sock,
  m,
  userContext,
  startTime
) {
  const countdownTracker = loadingMessage.tracker;
  const session = getSession(m.sender);

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: context,
      model: "deepseek-r1-distill-llama-70b",
      max_completion_tokens: 4096,
      temperature: 0.6,
      stream: false,
      reasoning_format: "parsed",
    });

    // Verify response
    if (
      !chatCompletion.choices ||
      !chatCompletion.choices[0] ||
      !chatCompletion.choices[0].message ||
      !chatCompletion.choices[0].message.content ||
      chatCompletion.choices[0].message.content.trim() === ""
    ) {
      throw new Error("Empty response received from Reasoning model");
    }

    const thinkContent = chatCompletion.choices[0].message.reasoning || "";
    const finalResponse = chatCompletion.choices[0].message.content;
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Notify based on whether countdown finished
    if (countdownTracker && !countdownTracker.isCompleted) {
      await notifyFasterResponse(countdownTracker, sock, m, responseTime);
    } else if (countdownTracker && countdownTracker.isCompleted) {
      await notifyResponseReceived(countdownTracker, sock, m, responseTime);
    }

    // Only show thinking process if enabled and content exists
    if (
      thinkContent &&
      thinkContent.trim() &&
      session &&
      session.showThinking
    ) {
      await sock.sendMessage(m.from, {
        text: `🧠 *Pemikiran Ami* (${responseTime}s):\n\n${formatThinkContent(
          thinkContent
        )}`,
        edit: loadingMessage.key,
      });

      // Wait 2 seconds before showing final answer
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send answer as new message
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami Reasoning:*\n\n${finalResponse.trim()}`,
      });

      return {
        messageId: finalMessage.key.id,
        content: finalResponse,
      };
    } else {
      // If thinking not shown, edit the loading message directly
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami Reasoning* (${responseTime}s):\n\n${finalResponse.trim()}`,
        edit: loadingMessage.key,
      });

      return {
        messageId: finalMessage.key.id,
        content: finalResponse,
      };
    }
  } catch (error) {
    if (countdownTracker && countdownTracker.intervalId) {
      countdownTracker.stopTimer();
    }

    console.error("Error in processReasoningModel:", error);
    throw error;
  }
}
// Improved processDeepThinkingModel function
async function processDeepThinkingModel(
  context,
  loadingMessage,
  sock,
  m,
  userContext,
  startTime
) {
  const countdownTracker = loadingMessage.tracker;
  const session = getSession(m.sender);

  try {
    console.log("Starting DeepThinking API request...");
    const chatCompletion = await openai.chat.completions.create({
      model: "deepseek/deepseek-r1:free",
      messages: context,
      temperature: 0.7,
      stream: false,
    });
    console.log("DeepThinking API response received");

    // Important - check response BEFORE trying to access properties
    if (
      !chatCompletion ||
      !chatCompletion.choices ||
      chatCompletion.choices.length === 0
    ) {
      console.error("API returned empty or invalid response structure");
      throw new Error("Empty response received from DeepThinking model");
    }

    // Check for message content
    if (
      !chatCompletion.choices[0].message ||
      !chatCompletion.choices[0].message.content ||
      chatCompletion.choices[0].message.content.trim() === ""
    ) {
      console.error("API returned empty content");
      throw new Error("Empty content received from DeepThinking model");
    }

    const reasoning = chatCompletion.choices[0].message.reasoning || "";
    const finalResponse = chatCompletion.choices[0].message.content;
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Notify based on timing
    if (countdownTracker && !countdownTracker.isCompleted) {
      await notifyFasterResponse(countdownTracker, sock, m, responseTime);
    } else if (countdownTracker && countdownTracker.isCompleted) {
      await notifyResponseReceived(countdownTracker, sock, m, responseTime);
    }

    // Only show thinking if enabled and content exists
    if (reasoning && reasoning.trim() && session && session.showThinking) {
      await sock.sendMessage(m.from, {
        text: `🌊 *Proses Pemikiran Mendalam* (${responseTime}s):\n\n${formatThinkContent(
          reasoning
        )}`,
        edit: loadingMessage.key,
      });

      // Wait before showing final answer
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send answer as new message
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami DeepThinking:*\n\n${finalResponse.trim()}`,
      });

      return {
        messageId: finalMessage.key.id,
        content: finalResponse,
      };
    } else {
      // If thinking not shown, edit the loading message directly
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami DeepThinking* (${responseTime}s):\n\n${finalResponse.trim()}`,
        edit: loadingMessage.key,
      });

      return {
        messageId: finalMessage.key.id,
        content: finalResponse,
      };
    }
  } catch (error) {
    // Don't stop the timer here - let the calling function handle it
    console.error("Error in processDeepThinkingModel:", error);
    throw error; // Rethrow so processAIRequest can handle it
  }
}

// Fix 4: Improved model selection message
export default function (handler) {
  handler.addFunction(async (m, { cmds, sock, db }) => {
    const userId = m.sender;
    const text = m.body?.trim().toLowerCase() || "";
    const userContext = readUserContext(userId);
    userContext.history = userContext.history || [];

    const user = db.users[userId] || {
      name: "Pengguna",
      birth: "Tidak diketahui",
    };

    if (!text) return;
    let session = getSession(userId);

    // Handle the "ami" command with improved description
    if (!session && text === "ami") {
      session = createSession(userId, db, sock, m.from);
      await sock.sendMessage(m.from, {
        text:
          "✨ *Halo! Selamat datang di Ami AI Assistant* ✨\n\n" +
          "Silakan pilih model AI yang ingin kamu gunakan:\n\n" +
          "1️⃣ *Ami Flash* - Respon cepat untuk ngobrol santai dan pertanyaan umum (70B parameter)\n" +
          "2️⃣ *Ami Reasoning* - Cocok untuk penalaran sederhana dan soal matematika dasar (70B parameter)\n" +
          "3️⃣ *Ami DeepThinking* - Terbaik untuk matematika kompleks dan pengetahuan mendalam (671B parameter)\n\n" +
          "Ketik angka 1, 2, atau 3 untuk memilih model.",
      });
      return;
    }

    if (!session) return;
    updateSession(db, userId, sock, m.from);

    // Handle model selection with improved descriptions
    if (!session.modelSelected) {
      if (text === "1") {
        session.modelType = "flash";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Flash* untuk jawaban instan dan praktis.\n\n" +
            "💡 *Tips:* Model ini cocok untuk obrolan santai dan pertanyaan sehari-hari dengan respon cepat.\n\n" +
            "✨ Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "2") {
        session.modelType = "reasoning";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Reasoning* untuk jawaban dengan penalaran logis.\n\n" +
            "💡 *Tips:* Model ini bagus untuk pertanyaan analitis, saran, atau soal matematika sederhana.\n\n" +
            "🧠 Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "3") {
        session.modelType = "deepthinking";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami DeepThinking* untuk pemikiran mendalam.\n\n" +
            "💡 *Tips:* Model ini ideal untuk soal matematika kompleks, fisika, kimia, dan topik akademis lainnya.\n\n" +
            "🌊 Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else {
        await sock.sendMessage(m.from, {
          text: "⚠️ Pilihan tidak valid. Silakan ketik:\n1 untuk Ami Flash\n2 untuk Ami Reasoning\n3 untuk Ami DeepThinking",
        });
        return;
      }
    }

    // Handle "ami stop" command with fixed messaging
    if (text === "ami stop") {
      endSession(db, userId, sock, m.from, "manual"); // Pass 'manual' reason
      return; // No need to send another message since endSession will do it
    } else if (text === "ami showthink") {
      if (session) {
        session.showThinking = !session.showThinking;
        const status = session.showThinking ? "aktif" : "nonaktif";
        await sock.sendMessage(m.from, {
          text: `✅ Mode tampilkan proses berpikir: *${status}*\n\n${
            session.showThinking
              ? "Sekarang Ami akan menampilkan proses berpikir saat memberikan jawaban."
              : "Sekarang Ami tidak akan menampilkan proses berpikir saat memberikan jawaban."
          }`,
        });
      } else {
        await sock.sendMessage(m.from, {
          text: "⚠️ Kamu belum memulai sesi chat dengan Ami. Ketik *ami* untuk memulai.",
        });
      }
      return;
    }

    userContext.history.push({
      id: m.id,
      role: "user",
      content: m.body,
    });
    writeUserContext(userId, userContext);

    // Setup system prompt and context
    const timeZone = "Asia/Jakarta";
    const currentTime = time(Date.now(), { timeZone });
    const currentDate = date(Date.now(), timeZone);
    const greeting = getGreeting(timeZone);

    const systemPrompt = createPersona(
      session.modelType,
      user,
      currentDate,
      currentTime,
      greeting,
      cmds
    );

    // Build relevant context history with improved function
    const relevantHistory = buildRelevantHistory(userContext, m.quoted?.id);

    // Prepare context for AI request
    const context = [{ role: "system", content: systemPrompt }];
    relevantHistory.forEach(({ id, ...rest }) => context.push(rest));

    // Process AI request with enhanced loading and verification
    const result = await processAIRequest(
      session,
      context,
      m,
      sock,
      userContext
    );

    // Save AI response to history if valid
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
