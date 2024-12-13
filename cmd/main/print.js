export default function (handler) {
    handler.addFunction(async (m, { sock, db, color, func }) => {
        const terminalWidth = 54;
        const separatorLine = '─'.repeat(terminalWidth - 2);
        const footerText = 'Ami Bot by Ren Visualz';
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

[+] ${color.yellow(color.bold('Name:'))} ${color.green(trimmedPushName)}
[+] ${color.yellow(color.bold('Sender:'))} ${color.green(trimmedSender)}
[+] ${color.yellow(color.bold('Type Chat:'))} ${color.green(chatType)}
[+] ${color.yellow(color.bold('Type Message:'))} ${color.green(trimmedType)}
[+] ${idLine}
[+] ${color.yellow(color.bold('Message:'))} ${color.white(trimmedMessage)}

${extraDetails}
${color[headerColor](color.black(separatorLine))}
${color.black(' '.repeat((terminalWidth - footerText.length) / 2))}${color.white(footerText)}
${color[headerColor](color.black(separatorLine))}
`;
        
        if (!m.isGroup && !m.key.remoteJid.includes("broadcast")) {
            console.log(generateLog('bgMagenta', 'Private Chat'));
        } else if (m.isGroup) {
            const groupName = db.groupMetadata[m.from]?.subject || 'Unknown';
            console.log(generateLog('bgRed', 'Group Chat', `[+] ${color.yellow(color.bold('Group Name:'))} ${color.green(groupName)}`));
        } else if (m.key.remoteJid.includes("broadcast")) {
            console.log(generateLog('bgYellow', 'Status WhatsApp'));
        }
        
        // First chat
        /*if (!m.isGroup && !m.from.includes("newsletter") && !m.key.remoteJid.includes("broadcast") && db.setting.firstchat) {
            const lastChat = db.users[m.sender]?.lastChat || 0;
            if (new Date() - lastChat >= 86400000 && m.text.length > 0) {
                await sock.sendMessage(m.from, {
                    text: `Halo kak 👋\nSelamat datang di WhatsApp Bot.\nini adalah bot WhatsApp otomatis\nKetik *.menu* untuk melihat menu.\n\n> Source: https://github.com/amiruldev20/mywabot-baileys`
                }, { quoted : m });
                db.users[m.sender].lastChat = Date.now();
            }
        }*/

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
    });
}