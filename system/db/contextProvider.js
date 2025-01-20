import fs from "fs";
import path from "path";

const userContextPath = "./db/context/";

// Membaca data pengguna
export function readUserContext(userId) {
    const filePath = path.join(userContextPath, `${userId}.json`);
    if (!fs.existsSync(filePath)) {
        fs.mkdirSync(userContextPath, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({ history: [], memory: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(filePath));
}

// Menulis data pengguna
export function writeUserContext(userId, data) {
    const filePath = path.join(userContextPath, `${userId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Menghapus data pengguna
export function clearUserContext(userId) {
    const filePath = path.join(userContextPath, `${userId}.json`);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}