import color from "../system/color.js";

const terminalWidth = 54;
const maxTextLength = terminalWidth - 4;

const trimText = (text) => 
    text?.length > maxTextLength ? `${text.slice(0, maxTextLength - 3)}...` : text || "Unknown";

const formatPrivateChat = (m) => {
    return `
[+] ${color.yellow(color.bold("Name:"))} ${color.green(trimText(m.pushName))}
[+] ${color.yellow(color.bold("Sender:"))} ${color.green(trimText(m.sender))}
[+] ${color.yellow(color.bold("Type Message:"))} ${color.green(trimText(m.type))}
[+] ${color.yellow(color.bold("Message ID:"))} ${color.green(trimText(m.key?.id))}
[+] ${color.yellow(color.bold("Message:"))} ${color.white(trimText(m.body))}
`;
};

const formatGroupChat = (m, db) => {
    const groupName = db.groupMetadata[m.from]?.subject || "Unknown";
    return `
[+] ${color.yellow(color.bold("Name:"))} ${color.green(trimText(m.pushName))}
[+] ${color.yellow(color.bold("Sender:"))} ${color.green(trimText(m.sender))}
[+] ${color.yellow(color.bold("Group Name:"))} ${color.green(trimText(groupName))}
[+] ${color.yellow(color.bold("Type Message:"))} ${color.green(trimText(m.type))}
[+] ${color.yellow(color.bold("Message ID:"))} ${color.green(trimText(m.key?.id))}
[+] ${color.yellow(color.bold("Message:"))} ${color.white(trimText(m.body))}
`;
};

const formatBroadcast = (m) => {
    return `
[+] ${color.yellow(color.bold("Name:"))} ${color.green(trimText(m.pushName))}
[+] ${color.yellow(color.bold("Sender:"))} ${color.green(trimText(m.sender))}
[+] ${color.yellow(color.bold("Type Message:"))} ${color.green(trimText(m.type))}
[+] ${color.yellow(color.bold("Message ID:"))} ${color.green(trimText(m.key?.id))}
[+] ${color.yellow(color.bold("Message:"))} ${color.white(trimText(m.body))}
`;
};

export default {
    formatPrivateChat,
    formatGroupChat,
    formatBroadcast,
};