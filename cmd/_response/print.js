export default function (handler) {
    handler.addFunction(async (m, { sock, db, color, func }) => {
        const terminalWidth = 54;
        const separatorLine = '─'.repeat(terminalWidth - 2);
        const footerText = 'whatsapp bot by amirul dev';
        const maxTextLength = terminalWidth - 4;

        const trimText = (text) => text?.length > maxTextLength ? `${text.slice(0, maxTextLength - 3)}...` : text || 'Unknown';

        const [trimmedPushName, trimmedSender, trimmedFrom, trimmedType, trimmedKeyId, trimmedMessage] = [
            m.pushName,
            m.sender,
            m.from,
            m.type,
            m.key?.id,
            m.body || 'No message'
        ].map(trimText);

        const idLine = `${color.yellow(color.bold('ID: '))} ${color.green(trimmedKeyId)}`;

        const generateLog = (headerColor, chatType, extraDetails = '') => `
${color[headerColor](color.black(separatorLine))}
${color.yellow('LOG CHAT'.padStart((terminalWidth + 'LOG CHAT'.length) / 2))}
${color[headerColor](color.black(separatorLine))}

[+] ${color.yellow(color.bold('NAME:'))} ${color.green(trimmedPushName)}
[+] ${color.yellow(color.bold('SENDER:'))} ${color.green(trimmedSender)}
[+] ${color.yellow(color.bold('Type Chat:'))} ${color.green(chatType)}
[+] ${color.yellow(color.bold('Type Message:'))} ${color.green(trimmedType)}
[+] ${idLine}
[+] ${color.yellow(color.bold('Message:'))} ${color.white(trimmedMessage)}

${extraDetails}
${color[headerColor](color.black(separatorLine))}
${color.black(' '.repeat((terminalWidth - footerText.length) / 2))}${color.white(footerText)}
${color[headerColor](color.black(separatorLine))}
`;

        const logChat = () => {
            if (!m.isGroup && !m.key.remoteJid.includes("broadcast")) {
                console.log(generateLog('bgMagenta', 'Private Chat'));
            } else if (m.isGroup) {
                const groupName = db.groupMetadata[m.from]?.subject || 'Unknown';
                console.log(generateLog('bgRed', 'Group Chat', `[+] ${color.yellow(color.bold('Group Name:'))} ${color.green(groupName)}`));
            } else if (m.key.remoteJid.includes("broadcast")) {
                console.log(generateLog('bgYellow', 'Status WhatsApp'));
            }
        };

        logChat();

        // Handle .sc command
        if (m.body === ".sc") {
            m.reply(`Hai kak *${m.pushName}* 👋\n\nScript ini menggunakan source publik dari Amirul Dev.\n> Source: https://github.com/amiruldev20/mywabot-baileys`);
        }

        // Reset limit
        let hasReset = false;
        setInterval(() => {
            const [resetHour, resetMinute] = db.setting.limit.reset.split(":").map(Number);
            const now = new Date();
            if (now.getHours() === resetHour && now.getMinutes() === resetMinute && !hasReset) {
                Object.keys(db.users).forEach(id => {
                    const user = db.users[id];
                    user.limit = db.setting.owner.includes(id.split("@")[0])
                        ? db.setting.limit.own
                        : user.premium
                        ? db.setting.limit.prem
                        : db.setting.limit.free;
                });
                hasReset = true;
                console.log("[ + ] RESET LIMIT SUCCESSFULLY");
            }
            if (now.getHours() === 0 && now.getMinutes() === 0) hasReset = false;
        }, 60000);

        // First chat
        if (!m.isGroup && !m.from.includes("newsletter") && !m.key.remoteJid.includes("broadcast") && db.setting.firstchat) {
            const lastChat = db.users[m.sender]?.lastChat || 0;
            if (new Date() - lastChat >= 86400000 && m.text.length > 0) {
                await sock.sendMessage(m.from, {
                    text: `Halo kak 👋\nSelamat datang di WhatsApp Bot.\nini adalah bot WhatsApp otomatis\nKetik *.menu* untuk melihat menu.\n\n> Source: https://github.com/amiruldev20/mywabot-baileys`
                }, { quoted : m });
                db.users[m.sender].lastChat = Date.now();
            }
        }

        if (!db.groupMetadata) {
            db.groupMetadata = {};
        }

        if (m.isGroup && m.from && !db.groupMetadata[m.from]) {
            try {
                const meta = await sock.groupMetadata(m.from);
                db.groupMetadata[meta.id] = meta;
                console.log(`Inserted group: ${meta.id}`);
            } catch (error) {
                console.log("Gagal insert data:", error.message);
            }
        }

        logChat();
    });
}