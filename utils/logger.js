import color from "../system/color.js";
import formatter from "./formatter.js";

const log = (headerColor, type, details) => {
    const terminalWidth = 54;
    const separatorLine = "─".repeat(terminalWidth - 2);
    const footerText = "Ami Bot by Ren Visualz";

    console.log(`
${color[headerColor](color.black(separatorLine))}
${color.yellow(type.padStart((terminalWidth + type.length) / 2))}
${color[headerColor](color.black(separatorLine))}

${details}

${color[headerColor](color.black(separatorLine))}
${color.black(" ".repeat((terminalWidth - footerText.length) / 2))}${color.white(footerText)}
${color[headerColor](color.black(separatorLine))}
`);
};

const logPrivateChat = (m) => {
    const details = formatter.formatPrivateChat(m);
    log("bgMagenta", "Private Chat", details);
};

const logGroupChat = (m, db) => {
    const details = formatter.formatGroupChat(m, db);
    log("bgRed", "Group Chat", details);
};

const logBroadcast = (m) => {
    const details = formatter.formatBroadcast(m);
    log("bgYellow", "Status WhatsApp", details);
};

export default {
    logPrivateChat,
    logGroupChat,
    logBroadcast,
};