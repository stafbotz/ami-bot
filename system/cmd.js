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
import fs from "fs";
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
            if (usr.beta && !m.isOwner) return false;
            if (!usr.register && !usr.banned) {
                if (!usr.progressreg) {
                    await sock.sendMessage(
                        m.from,
                        {
                            text: "Hai! 👋 Aku Ami Bot, bot Whatsapp yang dibuat oleh Renshu Visualz.\n\nAku bisa bantu kamu ngerjain PR, tanya jawab, brainstorm ide, download video dari TikTok/IG, ngingetin jadwal, dan masih banyak lagi!\n\nSebelum itu, kita kenalan dulu yuk, biar lebih akrab. *Nama kamu siapa?* ☺️"
                        },
                        { quoted: m, ephemeralExpiration: m.expiration }
                    );
                }
                usr.progressreg = 1; 
                return await this.handleRegister(
                    usr,
                    sock,
                    m,
                    db,
                    prefixMatched
                );
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
        try {
            const response = m.body.trim();

            // Progress tahap 1: Input Nama
            if (usr.progressreg === 1) {
                if (!isValidName(response)) {
                    const invalidNameMessage = containsBadWords(response)
                        ? "Eits, kata-kata yang kamu pakai nggak cocok buat nama, nih. Yuk coba masukkan nama yang baik-baik aja, ya! 😊"
                        : "Hmm, nama kamu harus pakai huruf aja, tanpa simbol, dan panjangnya 3-50 karakter. Yuk coba lagi. 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: invalidNameMessage },
                        { quoted: m }
                    );
                } else {
                    usr.name = response;
                    usr.progressreg = 1.5;
                    const confirmNameMessage = `Nama kamu *${usr.name}*? Kalau sudah benar, ketik *Ya*. Kalau salah, ketik ulang nama kamu. 😊`;
                    await sock.sendMessage(
                        m.from,
                        { text: confirmNameMessage },
                        { quoted: m }
                    );
                }
            }
            // Progress tahap 1.5: Konfirmasi Nama
            else if (usr.progressreg === 1.5) {
                if (response.toLowerCase() === "ya") {
                    usr.progressreg = 2;
                    const birthPrompt = `Senang banget bisa kenalan sama kamu *${
                        usr.name.split(" ")[0]
                    }!* 🥳\n\nOh iya, *tanggal lahir kamu kapan?* 😊\n\nPakai format *dd/mm/yyyy*. Misal kamu lahir tanggal *1 Januari 2005*, jadi kamu ketik: *01/01/2005*.`;
                    await sock.sendMessage(
                        m.from,
                        { text: birthPrompt },
                        { quoted: m }
                    );
                } else if (!isValidName(response)) {
                    const retryNameMessage =
                        "Hmm, nama kamu harus pakai huruf aja, tanpa simbol, dan panjangnya 3-50 karakter. Yuk coba lagi. 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: retryNameMessage },
                        { quoted: m }
                    );
                } else {
                    usr.name = response; // Simpan nama baru
                    usr.progressreg = 2; // Lanjut ke tahap berikutnya
                    const birthPrompt = `Senang banget bisa kenalan sama kamu *${
                        usr.name.split(" ")[0]
                    }!* 🥳\n\nOh iya, *tanggal lahir kamu kapan?* 😊\n\nPakai format *dd/mm/yyyy*. Misal kamu lahir tanggal *1 Januari 2005*, jadi kamu ketik: *01/01/2005*.`;
                    await sock.sendMessage(
                        m.from,
                        { text: birthPrompt },
                        { quoted: m }
                    );
                }
            }
            // Progress tahap 2: Input Tanggal Lahir
            else if (usr.progressreg === 2) {
                if (!isValidDateFormat(response)) {
                    const invalidDateMessage =
                        "Oops, format tanggal lahirnya salah nih. Coba kirim lagi dengan format *dd/mm/yyyy*. 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: invalidDateMessage },
                        { quoted: m }
                    );
                } else {
                    const [day, month, year] = response
                        .split("/")
                        .map(num => parseInt(num));
                    const currentYear = new Date().getFullYear();
                    const age = currentYear - year;

                    if (age < 13 || age > 30) {
                        const extremeAgeMessage =
                            "Hmm, sepertinya umur kamu kurang pas nih. Bot ini dirancang buat pengguna usia 13 sampai 30 tahun. Kalau umur kamu di luar rentang itu, mungkin bot ini kurang cocok buat kamu. 😊";
                        await sock.sendMessage(
                            m.from,
                            { text: extremeAgeMessage },
                            { quoted: m }
                        );
                    } else {
                        usr.birth = response;
                        const monthNames = [
                            "Januari",
                            "Februari",
                            "Maret",
                            "April",
                            "Mei",
                            "Juni",
                            "Juli",
                            "Agustus",
                            "September",
                            "Oktober",
                            "November",
                            "Desember"
                        ];
                        const monthName = monthNames[month - 1];
                        usr.progressreg = 2.5;
                        const confirmBirthMessage = `Tanggal lahir kamu *${
                            day + " " + monthName + " " + year
                        }*, benar? Kalau benar, ketik *Ya*. Kalau salah, ketik ulang tanggal lahirnya. 😊`;
                        await sock.sendMessage(
                            m.from,
                            { text: confirmBirthMessage },
                            { quoted: m }
                        );
                    }
                }
            }
            // Progress tahap 2.5: Konfirmasi Tanggal Lahir
            else if (usr.progressreg === 2.5) {
                if (response.toLowerCase() === "ya") {
                    usr.progressreg = 3;
                    const termsMessage = `Terima kasih sudah konfirmasi. Yuk baca kebijakan privasi dan ketentuan penggunaan sebelum lanjut. Ketik *Setuju* kalau sudah oke. 😊`;
                    await sock.sendMessage(
                        m.from,
                        { text: termsMessage },
                        { quoted: m }
                    );
                } else if (!isValidDateFormat(response)) {
                    const retryBirthMessage =
                        "Oops, format tanggal lahirnya salah nih. Coba kirim lagi dengan format *dd/mm/yyyy*. 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: retryBirthMessage },
                        { quoted: m }
                    );
                } else {
                    const [day, month, year] = response
                        .split("/")
                        .map(num => parseInt(num));
                    const monthNames = [
                        "Januari",
                        "Februari",
                        "Maret",
                        "April",
                        "Mei",
                        "Juni",
                        "Juli",
                        "Agustus",
                        "September",
                        "Oktober",
                        "November",
                        "Desember"
                    ];
                    const monthName = monthNames[month - 1];
                    usr.birth = response;
                    const confirmBirthMessage = `Tanggal lahir kamu *${
                        day + " " + monthName + " " + year
                    }*, benar? Kalau benar, ketik *Ya*. Kalau salah, ketik ulang tanggal lahirnya. 😊`;
                    await sock.sendMessage(
                        m.from,
                        { text: confirmBirthMessage },
                        { quoted: m }
                    );
                }
            }
        } catch (error) {
            console.error("Error di handleRegister:", error);
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

// Validasi format tanggal
function isValidDateFormat(dateString) {
    const datePattern = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/;
    return datePattern.test(dateString);
}

// Validasi umur
function isRealisticAge(year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    return age >= 13 && age <= 30;
}

// Validasi nama
function isValidName(name) {
    const nameRegex = /^[a-zA-Z\s]+$/;
    return nameRegex.test(name) && name.length >= 3 && name.length <= 50;
}

// Cek apakah ada kata-kata kasar
function containsBadWords(input) {
    const badwords =
        /(anj[kg]|ajn[gk]|a?njin[gk]|bajingan|b[a]?[n]?gsa?t|ko?nto?l|me?me?[kq]|pe?pe?[kq]|meki|titi[t,d]|pe?ler|tetek|toket|ngewe|go?blo?k|to?lo?l|idiot|[kng]e?nto?[t,d]|jembut|bego|dajjal|janc[uo]k|pantek|puki?(mak)?|kimak|kampang|lonte|col[i,mek]|pelacur|henceut|nigga|fuck|dick|bitch|tits|bastard|asshole|a[su,w,yu])/i;
    return badwords.test(input);
}
