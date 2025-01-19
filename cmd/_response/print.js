import logger from "../../utils/logger.js";

export default function (handler) {
    handler.addFunction(async (m, { sock, db }) => {
        if (!db.groupMetadata) db.groupMetadata = {};

        if (m.isGroup && m.from && !db.groupMetadata[m.from]) {
            try {
                const meta = await sock.groupMetadata(m.from);
                db.groupMetadata[meta.id] = meta;
                console.log(`Inserted group: ${meta.id}`);
            } catch (error) {
                console.log("Gagal insert data:", error.message);
            }
        }

        if (!m.isGroup && !m.key.remoteJid.includes("broadcast")) {
            logger.logPrivateChat(m);
        } else if (m.isGroup) {
            logger.logGroupChat(m, db);
        } else if (m.key.remoteJid.includes("broadcast")) {
            logger.logBroadcast(m);
        }
    });
}