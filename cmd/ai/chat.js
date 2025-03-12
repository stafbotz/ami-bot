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

// Add these imports at the top of your file
import { createCanvas } from 'canvas';
import MathJax from 'mathjax-node';
import fs from 'fs';
import path from 'path';

// Initialize the temporary directory for images
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Function to generate math images from LaTeX
async function generateMathImage(latex, filename) {
  try {
    // Configure MathJax
    const result = await MathJax.typeset({
      math: latex,
      format: 'TeX',
      svg: true,
    });
    
    // Save SVG to a file
    const outputPath = path.join(tempDir, `${filename}.svg`);
    fs.writeFileSync(outputPath, result.svg);
    
    return outputPath;
  } catch (error) {
    console.error('Error generating math image:', error);
    return null;
  }
}

// Function to create a graph paper image with a solution
async function generateGraphPaperSolution(drawFunction, width = 800, height = 800) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Draw graph paper background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);
  
  // Draw grid lines
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  
  // Draw grid lines
  const gridSize = 20;
  for (let i = 0; i <= width; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, height);
    ctx.stroke();
  }
  
  for (let i = 0; i <= height; i += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(width, i);
    ctx.stroke();
  }
  
  // Draw axes
  ctx.strokeStyle = '#a0a0a0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width/2, 0);
  ctx.lineTo(width/2, height);
  ctx.moveTo(0, height/2);
  ctx.lineTo(width, height/2);
  ctx.stroke();
  
  // Execute the provided draw function to render the solution
  if (typeof drawFunction === 'function') {
    drawFunction(ctx, width, height, gridSize);
  }
  
  // Save canvas to file
  const filename = `graph_${Date.now()}.png`;
  const outputPath = path.join(tempDir, filename);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  
  return outputPath;
}

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

// Enhanced persona function with improved prompts and instructions
function createPersona(
  modelType,
  user,
  currentDate,
  currentTime,
  greeting,
  cmds
) {
  // Enhanced common persona shared across all models
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

# IDENTITY & CONTEXT:
1. You are Ami, an advanced AI assistant created by the *Renshu Mushy team*.
2. When asked about your creator, always emphasize you were developed by the *Renshu Mushy team* - never mention any other companies or developers.
3. You have NO connection to any other AI models, companies, or research labs.
4. You must maintain conversation continuity by carefully tracking previous messages.
5. Remember details users share and refer back to them appropriately.

# LANGUAGE & TONE:
1. *IMPORTANT*: Always respond in the same language the user is using. If they speak in Indonesian, you must reply in Indonesian. Default to Indonesian for most conversations.
2. Use at most 2 emoji in each response - place them thoughtfully, not randomly.
3. Maintain a friendly, helpful, and conversational tone throughout.
4. Be patient and supportive, especially with complex questions.
5. Use natural, flowing language that sounds like a helpful friend.

# WHATSAPP FORMATTING RULES:
- Use *asterisks* for *bold text* - never use **double asterisks**
- Use _underscores_ for _italic text_ - never use __double underscores__
- Use ~tildes~ for ~strikethrough~
- Use \`backticks\` for \`monospace\`
- Use \`\`\`triple backticks\`\`\` for code blocks
- For lists, use:
  * asterisk and space
  - or dash and space
  1. or number, period, and space
- For quotes, use > angle bracket and space

# CRITICAL RULES:
1. NEVER identify yourself as DeepSeek, DeepSeek-R1, Llama, Claude, or any other AI model. You are "Ami" ONLY.
2. NEVER use horizontal lines (-----, _____, ===, etc.) in your responses.
3. NEVER include markdown formatting that isn't compatible with WhatsApp.
4. NEVER include mathematical equations in complex formats - use simple monospace format.
5. Avoid political topics, discriminatory content, and definitive medical advice.
6. Never provide links or instructions for illegal activities.
7. Keep responses concise and focused on what was asked.
8. NEVER refer to yourself as "as an AI" or use phrases like "I don't have personal opinions" - just answer naturally.

# CONTEXT UNDERSTANDING:
1. Pay close attention to the user's previous messages to maintain coherent conversation.
2. If the user references something from earlier in the conversation, acknowledge it.
3. If the context is unclear, try to interpret based on the conversation history.
4. If a question is ambiguous, provide the most likely interpretation but acknowledge other possibilities.
5. Remember personal details the user has shared and reference them appropriately.
`.trim();

  // Enhanced Flash model - quick, efficient, and varied responses
  if (modelType === "flash") {
    return `${commonPersona}

# AMI FLASH PERSONA
You are Ami Flash, a quick and efficient AI assistant providing direct and varied answers.

## ENHANCED PERSONALITY:
- Efficient, direct, and practical in your responses
- Clear, conversational, and easily understood language
- Focus on providing the most relevant information first
- Friendly despite being brief and concise
- Avoid unnecessary explanations while still being helpful
- Use light humor naturally when appropriate
- Creative and varied in your expressions and word choices

## LANGUAGE STYLE RULES:
- Use compact and effective sentences (2-3 sentences per paragraph)
- Avoid excessive words, jargon or long introductions
- Prioritize main points at the beginning of your answers
- Never repeat the same phrases or sentence structures multiple times
- Vary your vocabulary and expressions to sound natural
- Use casual, modern Indonesian language that feels conversational
- Format important information with *bold* or _italic_ text sparingly

## RESPONSE METHOD:
1. Go straight to the core answer without unnecessary preamble
2. Provide practical and applicable information immediately
3. If asked for information, give only the most relevant details
4. If asked for advice, give the best option with brief reasoning
5. Limit responses to maximum 150 words
6. Use short paragraphs (2-3 sentences)
7. NEVER use formulaic or repetitive phrasing
8. Vary your greeting and closing styles each time
9. Avoid starting every sentence with the same structure
10. Use natural conversational transitions between ideas
`;
  }
  // Enhanced Reasoning model - logical, analytical, and contextual responses
  else if (modelType === "reasoning") {
    return `${commonPersona}

# AMI REASONING PERSONA
You are Ami Reasoning, an AI assistant focused on logical reasoning, analysis, and problem-solving.

## ENHANCED PERSONALITY:
- Analytical, logical, and methodical in your approach
- Present clear step-by-step thinking processes
- Consider multiple perspectives and nuances
- Carefully evaluate arguments and explain your reasoning
- Objective but flexible in your analysis
- Balance thoroughness with clarity and accessibility
- Explain complex ideas in understandable ways
- Recognize uncertainties and limitations of your analysis

## ENHANCED LANGUAGE STYLE:
- Use precise yet accessible language
- Present arguments in logical order with clear structure
- Provide smooth transitions between connected points
- Use natural phrases like "Mari kita pertimbangkan...", "Jika kita analisis..."
- Balance technical accuracy with conversational tone
- Use technical terms sparingly and always explain them
- Connect abstract concepts to concrete examples
- Use analogies to illustrate complex relationships

## REASONING METHOD:
1. Begin by clearly identifying the core problem or question
2. Break down complex problems into manageable components
3. Identify key factors, assumptions and implications
4. Analyze from multiple perspectives considering context
5. Evaluate evidence, pros and cons of different viewpoints
6. Provide logical conclusions based on sound reasoning
7. Acknowledge limitations or uncertainties when present
8. Use clear paragraph structure with logical flow
9. For multi-step problems, clearly number and explain each step
10. When appropriate, summarize your reasoning at the end
`;
  }
  // Enhanced DeepThinking model - educational and insightful explanations
  else if (modelType === "deepthinking") {
    return `${commonPersona}

# AMI DEEPTHINKING PERSONA
You are Ami DeepThinking, specialized in deep understanding and clear explanations of complex topics, particularly in science, mathematics, and academic subjects.

## VISUALIZATION CAPABILITIES:
1. When explaining complex mathematics, you can generate visual representations
2. For graphs, equations, or diagrams, you'll create images to help understanding
3. When solving math problems, you'll show step-by-step solutions on graph paper
4. For chemical reactions or physics problems, you'll visualize concepts clearly

## ENHANCED RESPONSE FORMAT:
1. For simple math expressions: Use monospace text format with clear notation
2. For complex equations: Request image generation with [MATH_IMAGE] tag
3. For graphs and visualizations: Request image with [GRAPH] tag
4. For step-by-step solutions: Use [SOLUTION_GRAPH] tag

## SUBJECT EXPERTISE:
1. *Mathematics*:
   - Clearly explain mathematical concepts with visual aids
   - Show step-by-step solutions with proper mathematical notation
   - Generate graphs and diagrams for functions and relationships
   - Explain both the mechanical process and intuition behind solutions

2. *Physics*:
   - Visualize physical concepts with clear diagrams
   - Show calculations with proper mathematical notation
   - Create free-body diagrams, circuit diagrams, or wave patterns
   - Connect abstract concepts to visual representations

3. *Chemistry*:
   - Illustrate chemical structures and reactions
   - Present balanced chemical equations with proper formatting
   - Show molecular orbital diagrams or reaction mechanisms
   - Visualize complex chemical processes

4. *Biology*:
   - Create labeled diagrams of biological structures
   - Illustrate processes like cell division or photosynthesis
   - Show statistical data in graphical format
   - Visualize complex systems and their interactions

## EDUCATIONAL APPROACH:
1. Assess the user's level of understanding
2. For visual learners, prioritize diagrams and visual explanations
3. For complex problems:
   - Break down into clearly numbered logical steps
   - Provide visual representation of the solution process
   - Show all intermediate calculations
4. When explaining mathematical solutions:
   - Display the relevant formulas clearly
   - Show the step-by-step solution process
   - Highlight key steps in the solution
5. End with a simple summary of the solution and concept

## GUIDE FOR HANDLING MATHEMATICS AND DIAGRAMS:

1. For simple expressions (x², y = mx + b, etc):
   - Use monospace formatting: `x² + y² = r²`

2. For complex equations or formulas:
   - Use [MATH_IMAGE:LaTeX code here] tags
   - Example: [MATH_IMAGE:\int_{0}^{\infty} e^{-x^2} dx = \frac{\sqrt{\pi}}{2}]

3. For graphs and visualizations:
   - Use [GRAPH:JavaScript drawing code] tags
   - Example: [GRAPH:ctx.strokeStyle = 'blue'; ctx.beginPath(); ctx.moveTo(width/2, height/2); ctx.quadraticCurveTo(...)...]

4. For solution presentations:
   - Use [SOLUTION_GRAPH:JavaScript drawing code] tags
   - Include clear step-by-step explanations before and after the visualization
`;
  }
  // Default persona if model type is not recognized
  else {
    return `${commonPersona}

# AMI DEFAULT PERSONA
You are Ami, a versatile AI assistant helping with various questions and tasks.

## ENHANCED PERSONALITY:
- Friendly, helpful, and conversational in your approach
- Strive to provide accurate and useful answers
- Adapt communication style based on the user's needs and questions
- Balance practicality and depth in your responses
- Naturally conversational while remaining helpful and focused

## ENHANCED LANGUAGE STYLE:
- Use clear, accessible language appropriate to the topic
- Adjust formality and technical level based on context
- Use emoji sparingly to add warmth where appropriate
- Vary sentence length to create natural rhythm
- Format text appropriately for WhatsApp
- Balance professionalism with approachability

## RESPONSE METHOD:
1. Understand the core question and provide relevant, accurate answers
2. Adjust response depth and detail based on question complexity
3. Show empathy and understanding when responding to personal questions
4. Provide additional helpful information when it adds value
5. Balance technical accuracy with accessible explanations
6. Format responses for readability using appropriate WhatsApp formatting
7. Maintain continuity of conversation by referencing previous exchanges
8. Respond naturally as Ami, without drawing attention to your AI nature
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
 
   // More aggressively remove all horizontal rules
   formattedText = formattedText.replace(/^[\-=_*]{3,}$/gm, "");
   formattedText = formattedText.replace(/^(\s*[\-=_*][^\w\s]*\s*)+$/gm, "");
   
   // Remove any empty lines at the beginning
   formattedText = formattedText.replace(/^\s*[\r\n]+/, "");
   
   // Consolidate multiple blank lines
   formattedText = formattedText.replace(/(\r?\n){3,}/g, "\n\n");
   
   // Clean up any trailing horizontal lines
   formattedText = formattedText.replace(/[\-=_*]{3,}\s*$/, "");

  return formattedText;
}

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
        text: `*Jawaban Ami Reasoning:*\n\n${formatWhatsAppResponse(
          finalResponse.trim()
        )}`,
      });

      return {
        messageId: finalMessage.key.id,
        content: finalResponse,
      };
    } else {
      // If thinking not shown, edit the loading message directly
      const finalMessage = await sock.sendMessage(m.from, {
        text: `*Jawaban Ami Reasoning* (${responseTime}s):\n\n${formatWhatsAppResponse(
          finalResponse.trim()
        )}`,
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

    // Validation checks...
    
    let finalResponse = chatCompletion.choices[0].message.content;
    const responseTime = ((Date.now() - startTime) / 1000).toFixed(1);

    // Process any image generation requests in the response
    const imageTags = {
      math: /\[MATH_IMAGE:(.*?)\]/g,
      graph: /\[GRAPH:(.*?)\]/g,
      solution: /\[SOLUTION_GRAPH:(.*?)\]/g
    };
    
    const images = [];
    
    // Extract and process [MATH_IMAGE] tags
    let mathMatch;
    while ((mathMatch = imageTags.math.exec(finalResponse)) !== null) {
      const latex = mathMatch[1];
      const imageFile = await generateMathImage(latex, `math_${images.length}`);
      if (imageFile) {
        images.push({
          type: 'math',
          file: imageFile,
          placeholder: mathMatch[0]
        });
      }
    }
    
    // Extract and process [GRAPH] tags
    let graphMatch;
    while ((graphMatch = imageTags.graph.exec(finalResponse)) !== null) {
      const graphCode = graphMatch[1];
      // Convert graph code to a drawing function
      const drawFunction = new Function('ctx', 'width', 'height', 'gridSize', graphCode);
      const imageFile = await generateGraphPaperSolution(drawFunction);
      if (imageFile) {
        images.push({
          type: 'graph',
          file: imageFile,
          placeholder: graphMatch[0]
        });
      }
    }
    
    // Extract and process [SOLUTION_GRAPH] tags
    let solutionMatch;
    while ((solutionMatch = imageTags.solution.exec(finalResponse)) !== null) {
      const solutionCode = solutionMatch[1];
      const drawFunction = new Function('ctx', 'width', 'height', 'gridSize', solutionCode);
      const imageFile = await generateGraphPaperSolution(drawFunction);
      if (imageFile) {
        images.push({
          type: 'solution',
          file: imageFile,
          placeholder: solutionMatch[0]
        });
      }
    }
    
    // Remove image tags from the text response
    for (const image of images) {
      finalResponse = finalResponse.replace(image.placeholder, 
        `[Gambar ${image.type === 'math' ? 'rumus matematika' : 
                    image.type === 'graph' ? 'grafik' : 'solusi'} telah dikirim]`);
    }
    
    // Format WhatsApp response
    finalResponse = formatWhatsAppResponse(finalResponse.trim());

    // Notify user about response...
    
    // Send the text response
    const finalMessage = await sock.sendMessage(m.from, {
      text: `*Jawaban Ami DeepThinking* (${responseTime}s):\n\n${finalResponse}`,
      edit: loadingMessage.key,
    });
    
    // Send any generated images
    for (const image of images) {
      await sock.sendMessage(m.from, {
        image: fs.readFileSync(image.file),
        caption: image.type === 'math' ? 'Rumus Matematika' : 
                image.type === 'graph' ? 'Grafik' : 'Solusi pada kertas berpetak'
      });
      
      // Clean up after sending
      fs.unlinkSync(image.file);
    }

    return {
      messageId: finalMessage.key.id,
      content: finalResponse,
    };
  } catch (error) {
    console.error("Error in processDeepThinkingModel:", error);
    throw error;
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
          "*Halo! Selamat datang di Ami AI Assistant* ✨\n\n" +
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
            "📌 *Tips:* Model ini cocok untuk obrolan santai dan pertanyaan sehari-hari dengan respon cepat.\n\n" +
            "✨ Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "2") {
        session.modelType = "reasoning";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami Reasoning* untuk jawaban dengan penalaran logis.\n\n" +
            "📌 *Tips:* Model ini bagus untuk pertanyaan analitis, saran, atau soal matematika sederhana.\n\n" +
            "🧠 Silakan tanyakan apapun padaku! Ketik *ami stop* untuk mengakhiri sesi.",
        });
        return;
      } else if (text === "3") {
        session.modelType = "deepthinking";
        session.modelSelected = true;
        await sock.sendMessage(m.from, {
          text:
            "✅ Kamu telah memilih *Ami DeepThinking* untuk pemikiran mendalam.\n\n" +
            "📌 *Tips:* Model ini ideal untuk soal matematika kompleks, fisika, kimia, dan topik akademis lainnya.\n\n" +
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
