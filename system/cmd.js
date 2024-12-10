/*
Terimakasih telah menggunakan source code saya. Apabila ada masalah, silahkan hubungi saya
•
Thank you for using my source code. If there is a problem, please contact me

- Facebook: fb.com/amiruldev.ci
- Instagram: instagram.com/amirul.dev
- Telegram: t.me/amiruldev20
- Github: @amiruldev20
- WhatsApp: 085157489446
*/

/* module external */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/* module internal */
import color from './color.js';

export default class CommandHandler {
    constructor() {
        this.commands = new Map();
        this.functions = new Set();
        this.prefixes = ['.', ',', '/', '\\', '#', '!'];
        this.executedCommands = new Set();
    }

    reg({ cmd, tags, desc = 'No description', noPrefix = false, isOwner = false, isLimit = false, isAdmin = false, isBotAdmin = false, isGroup = false, isPrivate = false, run, expectedArgs = {} }) {
        const commands = Array.isArray(cmd) ? cmd : [cmd];
        commands.forEach(command => {
            this.commands.set(command.toLowerCase(), { tags, desc, noPrefix, isOwner, isLimit, isAdmin, isBotAdmin, isGroup, isPrivate, run, expectedArgs });
        });
    }

    addFunction(fn) {
        this.functions.add(fn);
    }

    async loadPlugin(path) {
        try {
            const module = path.endsWith('.cjs') ? require(path) : await import(path);
            return module.default || module;
        } catch {
            console.log(color.red(`[ CMD ] Failed to load module: ${path}`));
        }
    }

    async execute(m, sock, db, func, color, util) {
        try {
            if (this.executedCommands.has(m.id)) return false;
            this.executedCommands.add(m.id);

            for (const fn of this.functions) {
                try {
                    await fn(m, { sock, db, color, func });
                } catch (error) {
                    console.error("[ERROR] Error in function handler:", error);
                }
            }

            if (!m.body) return false;
            const text = m.body.trim();
            const gc = m.isGroup ? db.groups[m.from] : false;
            const usr = db.users[m.sender] || {};

            // mute gc
            if (m.isGroup && gc.mute && !m.isOwner) return false;

            // self mode
            if (db.setting.self && !m.isOwner && !m.key.fromMe) return false;

            // autoread
            if (db.setting.autoread) {
                await sock.readMessages([m.key]);
            }

            await this.readStory(sock, db, m);

            const prefixMatched = this.prefixes.find(p => text.startsWith(p));
            if (prefixMatched) {
                return await this.handleCommand(text, prefixMatched, m, sock, db, func, color, util, usr);
            }
            return await this.handleNoPrefixCommand(text, m, sock, db, func, color, util);
        } catch (error) {
            console.error("[ERROR] Error in execute method:", error);
            return false;
        }
    }

    async readStory(sock, db, m) {
        const maxTime = 5 * 60 * 1000; // 5 menit
        if (db.setting.readstory && m.type !== 'protocolMessage' && m.key.remoteJid == "status@broadcast" && m.type !== 'reactionMessage') {
            const currentTime = Date.now();
            const messageTime = m.timestamps * 1000;
            const timeDiff = currentTime - messageTime;
            if (timeDiff <= maxTime) {
                await sock.readMessages([m.key]);
                const key = m.key;
                const emot = ["🥀", "✨", "👌", "💥", "🔥", "🌟"];
                const emoji = emot[Math.floor(Math.random() * emot.length)];
                const names = await sock.getName(m.key.participant);
                const message = `Berhasil read story\nname: ${m.pushName} - ${names}\njid: ${m.key.participant.split("@")[0]}`;
                await sock.sendMessage(m.key.remoteJid, { react: { key, text: emoji } }, { statusJidList: [key.participant, m.sender] });
                console.log(`[ READ STORY ] FROM ${m.pushName} - react: ${emoji}`);
                await sock .sendMessage(`${db.setting.owner[0]}@s.whatsapp.net`, { text: message });
            }
        }
    }

    async cmd(command, usr, sock, m, db) {
        const rand = (length = 32) => {
            const chars = '0123456789ABCDEF';
            return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        };

        // Check user status
        if (command && usr.banned) {
            await sock.sendMessage(m.from, { text: '_Ops... anda dibanned dari bot!!_', contextInfo: { isForwarded: 1337, forwardedNewsletterMessageInfo: { newsletterJid: "120363181344949815@newsletter", serverMessageId: -1, newsletterName: "🔥 LightWeight WhatsApp Bot" } } }, { quoted: m, ephemeralExpiration: m.expiration, messageId: rand() });
            return true;
        }

        // Check limit
        if (command.isLimit) {
            const limitUsage = typeof command.isLimit === 'number' ? command.isLimit : 1;
            if (usr.limit < limitUsage) {
                await sock.sendMessage(m.from, { text: `Penggunaan limit harian anda telah habis, Perintah ini\nmembutuhkan *${limitUsage} Limit*\n\nLimit direset setiap pukul *${db.setting.limit.reset} WIB*, gunakan kembali setelah limit direset\n\nAtau kamu bisa topup untuk membeli limit tambahan dengan menggunakan perintah \`#buylimit\` atau bisa juga dengan upgrade akun ke premium untuk mendapatkan lebih banyak limit \`#buyprem 30\``, contextInfo: { isForwarded: 1337, forwardedNewsletterMessageInfo: { newsletterJid: "120363181344949815@newsletter", serverMessageId: -1, newsletterName: "🔥 LightWeight WhatsApp Bot" } } }, { quoted: m, ephemeralExpiration: m.expiration, messageId: rand() });
                return true;
            } else {
                usr.limit -= limitUsage;
            }
        }

        // Check owner
        if (command.isOwner && !m.isOwner && !m.key.fromMe) {
            await sock.sendMessage(m.from, { text: '_Fitur ini hanya untuk owner!!_', contextInfo: { isForwarded: 1337, forwardedNewsletterMessageInfo: { newsletterJid: "120363181344949815@newsletter", serverMessageId: -1, newsletterName: "🔥 LightWeight WhatsApp Bot" } } }, { quoted: m, ephemeralExpiration: m.expiration, messageId: rand() });
            return true;
        }

        // Check group
        if (command.isGroup && !m.isGroup) {
            await sock.sendMessage(m.from, { text: '_Fitur ini hanya dapat digunakan didalam grup!!_', contextInfo: { isForwarded: 1337, forwardedNewsletterMessageInfo: { newsletterJid: "120363181344949815@newsletter", serverMessageId: -1, newsletterName: "🔥 LightWeight WhatsApp Bot" } } }, { quoted: m, ephemeralExpiration: m.expiration, messageId: rand() });
            return true;
        }

        // Check admin
        if (command.isAdmin && !m.isAdmin) {
            await sock.sendMessage(m.from, { text: '_Fitur ini hanya untuk admin grup!!_', contextInfo: { isForwarded: 1337, forwardedNewsletterMessageInfo: { newsletterJid: "120363181344949815@newsletter", serverMessageId: -1, newsletterName: "🔥 LightWeight WhatsApp Bot" } } }, { quoted: m, ephemeralExpiration: m.expiration, messageId: rand() });
            return true;
        }

        // Check bot admin
        if (command.isBotAdmin && !m.isBotAdmin) {
            await sock.sendMessage(m.from, { text: '_Untuk menggunakan fitur ini, bot harus menjadi admin grup!!_', contextInfo: { isForwarded: 1337, forwardedNewsletterMessageInfo: { newsletterJid: "120363181344949815@newsletter", serverMessageId: -1, newsletterName: "🔥 LightWeight WhatsApp Bot" } } }, { quoted: m, ephemeralExpiration: m.expiration, messageId: rand() });
            return true;
        }

        // Check private
        if (command.isPrivate && m.isGroup) {
            await sock.sendMessage(m.from, { text: '_Fitur ini hanya dapat digunakan di private chat!!_', contextInfo: { isForwarded: 1337, forwardedNewsletterMessageInfo: { newsletterJid: "120363181344949815@newsletter", serverMessageId: -1, newsletter Name: "🔥 LightWeight WhatsApp Bot" } } }, { quoted: m, ephemeralExpiration: m.expiration, messageId: rand() });
            return true;
        }
    }

    async handleCommand(text, prefix, m, sock, db, func, color, util, usr) {
        const [cmd, ...args] = text.slice(prefix.length).trim().split(' ');
        const command = this.commands.get(cmd.toLowerCase());

        if (command && !command.noPrefix) {
            const mcmd = await this.cmd(command, usr, sock, m, db);
            if (mcmd) return;
            try {
                const parsedArgs = this.parseArguments(args, command.expectedArgs);
                await command.run(m, { sock, args: parsedArgs, db, util, color, func, cmds: this.commands });
                return true;
            } catch (error) {
                console.error("[ERROR] Error executing prefixed command:", error);
            }
        }
        return false;
    }

    async handleNoPrefixCommand(text, m, sock, db, func, color, util) {
        const [potentialCmd, ...args] = text.split(' ');
        const command = this.commands.get(potentialCmd.toLowerCase());
        const usr = db.users[m.sender] || {};

        if (command && command.noPrefix) {
            const mcmd = await this.cmd(command, usr, sock, m, db);
            if (mcmd) return;
            try {
                const parsedArgs = this.parseArguments(args, command.expectedArgs);
                await command.run(m, { sock, args: parsedArgs, db, util, color, func, cmds: this.commands });
                return true;
            } catch (error) {
                console.error("[ERROR] Error executing non-prefixed command:", error);
            }
        }
        return false;
    }

    parseArguments(args, expectedArgs) {
        const argObject = {};
        args.forEach(arg => {
            const [key, value] = arg.split('=');
            if (expectedArgs[key]) argObject[key] = value || true;
        });
        return argObject;
    }

    clear() {
        this.commands.clear();
        this.functions.clear();
        this.executedCommands.clear();
    }
}