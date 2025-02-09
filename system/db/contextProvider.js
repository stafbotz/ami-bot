import fs from "fs";
import path from "path";

const userContextPath = "./db/context/";

// Fungsi untuk memproses user ID
const processUserId = userId => userId.replace(/@s\.whatsapp\.net$/i, "");

// Fungsi untuk memastikan tipe data adalah array
const ensureArray = value => (Array.isArray(value) ? value : []);

// Fungsi untuk membaca user context
export function readUserContext(userId) {
    const processedId = processUserId(userId);
    const filePath = path.join(userContextPath, `${processedId}.json`);

    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(userContextPath, { recursive: true });
        const defaultContext = {
            history: [],
            memory: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(filePath, JSON.stringify(defaultContext, null, 2));
    }

    const userContext = JSON.parse(fs.readFileSync(filePath));

    // Memastikan history dan memory adalah array
    const { history, memory, ...rest } = userContext;

    return {
        ...rest,
        history: ensureArray(history),
        memory: ensureArray(memory)
    };
}

// Fungsi untuk menulis user context
export function writeUserContext(userId, data) {
    const processedId = processUserId(userId);
    const filePath = path.join(userContextPath, `${processedId}.json`);
    const existingData = fs.existsSync(filePath)
        ? JSON.parse(fs.readFileSync(filePath))
        : {};

    const newData = {
        ...existingData,
        ...data,
        updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
}

// Fungsi untuk menghapus user context
export function clearUserContext(userId) {
    const processedId = processUserId(userId);
    const filePath = path.join(userContextPath, `${processedId}.json`);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}
