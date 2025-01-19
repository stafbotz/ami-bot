import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default handler => {
    handler.reg({
        cmd: ["menu", "list", "help", "start"],
        tags: "main",
        desc: "Show all commands",
        run: async (m, { sock, cmds, db, func }) => {
            const commandGroups = {};
            const tagEmojis = {
                main: "📜",
                convert: "🔄",
                ai: "🤖",
                downloader: "📥",
                group: "👥",
                channel: "📣",
                owner: "🛠",
                tools: "🛠",
                anime: "🍥",
                lainnya: "📌"
            };

            const baseDir = path.join(__dirname);

            if (!fs.existsSync(baseDir)) {
                console.error(`[ERROR] Directory not found: ${baseDir}`);
                await m.reply("Command directory not found.");
                return;
            }

            const loadCommands = dir => {
                const items = fs.readdirSync(dir);
                items.forEach(item => {
                    const itemPath = path.join(dir, item);
                    if (fs.statSync(itemPath).isDirectory()) {
                        loadCommands(itemPath);
                    } else if (path.extname(item) === ".js") {
                        import(itemPath)
                            .then(commandModule => {
                                if (commandModule.default) {
                                    commandModule.default(handler);
                                }
                            })
                            .catch(error => {
                                console.error(
                                    `[ERROR] Failed to load command from ${itemPath}:`,
                                    error
                                );
                            });
                    }
                });
            };

            loadCommands(baseDir);

            for (const [command, details] of cmds) {
                const tag = details.tags || "lainnya";

                // Jangan tambahkan tag owner jika user bukan owner
                if (tag === "owner" && !m.isOwner) continue;

                if (!commandGroups[tag]) {
                    commandGroups[tag] = [];
                }

                const commandText = `│๑ *.${command}* - ${details.desc}`;

                if (!commandGroups[tag].includes(commandText)) {
                    commandGroups[tag].push(commandText);
                }
            }

            const greetings = `Hai, *@${m.sender.split("@")[0]}* 👋\n\n`;
            const mySpace = `*MY SPACE*\n│Vibe : *Senang*\n│Zodiac : *Libra*\n│Saldo : *Rp 0*\n ✦ Ketik *.myspace* buat atur tampilan space kamu.\n\n`;
            const intro = `Aku di sini untuk bantu kamu dengan berbagai fitur seru. Yuk, cek apa aja yang bisa aku lakukan:\n\n`;

            let menu = "";
            let counter = 1;

            for (const [tag, commands] of Object.entries(commandGroups)) {
                const emoji = tagEmojis[tag] || tagEmojis["lainnya"];
                const tagName = tag.toUpperCase();
                menu += `${emoji} *${tagName}*\n`;
                commands.forEach(command => {
                    menu += `${command}\n`;
                    counter++;
                });
                menu += "\n";
            }

            const allMenu = `${greetings}${mySpace}${intro}${menu.trim()}`;
            const maxChars = 1300;
            const pages = [];

            // Menghindari TypeError dengan menggunakan variabel `let`
            let remainingMenu = allMenu;
            while (remainingMenu.length > 0) {
                if (remainingMenu.length > maxChars) {
                    const splitIndex = remainingMenu.lastIndexOf(
                        "\n\n",
                        maxChars
                    );
                    pages.push(remainingMenu.slice(0, splitIndex).trim());
                    remainingMenu = remainingMenu.slice(splitIndex).trim();
                } else {
                    pages.push(remainingMenu.trim());
                    remainingMenu = "";
                }
            }

            const pageRequested = parseInt(m.body.split(" ")[1] || "1");
            const selectedPage = pages[pageRequested - 1];

            if (selectedPage) {
                const footer = `\n\n✦ Halaman ${pageRequested} dari ${
                    pages.length
                }\n✦ Ketik *.menu ${
                    pageRequested + 1
                }* untuk ke halaman berikutnya.\n✦ Chat *Ami AI* dengan ketik *Ami*\n\n╶ 𝗧𝗵𝗮𝗻𝗸 𝘆𝗼𝘂 🎀`;
                const response =
                    pageRequested === 1
                        ? greetings + mySpace + selectedPage + footer
                        : selectedPage + footer;
                await sock.sendMessage(
                    m.from,
                    { text: response },
                    { quoted: m }
                );
            } else {
                await sock.sendMessage(
                    m.from,
                    {
                        text: `Halaman ${pageRequested} tidak ditemukan. Total halaman: ${pages.length}.`
                    },
                    { quoted: m }
                );
            }
        }
    });
};
