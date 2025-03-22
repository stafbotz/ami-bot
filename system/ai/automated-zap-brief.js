import { readUserContext, writeUserContext } from "./context-provider.js";
import schedule from "node-schedule";
import path from "path";
import fs from "fs";
import { getGreeting, date, time } from "./function.js";
import OpenAI from "openai";

// Initialize OpenRouter API
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: "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"
});

// Model configuration
const MODELS = {
    CHAT: "google/gemini-2.0-pro-exp-02-05:free"
};

/**
 * Setup automated ZAP Brief scheduler
 * @param {Object} sock - WhatsApp socket for sending messages
 */
function setupAutomatedBriefing(sock) {
    // Schedule morning brief - every day at 6:00 AM
    schedule.scheduleJob("0 6 * * *", async () => {
        console.log("[SCHEDULER] Running morning ZAP Brief");
        await sendAutomatedBrief(sock, "morning");
    });

    // Schedule evening brief - every day at 8:00 PM
    schedule.scheduleJob("0 20 * * *", async () => {
        console.log("[SCHEDULER] Running evening ZAP Brief");
        await sendAutomatedBrief(sock, "evening");
    });

    console.log("[SCHEDULER] Automated ZAP Brief scheduled successfully");
}

/**
 * Send automated ZAP Brief to all active users
 * @param {Object} sock - WhatsApp socket
 * @param {string} timeOfDay - 'morning' or 'evening'
 */
async function sendAutomatedBrief(sock, timeOfDay) {
    try {
        // Get all user context files
        const contextDir = path.join(process.cwd(), "db/context");
        if (!fs.existsSync(contextDir)) return;

        const files = fs.readdirSync(contextDir);

        for (const file of files) {
            if (!file.endsWith(".json")) continue;

            const userId = file.replace(".json", "");
            const userContext = readUserContext(userId);

            // Skip users who have opted out of automated briefs
            if (userContext.preferences?.disableAutomatedBrief) continue;

            // Skip users who haven't been active in the last 7 days
            const lastActivity = new Date(userContext.lastActivity || 0);
            const daysSinceLastActivity =
                (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
            if (daysSinceLastActivity > 7) continue;

            // Generate appropriate brief
            const brief = await generateTimedZapBrief(userContext, timeOfDay);

            // Send the brief
            try {
                await sock.sendMessage(`${userId}`, { text: brief });
                console.log(
                    `[ZAP BRIEF] Sent ${timeOfDay} brief to user ${userId}`
                );
            } catch (error) {
                console.error(`[ZAP BRIEF] Error sending to ${userId}:`, error);
            }
        }
    } catch (error) {
        console.error("[ZAP BRIEF] Error in automated brief:", error);
    }
}

/**
 * Generate a ZAP Brief customized for morning or evening
 * @param {Object} userContext - User context
 * @param {string} timeOfDay - 'morning' or 'evening'
 * @returns {string} The generated brief
 */
async function generateTimedZapBrief(userContext, timeOfDay) {
    try {
        const isMorning = timeOfDay === "morning";

        const zapPrompt = [
            {
                role: "system",
                content: `Create a ${
                    isMorning ? "Morning" : "Evening"
                } ZAP Brief for user named ${userContext.name || "Friend"}.

${
    isMorning
        ? `
# MORNING BRIEF FORMAT:
## 🌅 Good Morning ZAP Brief

### 🌦️ Today's Weather
[local weather info & forecast for the day]

### 📅 Your Day Ahead
[up to 3 important activities from user schedule or reminders]

### 📰 Morning Headlines
[3 important news that happened overnight or this morning]

### 💡 Today's Productivity Tip
[quick productivity or wellness tip for the day]

### 🗓️ On This Day
[interesting historical fact that happened on this day]

---
*Morning ZAP Brief by Ami - ${new Date().toLocaleDateString("id-ID")}*
`
        : `
# EVENING BRIEF FORMAT:
## 🌙 Evening ZAP Brief

### 📰 Today's Top Stories
[3 most important news of the day]

### 🔥 What's Trending Now
[3 trending topics on social media/internet right now]

### 🏆 Sports Updates
[important sports news/scores from today]

### 📺 Evening Entertainment
[1-2 suggestions for shows, movies, or content to enjoy tonight]

### 📆 Tomorrow's Preview
[weather forecast & important events for tomorrow]

---
*Evening ZAP Brief by Ami - ${new Date().toLocaleDateString("id-ID")}*
`
}

INSTRUCTIONS:
1. Create informative and concise content tailored for ${
                    isMorning ? "starting the day" : "winding down the evening"
                }
2. Use actual data (weather, news, trends) from Indonesia
3. Use casual, friendly Indonesian Gen Z language style
4. Keep it concise - maximum 15 lines total
5. Content should feel personalized and directly useful to the user
6. Include 2-3 emojis in total (not per line)
7. Use actual ${isMorning ? "morning" : "evening"} appropriate information`
            }
        ];

        // Add reminders if any
        if (userContext.reminders && userContext.reminders.length > 0) {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const todayStr = today.toISOString().split("T")[0];
            const tomorrowStr = tomorrow.toISOString().split("T")[0];

            // For morning brief, show today's reminders
            // For evening brief, show tomorrow's reminders
            const relevantReminders = userContext.reminders.filter(
                r => r.date === (isMorning ? todayStr : tomorrowStr)
            );

            if (relevantReminders.length > 0) {
                zapPrompt[0].content += `\n\nUser reminders ${
                    isMorning ? "for today" : "for tomorrow"
                }:\n${relevantReminders
                    .map(
                        r =>
                            `- ${r.task} (${
                                r.time ? "at " + r.time : "all day"
                            })`
                    )
                    .join("\n")}`;
            }
        }

        // Add memories that might be relevant to today
        if (userContext.memories && userContext.memories.length > 0) {
            // Filter memories that might be relevant to today (like past events on this date)
            const potentiallyRelevantMemories = userContext.memories
                .filter(memory => {
                    // Check if memory has a date entity that matches today's date (ignoring year)
                    if (memory.entities?.dates) {
                        const today = new Date();
                        for (const dateStr of memory.entities.dates) {
                            try {
                                const memoryDate = new Date(dateStr);
                                if (
                                    memoryDate.getDate() === today.getDate() &&
                                    memoryDate.getMonth() === today.getMonth()
                                ) {
                                    return true;
                                }
                            } catch (e) {
                                // Skip invalid dates
                            }
                        }
                    }
                    return false;
                })
                .slice(0, 2); // Limit to 2 memories maximum

            if (potentiallyRelevantMemories.length > 0) {
                zapPrompt[0].content += `\n\nRelevant user memories that might be important today:\n${potentiallyRelevantMemories
                    .map(m => `- ${m.content}`)
                    .join("\n")}`;
            }
        }

        const zapCompletion = await openai.chat.completions.create({
            model: MODELS.CHAT,
            messages: zapPrompt,
            temperature: 0.7,
            max_tokens: 1024
        });

        return zapCompletion.choices[0].message.content;
    } catch (error) {
        console.error(`Error generating ${timeOfDay} ZAP Brief:`, error);
        return `Maaf, aku nggak bisa menghasilkan ZAP Brief ${
            timeOfDay === "morning" ? "pagi" : "malam"
        } saat ini. Coba lagi nanti ya!`;
    }
}

/**
 * Toggle auto-briefing preference for a user
 * @param {string} userId - User ID
 * @param {boolean} enabled - Whether auto-briefing should be enabled
 * @returns {string} Confirmation message
 */
function toggleAutoBriefing(userId, enabled) {
    try {
        const userContext = readUserContext(userId);

        // Initialize preferences if not exists
        userContext.preferences = userContext.preferences || {};

        // Set auto-briefing preference
        userContext.preferences.disableAutomatedBrief = !enabled;

        // Save context
        writeUserContext(userId, userContext);

        return enabled
            ? "ZAP Brief otomatis sudah diaktifkan! Kamu akan menerima briefing setiap pagi (jam 6) dan malam (jam 8). Semoga harimu menyenangkan! ✨"
            : "ZAP Brief otomatis sudah dinonaktifkan. Kamu masih bisa mendapatkan ZAP Brief kapan saja dengan mengetik 'zap brief'.";
    } catch (error) {
        console.error("Error toggling auto-briefing:", error);
        return "Maaf, ada masalah saat mengubah pengaturan ZAP Brief. Coba lagi nanti ya!";
    }
}

// Export functions to be used
export { setupAutomatedBriefing, generateTimedZapBrief, toggleAutoBriefing };
