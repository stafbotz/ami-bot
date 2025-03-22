import fs from "fs";
import path from "path";

const userContextPath = "./db/context/";

/**
 * Memproses ID pengguna
 * @param {string} userId - ID pengguna dari WhatsApp
 * @returns {string} ID yang diproses
 */
const processUserId = userId => userId.replace(/@s\.whatsapp\.net$/i, "");

/**
 * Memastikan value adalah array
 * @param {any} value - Nilai yang akan dicek
 * @returns {Array} Array
 */
const ensureArray = value => (Array.isArray(value) ? value : []);

/**
 * Membaca konteks pengguna dari penyimpanan
 * @param {string} userId - ID pengguna
 * @returns {Object} Konteks pengguna
 */
export function readUserContext(userId) {
    const processedId = processUserId(userId);
    const filePath = path.join(userContextPath, `${processedId}.json`);

    // Buat direktori jika belum ada
    if (!fs.existsSync(userContextPath)) {
        fs.mkdirSync(userContextPath, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
        const defaultContext = {
            history: [],
            memories: [],
            reminders: [],
            preferences: {},
            lastActivity: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(filePath, JSON.stringify(defaultContext, null, 2));
    }

    try {
        const userContext = JSON.parse(fs.readFileSync(filePath));

        // Pastikan semua array ada
        const { history = [], memories = [], reminders = [], ...rest } = userContext;

        return {
            ...rest,
            history: ensureArray(history),
            memories: ensureArray(memories),
            reminders: ensureArray(reminders)
        };
    } catch (error) {
        console.error(`Error reading context for ${userId}:`, error);
        // Kembalikan konteks default jika terjadi error
        return {
            history: [],
            memories: [],
            reminders: [],
            preferences: {},
            lastActivity: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
}

/**
 * Menulis konteks pengguna ke penyimpanan
 * @param {string} userId - ID pengguna
 * @param {Object} data - Data yang akan disimpan
 */
export function writeUserContext(userId, data) {
    const processedId = processUserId(userId);
    const filePath = path.join(userContextPath, `${processedId}.json`);
    
    // Buat direktori jika belum ada
    if (!fs.existsSync(userContextPath)) {
        fs.mkdirSync(userContextPath, { recursive: true });
    }

    try {
        const existingData = fs.existsSync(filePath)
            ? JSON.parse(fs.readFileSync(filePath))
            : {};

        const newData = {
            ...existingData,
            ...data,
            updatedAt: new Date().toISOString()
        };

        fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
    } catch (error) {
        console.error(`Error writing context for ${userId}:`, error);
    }
}

/**
 * Menghapus konteks pengguna
 * @param {string} userId - ID pengguna
 */
export function clearUserContext(userId) {
    const processedId = processUserId(userId);
    const filePath = path.join(userContextPath, `${processedId}.json`);

    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (error) {
            console.error(`Error clearing context for ${userId}:`, error);
        }
    }
}

/**
 * Mengambil semua informasi penting dari konteks pengguna
 * @param {string} userId - ID pengguna
 * @returns {Object} Informasi penting
 */
export function getUserImportantInfo(userId) {
    const context = readUserContext(userId);
    
    return {
        memories: context.memories || [],
        reminders: context.reminders || [],
        preferences: context.preferences || {}
    };
}

/**
 * Menambahkan pengingat baru
 * @param {string} userId - ID pengguna
 * @param {Object} reminder - Data pengingat
 */
export function addReminder(userId, reminder) {
    const context = readUserContext(userId);
    
    context.reminders = context.reminders || [];
    context.reminders.push({
        ...reminder,
        created: new Date().toISOString()
    });
    
    writeUserContext(userId, { reminders: context.reminders });
}

/**
 * Menambahkan informasi penting ke memori
 * @param {string} userId - ID pengguna
 * @param {string} content - Konten memori
 * @param {Object} entities - Entitas terkait (tanggal, lokasi, dll)
 */
export function addMemory(userId, content, entities = {}) {
    const context = readUserContext(userId);
    
    context.memories = context.memories || [];
    context.memories.push({
        content,
        entities,
        timestamp: new Date().toISOString()
    });
    
    writeUserContext(userId, { memories: context.memories });
}