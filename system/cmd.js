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
                if (usr.progressreg !== 1) {
 await sock.sendMessage(
                        m.from,
                        {
                            text: "Hai! 👋 Aku Ami Bot, bot Whatsapp yang dibuat oleh Renshu Visualz.\n\nAku bisa bantu kamu ngerjain PR, tanya jawab, brainstorm ide, download video dari TikTok/IG, ngingetin jadwal, dan masih banyak lagi!\n\nSebelum itu, kita kenalan dulu yuk, biar lebih akrab. *Nama kamu siapa?* ☺️"
                        },
                        { quoted: m, ephemeralExpiration: m.expiration }
                    );
                    usr.progressreg = 1; // Set progressreg agar pesan tidak dikirim lagi
                }

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
            // Daftar kata-kata kasar
            const badwords =
                /(anj[kg]|ajn[gk]|a?njin[gk]|bajingan|b[a]?[n]?gsa?t|ko?nto?l|me?me?[kq]|pe?pe?[kq]|meki|titi[t,d]|pe?ler|tetek|toket|ngewe|go?blo?k|to?lo?l|idiot|[kng]e?nto?[t,d]|jembut|bego|dajjal|janc[uo]k|pantek|puki?(mak)?|kimak|kampang|lonte|col[i,mek]|pelacur|henceut|nigga|fuck|dick|bitch|tits|bastard|asshole|a[su,w,yu])/i;

            // Alur Registrasi
            if (usr.progressreg === 1) {
                if (prefix) {
                    const introMessage =
                        "Sebelum aku bisa bantu dengan fitur yang aku punya, yuk kita kenalan dulu biar lebih akrab. *Nama kamu siapa?* 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: introMessage },
                        { quoted: m, ephemeralExpiration: m.expiration }
                    );
                } else {
                    const name = m.msg.trim();
                    const nameRegex = /^[a-zA-Z\s]+$/;
                    const minNameLength = 3;
                    const maxNameLength = 50;

                    if (badwords.test(name)) {
                        const badwordMessage =
                            "Eits, kata-kata yang kamu pakai nggak cocok buat nama, nih. Yuk coba masukkan nama yang baik-baik aja, ya! 😊";
                        await sock.sendMessage(
                            m.from,
                            { text: badwordMessage },
                            { quoted: m }
                        );
                    } else if (!nameRegex.test(name)) {
                        const invalidCharMessage =
                            "Hmm... Nama kamu kok ada karakter anehnya? Coba masukkan nama yang cuma huruf aja, ya. 😊";
                        await sock.sendMessage(
                            m.from,
                            { text: invalidCharMessage },
                            { quoted: m }
                        );
                    } else if (
                        name.length < minNameLength ||
                        name.length > maxNameLength
                    ) {
                        const lengthMessage =
                            "Nama kamu kelihatannya terlalu pendek atau panjang. Coba pakai nama yang lebih pas, ya? 😊";
                        await sock.sendMessage(
                            m.from,
                            { text: lengthMessage },
                            { quoted: m }
                        );
                    } else {
                        usr.name = name;
                        usr.progressreg = 1.5; // Status konfirmasi nama
                        const confirmNameMessage = `Namanya *${usr.name}*? Kalau sudah benar, ketik *Ya*. Kalau salah, ketik ulang nama kamu. 😊`;
                        await sock.sendMessage(
                            m.from,
                            { text: confirmNameMessage },
                            { quoted: m }
                        );
                    }
                }
            } else if (usr.progressreg === 1.5) {
                if (m.msg.trim().toLowerCase() === "ya") {
                    usr.progressreg = 2;
                    const birthPrompt = `Senang banget bisa kenalan sama kamu *${
                        usr.name.split(" ")[0]
                    }!* 🥳\n\nOh iya, *tanggal lahir kamu kapan?* 😊\n\nPakai format *dd/mm/yyyy*. Misal kamu lahir tanggal *1 Januari 2005*, jadi kamu ketik: *01/01/2005*.`;
                    await sock.sendMessage(
                        m.from,
                        { text: birthPrompt },
                        { quoted: m }
                    );
                } else {
                    usr.progressreg = 1; // Kembali ke input nama
                    const retryNameMessage =
                        "Oh, yuk masukkan nama kamu yang benar. 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: retryNameMessage },
                        { quoted: m }
                    );
                }
            } else if (usr.progressreg === 2) {
                const birthDate = m.msg.trim();
                const datePattern =
                    /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/;

                if (!datePattern.test(birthDate)) {
                    const invalidDateMessage =
                        "Oops, format tanggal lahirnya salah nih. Coba kirim lagi dengan format: dd/mm/yyyy. 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: invalidDateMessage },
                        { quoted: m }
                    );
                } else {
                    const [day, month, year] = birthDate
                        .split("/")
                        .map(num => parseInt(num));
                    const currentYear = new Date().getFullYear();
                    const age = currentYear - year;

                    if (age < 5 || age > 120) {
                        const extremeAgeMessage =
                            "Hmm, sepertinya umur kamu terlalu ekstrem. Coba kirim tanggal lahir yang lebih realistis ya. 😊";
                        await sock.sendMessage(
                            m.from,
                            { text: extremeAgeMessage },
                            { quoted: m }
                        );
                    } else {
                        usr.birth = birthDate;
                        usr.progressreg = 2.5; // Status konfirmasi tanggal lahir
                        const confirmBirthMessage = `Tanggal lahir kamu *${usr.birth}*, benar? Kalau benar, ketik *Ya*. Kalau salah, ketik ulang tanggal lahirnya. 😊`;
                        await sock.sendMessage(
                            m.from,
                            { text: confirmBirthMessage },
                            { quoted: m }
                        );
                    }
                }
            } else if (usr.progressreg === 2.5) {
                if (m.msg.trim().toLowerCase() === "ya") {
                    usr.progressreg = 3;
                    const termsMessage = `Ok, Sebelum kita lanjut, aku butuh konfirmasi dari kamu untuk menyetujui Kebijakan Privasi dan Ketentuan Penggunaan Ami Bot.\n\nKamu bisa baca dulu kebijakannya dan kalau setuju, cukup ketik *Setuju* ya.`;
                    await sock.sendMessage(
                        m.from,
                        { text: termsMessage },
                        { quoted: m }
                    );
                } else {
                    usr.progressreg = 2; // Kembali ke input tanggal lahir
                    const retryBirthMessage =
                        "Oh, yuk masukkan tanggal lahir kamu yang benar. 😊";
                    await sock.sendMessage(
                        m.from,
                        { text: retryBirthMessage },
                        { quoted: m }
                    );
                }
            } else if (usr.progressreg === 3) {
                if (m.msg.trim().toLowerCase() === "setuju") {
                    delete usr.progressreg;
                    usr.register = true;
                    usr.beta = true;
                    const thankYouMessage = `Terima kasih sudah setuju, ${
                        usr.name.split(" ")[0]
                    }! 🎉\n\nSaat ini Ami Bot sedang dalam proses pengerjaan. Kalau nanti siap, aku akan kasih kabar ke kamu!`;
                    await sock.sendMessage(
                        m.from,
                        { text: thankYouMessage },
                        { quoted: m }
                    );
                } else {
                    const retryTermsMessage = `Ketik *Setuju*, kamu tidak dapat menggunakan Ami Bot jika kamu tidak setuju dengan kebijakan dan ketentuan penggunaan Ami Bot.`;
                    await sock.sendMessage(
                        m.from,
                        { text: retryTermsMessage },
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
