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
import { createRequire } from "module";
const require = createRequire(import.meta.url);

/* module internal */
import color from "./color.js";

export default class CommandHandler {
    constructor() {
        this.commands = new Map();
        this.functions = new Set();
        this.prefixes = [".", ",", "/", "\\", "#", "!"];
        this.executedCommands = new Set();
    }

    reg({
        cmd,
        tags,
        desc = "No description",
        noPrefix = false,
        isOwner = false,
        isLimit = false,
        isAdmin = false,
        isBotAdmin = false,
        isGroup = false,
        isPrivate = false,
        run,
        expectedArgs = {}
    }) {
        const commands = Array.isArray(cmd) ? cmd : [cmd];
        commands.forEach(command => {
            this.commands.set(command.toLowerCase(), {
                tags,
                desc,
                noPrefix,
                isOwner,
                isLimit,
                isAdmin,
                isBotAdmin,
                isGroup,
                isPrivate,
                run,
                expectedArgs
            });
        });
    }

    addFunction(fn) {
        this.functions.add(fn);
    }

    async loadPlugin(path) {
        try {
            const module = path.endsWith(".cjs")
                ? require(path)
                : await import(path);
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

            if (
                db.setting.readstory &&
                m.type !== "protocolMessage" &&
                m.key.remoteJid == "status@broadcast" &&
                m.type !== "reactionMessage"
            ) {
                const maxTime = 5 * 60 * 1000; // 5 menit
                const currentTime = Date.now();
                const messageTime = m.timestamps * 1000;
                const timeDiff = currentTime - messageTime;
                if (timeDiff <= maxTime) {
                    await sock.readMessages([m.key]);
                    const key = m.key;
                    const emots = [
                        "😖",
                        "😣",
                        "😓",
                        "🙂",
                        "😊",
                        "😇",
                        "🐱",
                        "🥲",
                        "😭",
                        "🥹",
                        "😯",
                        "😔",
                        "😴",
                        "🙃",
                        "☺️",
                        "😄",
                        "😋",
                        "😏",
                        "😐",
                        "🙄"
                    ];
                    const emoji =
                        emots[Math.floor(Math.random() * emots.length)];
                    const names = await sock.getName(m.key.participant);
                    if (db.setting.reactstory)
                        await sock.sendMessage(
                            m.key.remoteJid,
                            { react: { key, text: emoji } },
                            { statusJidList: [key.participant, m.sender] }
                        );
                    const message = `Berhasil read story\nname: ${
                        m.pushName
                    } - ${names}\njid: ${m.key.participant.split("@")[0]}${
                        db.setting.reactstory ? "\nreact: " + emoji : ""
                    }`;
                    console.log(
                        `[ READ STORY ] FROM ${m.pushName} ${
                            db.setting.reactstory ? "- react: " + emoji : ""
                        }`
                    );
                    await sock.sendMessage(
                        `${db.setting.owner[0]}@s.whatsapp.net`,
                        { text: message }
                    );
                }
            }

            const prefixMatched = this.prefixes.find(p => text.startsWith(p));
            if (!usr.register && !usr.banned) {
                await this.handleRegister(usr, sock, m, db, prefixMatched);
                return false;
            }

            if (prefixMatched) {
                return await this.handleCommand(
                    text,
                    prefixMatched,
                    m,
                    sock,
                    db,
                    func,
                    color,
                    util,
                    usr
                );
            }
            return await this.handleNoPrefixCommand(
                text,
                m,
                sock,
                db,
                func,
                color,
                util
            );
        } catch (error) {
            console.error("[ERROR] Error in execute method:", error);
            return false;
        }
    }

    async handleRegister(usr, sock, m, db, prefix) {
        // daftar badwords
        const badwords =
            /(anj[kg]|ajn[gk]|a?njin[gk]|bajingan|b[a]?[n]?gsa?t|ko?nto?l|me?me?[kq]|pe?pe?[kq]|meki|titi[t,d]|pe?ler|tetek|toket|ngewe|go?blo?k|to?lo?l|idiot|[kng]e?nto?[t,d]|jembut|bego|dajjal|janc[uo]k|pantek|puki?(mak)?|kimak|kampang|lonte|col[i,mek]|pelacur|henceut|nigga|fuck|dick|bitch|tits|bastard|asshole|a[su,w,yu])/i;

        if (!usr.progressreg) {
            await sock.sendMessage(
                m.from,
                {
                    text: "Hai! 👋 Aku Ami Bot, kita kenalan dulu yuk, biar lebih akrab. Nama kamu siapa, ya? ☺️"
                },
                { quoted: m, ephemeralExpiration: m.expiration }
            );
            usr.progressreg = 1;
            return;
        }
        if (usr.progressreg === 1) {
            if (prefix)
                await sock.sendMessage(
                    m.from,
                    {
                        text: "Sebelum aku bisa bantu dengan fitur yang aku punya, yuk kita kenalan dulu biar lebih akrab. Nama kamu siapa, ya? 😊"
                    },
                    { quoted: m, ephemeralExpiration: m.expiration }
                );
                return;
            else {
                const name = m.msg.trim();
                const nameRegex = /^[a-zA-Z\s]+$/; // Hanya huruf dan spasi yang diperbolehkan
                const minNameLength = 3;
                const maxNameLength = 50;

                // Cek apakah nama mengandung kata kotor
                if (badwords.test(name)) {
                    // Jika nama mengandung kata kotor
                    await sock.sendMessage(
                        m.from,
                        {
                            text: `Eits, kata-kata yang kamu pakai nggak cocok buat nama, nih. Yuk coba masukkan nama yang baik-baik aja, ya! 😊`
                        },
                        { quoted: m, ephemeralExpiration: m.expiration }
                    );
                    return;
                } else if (!nameRegex.test(name)) {
                    // Nama mengandung karakter yang aneh
                    await sock.sendMessage(
                        m.from,
                        {
                            text: `Hmm... Apa iya nama kamu kaya gitu? Sepertinya ada karakter yang nggak biasa. Coba pakai nama yang cuma huruf aja, ya! 😊`
                        },
                        { quoted: m, ephemeralExpiration: m.expiration }
                    );
                    return;
                } else if (
                    name.length < minNameLength ||
                    name.length > maxNameLength
                ) {
                    // Nama terlalu pendek atau panjang
                    await sock.sendMessage(
                        m.from,
                        {
                            text: `Nama kamu kelihatannya terlalu pendek atau panjang. Coba pakai nama yang lebih pas, ya? 😊`
                        },
                        { quoted: m, ephemeralExpiration: m.expiration }
                    );
                    return;
                } else {
                    usr.name = name;
                    usr.progressreg = 2;
                    await sock.sendMessage(
                        m.from,
                        {
                            text: `Senang banget bisa kenalan sama kamu ${
                                usr.name.split(" ")[0]
                            }! 🥳\n\nOh iya, tanggal lahir kamu kapan? Tenang aja, aku cuma mau tau biar bisa kasih pengalaman yang lebih personal buat kamu. 😊\n\nMisal kamu lahir tanggal 1 Oktober 2005, jadi kamu ketik: 01/01/2005`
                        },
                        { quoted: m, ephemeralExpiration: m.expiration }
                    );
                    return;
                }
            }
        }
        if (usr.progressreg === 2) {
            const birthDate = m.msg.trim(); // Ambil tanggal dari pesan user

            // Cek format tanggal dd/mm/yyyy
            const datePattern =
                /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/;

            if (!datePattern.test(birthDate)) {
                // Jika format salah, kasih tahu user
                await sock.sendMessage(
                    m.from,
                    {
                        text: "Oops, format tanggal lahirnya salah nih. Coba kirim lagi dengan format: dd/mm/yyyy. Misal kamu lahir tanggal 1 Januari 2005, jadi kamu ketik: 01/01/2005"
                    },
                    { quoted: m }
                );
                return;
            }

            // Pisahkan tanggal, bulan, dan tahun
            const [day, month, year] = birthDate
                .split("/")
                .map(num => parseInt(num));

            // Cek umur berdasarkan tahun
            const currentYear = new Date().getFullYear();
            const age = currentYear - year;

            // Cek apakah umur realistis (misalnya antara 1 hingga 120 tahun)
            if (age < 5 || age > 120) {
                await sock.sendMessage(
                    m.from,
                    {
                        text: "Hmm, sepertinya umur kamu terlalu ekstrem. Coba kirim tanggal lahir yang lebih realistis ya. 😊"
                    },
                    { quoted: m }
                );
                return;
            }

            // Jika semua valid, simpan
            usr.birth = birthDate;
            usr.progressreg = 5;

            // Kirim pesan konfirmasi
            await sock.sendMessage(
                m.from,
                {
                    text: `Terima kasih, ${
                        usr.name.split(" ")[0]
                    }! 😊 Tanggal lahir kamu sudah tercatat. Selamat datang di Ami Bot!`
                },
                { quoted: m }
            );
        }
    }

    async cmd(command, usr, sock, m, db) {
        const rand = (length = 32) => {
            const chars = "0123456789ABCDEF";
            return Array.from(
                { length },
                () => chars[Math.floor(Math.random() * chars.length)]
            ).join("");
        };

        // Check user status
        if (command && usr.banned) {
            await sock.sendMessage(
                m.from,
                {
                    text: "_Ops... anda dibanned dari bot!!_",
                    contextInfo: {
                        isForwarded: 1337,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363181344949815@newsletter",
                            serverMessageId: -1,
                            newsletterName: "🔥 LightWeight WhatsApp Bot"
                        }
                    }
                },
                {
                    quoted: m,
                    ephemeralExpiration: m.expiration,
                    messageId: rand()
                }
            );
            return true;
        }

        // Check owner
        if (command.isOwner && !m.isOwner && !m.key.fromMe) {
            await sock.sendMessage(
                m.from,
                {
                    text: "_Fitur ini hanya untuk owner!!_",
                    contextInfo: {
                        isForwarded: 1337,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363181344949815@newsletter",
                            serverMessageId: -1,
                            newsletterName: "🔥 LightWeight WhatsApp Bot"
                        }
                    }
                },
                {
                    quoted: m,
                    ephemeralExpiration: m.expiration,
                    messageId: rand()
                }
            );
            return true;
        }

        // Check group
        if (command.isGroup && !m.isGroup) {
            await sock.sendMessage(
                m.from,
                {
                    text: "_Fitur ini hanya dapat digunakan didalam grup!!_",
                    contextInfo: {
                        isForwarded: 1337,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363181344949815@newsletter",
                            serverMessageId: -1,
                            newsletterName: "🔥 LightWeight WhatsApp Bot"
                        }
                    }
                },
                {
                    quoted: m,
                    ephemeralExpiration: m.expiration,
                    messageId: rand()
                }
            );
            return true;
        }

        // Check admin
        if (command.isAdmin && !m.isAdmin) {
            await sock.sendMessage(
                m.from,
                {
                    text: "_Fitur ini hanya untuk admin grup!!_",
                    contextInfo: {
                        isForwarded: 1337,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363181344949815@newsletter",
                            serverMessageId: -1,
                            newsletterName: "🔥 LightWeight WhatsApp Bot"
                        }
                    }
                },
                {
                    quoted: m,
                    ephemeralExpiration: m.expiration,
                    messageId: rand()
                }
            );
            return true;
        }

        // Check bot admin
        if (command.isBotAdmin && !m.isBotAdmin) {
            await sock.sendMessage(
                m.from,
                {
                    text: "_Untuk menggunakan fitur ini, bot harus menjadi admin grup!!_",
                    contextInfo: {
                        isForwarded: 1337,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363181344949815@newsletter",
                            serverMessageId: -1,
                            newsletterName: "🔥 LightWeight WhatsApp Bot"
                        }
                    }
                },
                {
                    quoted: m,
                    ephemeralExpiration: m.expiration,
                    messageId: rand()
                }
            );
            return true;
        }

        // Check private
        if (command.isPrivate && m.isGroup) {
            await sock.sendMessage(
                m.from,
                {
                    text: "_Fitur ini hanya dapat digunakan di private chat!!_",
                    contextInfo: {
                        isForwarded: 1337,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363181344949815@newsletter",
                            serverMessageId: -1,
                            newsletterName: "🔥 LightWeight WhatsApp Bot"
                        }
                    }
                },
                {
                    quoted: m,
                    ephemeralExpiration: m.expiration,
                    messageId: rand()
                }
            );
            return true;
        }
    }

    async handleCommand(text, prefix, m, sock, db, func, color, util, usr) {
        const [cmd, ...args] = text.slice(prefix.length).trim().split(" ");
        const command = this.commands.get(cmd.toLowerCase());

        if (command && !command.noPrefix) {
            const mcmd = await this.cmd(command, usr, sock, m, db);
            if (mcmd) return;
            try {
                const parsedArgs = this.parseArguments(
                    args,
                    command.expectedArgs
                );
                await command.run(m, {
                    sock,
                    args: parsedArgs,
                    db,
                    util,
                    color,
                    func,
                    cmds: this.commands
                });
                return true;
            } catch (error) {
                console.error(
                    "[ERROR] Error executing prefixed command:",
                    error
                );
            }
        }
        return false;
    }

    async handleNoPrefixCommand(text, m, sock, db, func, color, util) {
        const [potentialCmd, ...args] = text.split(" ");
        const command = this.commands.get(potentialCmd.toLowerCase());
        const usr = db.users[m.sender] || {};

        if (command && command.noPrefix) {
            const mcmd = await this.cmd(command, usr, sock, m, db);
            if (mcmd) return;
            try {
                const parsedArgs = this.parseArguments(
                    args,
                    command.expectedArgs
                );
                await command.run(m, {
                    sock,
                    args: parsedArgs,
                    db,
                    util,
                    color,
                    func,
                    cmds: this.commands
                });
                return true;
            } catch (error) {
                console.error(
                    "[ERROR] Error executing non-prefixed command:",
                    error
                );
            }
        }
        return false;
    }

    parseArguments(args, expectedArgs) {
        const argObject = {};
        args.forEach(arg => {
            const [key, value] = arg.split("=");
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
