import OpenAI from "openai";
import * as chrono from "chrono-node";
import {
    readUserContext,
    writeUserContext
} from "../system/ai/context-provider.js";
import path from "path";
import fs from "fs";
import axios from "axios";
import {
    formatSize,
    rand,
    getGreeting,
    date,
    time
} from "../system/function.js";
import {
    setupAutomatedBriefing,
    generateTimedZapBrief,
    toggleAutoBriefing
} from "../system/ai/automated-zap-brief.js";

// Initialize OpenRouter API with Gemini models
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "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"
});

// Model configuration
const MODELS = {
    CHAT: "google/gemini-2.0-pro-exp-02-05:free",
    THINKING: "google/gemini-2.0-flash-thinking-exp-01-21:free",
    VISION: "google/gemini-2.0-pro-exp-02-05:free"
};

// Active chat status for each user
const activeUsers = new Map();
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Scheduler for checking reminders and scheduled tasks
const scheduledTasks = new Map();
const reminders = new Map();
let whatsappSocket = null;

/**
 * Recognize intent from user message
 * @param {string} message - Message from user
 * @param {Object} userContext - User context
 * @returns {Object} Intent and related metadata
 */
async function recognizeIntent(message, userContext) {
    try {
        // Quick shortcuts for clear intents
        const lowerMsg = message.toLowerCase();

        if (lowerMsg === "brief" || lowerMsg === "zap brief") {
            return {
                intent: "zapBrief",
                needsContext: false,
                isImportant: false,
                summary: "User requested daily brief"
            };
        }

        if (
            lowerMsg === "aktifkan zap brief" ||
            lowerMsg === "aktifkan brief" ||
            lowerMsg === "turn on zap brief" ||
            lowerMsg === "enable brief"
        ) {
            return {
                intent: "toggleBrief",
                enableBrief: true,
                needsContext: false,
                isImportant: false,
                summary: "User wants to enable automated briefing"
            };
        }

        if (
            lowerMsg === "nonaktifkan zap brief" ||
            lowerMsg === "matikan brief" ||
            lowerMsg === "turn off zap brief" ||
            lowerMsg === "disable brief"
        ) {
            return {
                intent: "toggleBrief",
                enableBrief: false,
                needsContext: false,
                isImportant: false,
                summary: "User wants to disable automated briefing"
            };
        }

        // For all other cases, use AI for analysis
        const completion = await openai.chat.completions.create({
            model: MODELS.CHAT,
            messages: [
                {
                    role: "system",
                    content: `Analyze the user message and categorize the intent. Output in JSON format:
{
  "intent": "ONE OF [chat, deepThinking, reminder, weather, news, schedule, zapBrief, image, toggleBrief]",
  "needsContext": true/false,
  "isImportant": true/false,
  "requiresDeepAnalysis": true/false,
  "entities": {
    "dates": ["dates mentioned"],
    "locations": ["locations mentioned"],
    "subjects": ["academic subjects mentioned"],
    "events": ["events mentioned"]
  },
  "summary": "brief summary of the message"
}

Intent guidelines:
- "chat": general/casual conversation
- "deepThinking": complex questions about science, math, physics, chemistry, biology
- "reminder": user wants to be reminded of something
- "weather": questions about weather
- "schedule": discussing personal schedule
- "news": questions about latest news
- "zapBrief": request for daily briefing (weather, news, trends)
- "image": if discussing an image
- "toggleBrief": if user wants to enable/disable automated ZAP Brief

"needsContext" = true if previous conversation history is needed
"isImportant" = true if contains info that should be remembered (plans, exams, events)
"requiresDeepAnalysis" = true if requires deep thinking (complex problems, scientific analysis)
          `
                },
                {
                    role: "user",
                    content: message
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        try {
            const result = JSON.parse(completion.choices[0].message.content);

            // Special handling for toggleBrief intent
            if (result.intent === "toggleBrief") {
                // Check message for enable/disable keywords
                result.enableBrief = !(
                    message.toLowerCase().includes("nonaktif") ||
                    message.toLowerCase().includes("matikan") ||
                    message.toLowerCase().includes("disable") ||
                    message.toLowerCase().includes("turn off")
                );
            }

            return result;
        } catch (e) {
            console.error("Error parsing intent JSON:", e);
            return {
                intent: "chat",
                needsContext: true,
                isImportant: false,
                summary: "General conversation"
            };
        }
    } catch (error) {
        console.error("Error recognizing intent:", error);
        return {
            intent: "chat",
            needsContext: true,
            isImportant: false,
            summary: "General conversation"
        };
    }
}

/**
 * Process and respond to user message
 * @param {Object} m - Message object from WhatsApp
 * @param {Object} sock - WhatsApp socket
 * @param {Object} db - Database
 */
async function processMessage(m, sock, db) {
    if (!m.sender || !m.body) return;

    // Store WhatsApp socket for automated briefs
    if (whatsappSocket === null) {
        whatsappSocket = sock;
        // Setup automated briefing with the socket
        setupAutomatedBriefing(sock);
    }

    // Skip if not in the processed category
    if (!m.body || m.body === "" || m.body.startsWith(".")) return;

    const userId = m.sender;
    const messageText = m.body.trim();

    // Initialize or access user context
    let userContext = readUserContext(userId);
    if (!userContext.name) {
        userContext.name = m.pushName || "Friend";
    }
    userContext.history = userContext.history || [];
    userContext.memories = userContext.memories || [];
    userContext.reminders = userContext.reminders || [];
    userContext.preferences = userContext.preferences || {};
    userContext.lastActivity = Date.now();

    // Detect if there's an image
    let hasImage = false;
    let base64Image = null;

    if (m.type === "imageMessage" && m.message) {
        hasImage = true;
        try {
            const media = await m.download();
            base64Image = media.toString("base64");
        } catch (error) {
            console.error("Error downloading image:", error);
        }
    }

    // Show typing indicator
    await sock.sendPresenceUpdate("composing", m.from);

    // Display typing indicator for a few seconds
    await new Promise(resolve => setTimeout(resolve, 1500));

    try {
        // Detect intent from message
        const intentResult = await recognizeIntent(messageText, userContext);

        // Save message in history
        userContext.history.push({
            role: "user",
            content: messageText,
            timestamp: Date.now(),
            intent: intentResult.intent
        });

        // Save important information in memories
        if (intentResult.isImportant) {
            userContext.memories.push({
                content: intentResult.summary,
                timestamp: Date.now(),
                entities: intentResult.entities || {}
            });
        }

        // Process based on intent
        let response;

        // Send "typing" indicator
        await sock.sendPresenceUpdate("composing", m.from);

        if (intentResult.intent === "toggleBrief") {
            // Handle enabling/disabling auto brief
            response = toggleAutoBriefing(userId, intentResult.enableBrief);
        } else if (hasImage) {
            // Process image
            response = await processImageMessage(
                messageText,
                base64Image,
                userContext
            );
        } else if (
            intentResult.intent === "deepThinking" ||
            intentResult.requiresDeepAnalysis
        ) {
            // Use deep thinking model for complex questions
            response = await processDeepThinkingMessage(
                messageText,
                intentResult,
                userContext
            );
        } else if (intentResult.intent === "zapBrief") {
            // Determine time of day for appropriate brief type
            const hour = new Date().getHours();
            const timeOfDay = hour >= 5 && hour < 17 ? "morning" : "evening";

            // Generate ZAP Brief for current time of day
            response = await generateTimedZapBrief(userContext, timeOfDay);
        } else if (intentResult.intent === "reminder") {
            // Process reminder
            response = await processReminder(
                messageText,
                intentResult,
                userContext,
                userId
            );
        } else if (intentResult.intent === "weather") {
            // Check weather
            response = await getWeatherInfo(
                intentResult.entities?.locations?.[0] || "Jakarta"
            );
        } else {
            // General conversation
            response = await processChatMessage(
                messageText,
                intentResult,
                userContext
            );
        }

        // Save response to history
        userContext.history.push({
            role: "assistant",
            content: response,
            timestamp: Date.now()
        });

        // Limit history (keep only the last 20 messages)
        if (userContext.history.length > 20) {
            userContext.history = userContext.history.slice(-20);
        }

        // Save context
        writeUserContext(userId, userContext);

        // Send response
        await sock.sendMessage(m.from, { text: response });
    } catch (error) {
        console.error("Error processing message:", error);
        await sock.sendMessage(m.from, {
            text: "Sorry, there was an issue processing your message. Could you try again?"
        });
    } finally {
        // Stop typing
        await sock.sendPresenceUpdate("paused", m.from);
    }
}

/**
 * Process regular chat with flash model
 */
async function processChatMessage(message, intentResult, userContext) {
    // Prepare context for model
    const context = [];

    // Add system prompt
    context.push({
        role: "system",
        content: `You are Ami, a personal AI assistant with a casual Gen Z speaking style that's helpful and friendly.

# SPEAKING STYLE:
- Use natural Indonesian Gen Z slang (not excessive)
- Avoid rigid formality
- Use emojis sparingly (1-2 emojis per message)
- Use phrases like: "btw", "sabi", "gokil", "auto", "literally", "slay", etc.
- Not too formal, but still polite and helpful
- Be cheerful, supportive, and understanding
- Use casual terms like "kamu" not "Anda"

# CAPABILITIES:
- Recognize important plans and schedules
- Provide weather and travel info
- Deliver ZAP Brief (weather summary, news, trending topics)
- Help with academic questions (especially science and math)
- Remember important info from previous conversations

# USER KNOWLEDGE:
User name: ${userContext.name}
Last active: ${new Date(userContext.lastActivity).toLocaleString("id-ID")}
Auto ZAP Brief: ${
            userContext.preferences?.disableAutomatedBrief
                ? "Disabled"
                : "Enabled"
        }

# IMPORTANT REMEMBERED INFORMATION:
${userContext.memories
    .slice(-5)
    .map(memory => `- ${memory.content}`)
    .join("\n")}

Today: ${date(Date.now())}
Time: ${time(Date.now())}
Current greeting: ${getGreeting()}

IMPORTANT:
1. DO NOT refer to yourself as an "AI language model" or other formal phrases
2. DO NOT call yourself a "virtual assistant" - you are "Ami", a digital friend
3. Give responses that are familiar, casual, and natural
4. Responses should be brief and to the point (3-5 sentences)
5. Don't explain what you're doing, just help directly
`
    });

    // Add last 5 conversations if needed
    if (intentResult.needsContext && userContext.history.length > 0) {
        // Get max 5 recent messages
        const recentHistory = userContext.history.slice(-10);
        recentHistory.forEach(msg => {
            context.push({
                role: msg.role,
                content: msg.content
            });
        });
    }

    // Add new message
    context.push({
        role: "user",
        content: message
    });

    try {
        const chatCompletion = await openai.chat.completions.create({
            model: MODELS.CHAT,
            messages: context,
            temperature: 0.7,
            max_tokens: 1024
        });

        return chatCompletion.choices[0].message.content;
    } catch (error) {
        console.error("Error processing chat message:", error);
        return "Maaf, aku lagi kesulitan memproses pesanmu. Bisa coba lagi nanti?";
    }
}

/**
 * Process questions that require deep thinking
 */
async function processDeepThinkingMessage(message, intentResult, userContext) {
    // First, use flash model to get question summary and important context
    const contextExtractionMessages = [
        {
            role: "system",
            content: `You need to identify and extract ONLY the academic question and important context. Output in format:
      
{
  "question": "main academic question", 
  "subject": "math/physics/chemistry/biology/etc",
  "relevantContext": "important information from conversation relevant to the question"
}

IMPORTANT: If there's no academic question, just return the original question.`
        },
        {
            role: "user",
            content: message
        }
    ];

    // Add context from last 3 messages if any
    if (userContext.history.length > 0) {
        const relevantHistory = userContext.history
            .filter(msg => msg.intent === "deepThinking")
            .slice(-3);

        if (relevantHistory.length > 0) {
            contextExtractionMessages.push({
                role: "system",
                content: "Here are related previous conversations:"
            });

            relevantHistory.forEach(msg => {
                contextExtractionMessages.push({
                    role: msg.role,
                    content: msg.content
                });
            });
        }
    }

    try {
        // Extract important context with flash model
        const extractionCompletion = await openai.chat.completions.create({
            model: MODELS.CHAT,
            messages: contextExtractionMessages,
            response_format: { type: "json_object" },
            temperature: 0.1
        });

        let extractedData;
        try {
            extractedData = JSON.parse(
                extractionCompletion.choices[0].message.content
            );
        } catch (e) {
            console.error("Error parsing extracted context:", e);
            extractedData = {
                question: message,
                subject: intentResult.topic || "general",
                relevantContext: ""
            };
        }

        // Now prepare prompt for thinking model
        const thinkingMessages = [
            {
                role: "system",
                content: `You are a highly intelligent and helpful academic assistant, specializing in ${
                    extractedData.subject || "various academic fields"
                }.
        
When solving problems, demonstrate:
1. Step-by-step reasoning
2. Alternative ways to understand the problem (if relevant) 
3. Easy-to-understand concept explanations
4. Detailed and clear calculations
5. Conclusions and final answers

Output format:
[Problem Understanding Summary]
...

[Step-by-Step Reasoning]
...

[Final Answer]
...

Language: Use Indonesian that's easily understood by teenagers/college students, with a casual but informative style.`
            },
            {
                role: "user",
                content: extractedData.question
            }
        ];

        // Add relevant context if any
        if (
            extractedData.relevantContext &&
            extractedData.relevantContext.trim() !== ""
        ) {
            thinkingMessages.splice(1, 0, {
                role: "system",
                content: `Additional context: ${extractedData.relevantContext}`
            });
        }

        // Run thinking model
        const thinkingCompletion = await openai.chat.completions.create({
            model: MODELS.THINKING,
            messages: thinkingMessages,
            temperature: 0.2,
            max_tokens: 4000
        });

        return thinkingCompletion.choices[0].message.content;
    } catch (error) {
        console.error("Error processing deep thinking:", error);
        return "Wah, sepertinya soal ini cukup kompleks dan aku perlu waktu lebih. Coba ajukan pertanyaannya dengan lebih detail, ya? Atau kita bisa memecahnya jadi bagian yang lebih kecil.";
    }
}

/**
 * Process image and provide analysis
 */
async function processImageMessage(message, base64Image, userContext) {
    try {
        // Step 1: Initial analysis to determine image type and needs
        const analysisMessages = [
            {
                role: "system",
                content: `Analyze this image and determine the content type and required actions. Output in JSON format:
{
  "contentType": "general_image" | "academic_problem" | "text_document" | "screenshot",
  "requiresDeepThinking": true/false,
  "academicSubject": null | "math" | "physics" | "chemistry" | "biology" | "other",
  "extractedText": "important text from the image (if any)",
  "description": "brief description of the image"
}

"requiresDeepThinking" should be true if:
1. The image contains complex academic problems
2. The content requires mathematical or scientific analysis
3. There are user instructions requesting detailed explanation
4. The problem requires step-by-step solution`
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: message || "Analyze this image"
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${base64Image}`
                        }
                    }
                ]
            }
        ];

        // Initial analysis
        const analysisCompletion = await openai.chat.completions.create({
            model: MODELS.VISION,
            messages: analysisMessages,
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        let analysis;
        try {
            analysis = JSON.parse(
                analysisCompletion.choices[0].message.content
            );
        } catch (e) {
            console.error("Error parsing image analysis:", e);
            analysis = {
                contentType: "general_image",
                requiresDeepThinking: false,
                academicSubject: null,
                extractedText: "",
                description: "Image sent by user"
            };
        }

        // Step 2: Choose model and process image
        if (analysis.requiresDeepThinking) {
            // Use deep thinking model
            const deepThinkingMessages = [
                {
                    role: "system",
                    content: `You are an academic assistant expert in ${
                        analysis.academicSubject || "various fields"
                    }.
          
Provide in-depth analysis for the academic problem/content in this image. Include:
1. Clear identification of the problem/question
2. Step-by-step reasoning
3. Explanation of relevant concepts
4. Detailed calculations if needed
5. Accurate final answer

If there's text in the image, quote it precisely. If there's a math problem, provide detailed solution with applied formulas. Use casual yet clear language like Indonesian Gen Z style, but with proper reasoning and academic accuracy.`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text:
                                message ||
                                `Help explain and solve this ${
                                    analysis.academicSubject || "academic"
                                } problem`
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ];

            const deepThinkingResponse = await openai.chat.completions.create({
                model: MODELS.THINKING, // Deep thinking model
                messages: deepThinkingMessages,
                temperature: 0.2,
                max_tokens: 4000
            });

            return deepThinkingResponse.choices[0].message.content;
        }
        // For other cases, use standard vision model
        else {
            const standardVisionMessages = [
                {
                    role: "system",
                    content: `You are Ami, an assistant with visual capabilities.
          
Based on the content type in the image (${analysis.contentType}), provide:

${
    analysis.contentType === "text_document"
        ? `- Summary of the readable text from the document
- Clean and readable formatting
- Important points from the document`
        : `- Accurate description of the image contents
- Identification of objects, people, and important elements
- Relevant context and information`
}

Language style:
- Casual and natural like Indonesian Gen Z
- Use 1-2 relevant emojis
- Start with an engaging phrase, don't begin with "In this image..."
- Response should be personal, informative, and to the point`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: message || "Take a look at this image"
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ];

            const standardVisionResponse = await openai.chat.completions.create(
                {
                    model: MODELS.VISION, // Standard vision model
                    messages: standardVisionMessages,
                    temperature: 0.7,
                    max_tokens: 1024
                }
            );

            return standardVisionResponse.choices[0].message.content;
        }
    } catch (error) {
        console.error("Error processing image:", error);
        return "Maaf, aku mengalami masalah saat memproses gambar kamu. Bisa coba kirim ulang dengan kualitas yang lebih baik?";
    }
}

/**
 * Process and save reminder
 */
async function processReminder(message, intentResult, userContext, userId) {
    try {
        // Extract date information
        const dates = intentResult.entities?.dates || [];
        let extractedDate = null;

        if (dates.length > 0) {
            extractedDate = dates[0];
        } else {
            // Use chrono-node to extract dates if not provided by intent detection
            const parsed = chrono.parse(message);
            if (parsed.length > 0) {
                extractedDate = parsed[0].start.date();
            }
        }

        if (!extractedDate) {
            return "Aku ingin mengingatkanmu, tapi sepertinya aku nggak nangkep tanggal yang jelas. Bisa kasih tau tanggalnya lebih spesifik?";
        }

        // Format the reminder
        const reminderPrompt = [
            {
                role: "system",
                content: `Create a reminder based on user message. Output JSON:
{
  "task": "what to remind",
  "date": "YYYY-MM-DD",
  "time": "HH:MM" or null,
  "description": "detailed reminder description"
}`
            },
            {
                role: "user",
                content: message
            }
        ];

        const reminderCompletion = await openai.chat.completions.create({
            model: MODELS.CHAT,
            messages: reminderPrompt,
            response_format: { type: "json_object" },
            temperature: 0.3
        });

        let reminderData;
        try {
            reminderData = JSON.parse(
                reminderCompletion.choices[0].message.content
            );
        } catch (e) {
            console.error("Error parsing reminder data:", e);
            return "Maaf, aku kesulitan membuat pengingat dari pesan kamu. Bisa coba dengan format yang lebih jelas?";
        }

        // Save the reminder
        const reminder = {
            task: reminderData.task,
            date: reminderData.date,
            time: reminderData.time,
            description: reminderData.description,
            created: Date.now()
        };

        userContext.reminders = userContext.reminders || [];
        userContext.reminders.push(reminder);

        // Format nice date for response
        const reminderDate = new Date(reminderData.date);
        const formattedDate = reminderDate.toLocaleDateString("id-ID", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });

        const timeStr = reminderData.time ? ` pukul ${reminderData.time}` : "";

        return `Sip! Aku udah bikin pengingat untuk "${reminderData.task}" pada ${formattedDate}${timeStr}. Aku akan mengingatkanmu! 📝`;
    } catch (error) {
        console.error("Error processing reminder:", error);
        return "Maaf, ada kendala saat membuat pengingat. Bisa coba lagi dengan format yang lebih jelas?";
    }
}

/**
 * Get weather info
 */
async function getWeatherInfo(location = "Jakarta") {
    try {
        const weatherPrompt = [
            {
                role: "system",
                content: `Provide weather information for "${location}". Use actual weather forecast data for date ${new Date().toLocaleDateString(
                    "id-ID"
                )}.

Output format:
🌦️ Weather Forecast for ${location}
Condition: [condition]
Temperature: [temperature in °C]
Humidity: [humidity in %]
Wind: [wind speed]
Advice: [short advice based on the weather]

INSTRUCTIONS:
1. Use actual and real weather forecast for today
2. Provide useful advice related to the weather
3. Use casual language`
            }
        ];

        const weatherCompletion = await openai.chat.completions.create({
            model: MODELS.CHAT,
            messages: weatherPrompt,
            temperature: 0.5,
            max_tokens: 512
        });

        return weatherCompletion.choices[0].message.content;
    } catch (error) {
        console.error("Error getting weather info:", error);
        return `Maaf, aku nggak bisa mendapatkan info cuaca untuk ${location} saat ini. Coba lagi nanti ya!`;
    }
}

/**
 * Scheduled task runner - to check reminders and send notifications
 */
function setupScheduledTasks() {
    // Check every 30 minutes
    setInterval(
        async () => {
            try {
                // Skip if WhatsApp socket is not available
                if (!whatsappSocket) return;

                // Get all user context files
                const contextDir = path.join(process.cwd(), "db/context");
                if (!fs.existsSync(contextDir)) return;

                const files = fs.readdirSync(contextDir);

                for (const file of files) {
                    if (!file.endsWith(".json")) continue;

                    const userId = file.replace(".json", "");
                    const userContext = readUserContext(userId);

                    // Check if there are reminders to execute
                    if (
                        !userContext.reminders ||
                        userContext.reminders.length === 0
                    )
                        continue;

                    const now = new Date();
                    const todayStr = now.toISOString().split("T")[0];

                    // Filter reminders for today
                    const todayReminders = userContext.reminders.filter(
                        r => r.date === todayStr
                    );

                    for (const reminder of todayReminders) {
                        // Create unique ID for this reminder to avoid duplicate notifications
                        const reminderId = `${userId}-${
                            reminder.date
                        }-${reminder.task.substring(0, 10)}`;

                        // Skip if already processed today
                        if (reminders.has(reminderId)) continue;

                        // If reminder has specific time, check if it's time
                        if (reminder.time) {
                            const [reminderHour, reminderMinute] = reminder.time
                                .split(":")
                                .map(Number);
                            const currentHour = now.getHours();
                            const currentMinute = now.getMinutes();

                            // Only send if within last 30 minutes (our check interval)
                            const isPastDue =
                                currentHour > reminderHour ||
                                (currentHour === reminderHour &&
                                    currentMinute >= reminderMinute);

                            const isWithinWindow =
                                (currentHour === reminderHour &&
                                    currentMinute < reminderMinute + 30) ||
                                (currentHour === reminderHour + 1 &&
                                    reminderMinute + 30 > 60 &&
                                    currentMinute < (reminderMinute + 30) % 60);

                            // Skip if not due yet or outside our window
                            if (!isPastDue || !isWithinWindow) continue;
                        }

                        // Mark this reminder as processed for today
                        reminders.set(reminderId, true);

                        // Send reminder via WhatsApp
                        try {
                            const reminderMessage = `⏰ *Pengingat!*\n\n${
                                reminder.task
                            }\n\n${reminder.description || ""}`;
                            await whatsappSocket.sendMessage(`${userId}`, {
                                text: reminderMessage
                            });
                            console.log(
                                `[REMINDER] Sent to user ${userId}: ${reminder.task}`
                            );
                        } catch (error) {
                            console.error(
                                `[REMINDER] Error sending to ${userId}:`,
                                error
                            );
                        }
                    }
                }
            } catch (error) {
                console.error("Error in scheduled tasks:", error);
            }
        },
        30 * 60 * 1000
    ); // 30 minutes
}

// Setup scheduled tasks
setupScheduledTasks();

export default function (handler) {
    handler.addFunction(async (m, { sock, db }) => {
        // Skip if not a chat
        if (!m.body) return;

        // Process message if not starting with "."
        if (!m.body.startsWith(".") && !m.body.startsWith("/")) {
            await processMessage(m, sock, db);
        }
    });
}
