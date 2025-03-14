import { createRequire } from "module";
import color from "./color.js";

const require = createRequire(import.meta.url);

// Konfigurasi konstan
const CONFIG = {
  PREFIXES: [".", ",", "/", "\\", "#", "!"],
  REGISTRATION: {
    MIN_AGE: 13,
    MAX_AGE: 30,
    NAME_MIN_LENGTH: 3,
    NAME_MAX_LENGTH: 50,
  },
  PATTERNS: {
    DATE: /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/\d{4}$/,
    NAME: /^[a-zA-Z\s]+$/,
    BAD_WORDS:
      /(anj[kg]|ajn[gk]|a?njin[gk]|bajingan|b[a]?[n]?gsa?t|ko?nto?l|me?me?[kq]|pe?pe?[kq]|meki|titi[t,d]|pe?ler|tetek|toket|ngewe|go?blo?k|to?lo?l|idiot|[kng]e?nto?[t,d]|jembut|bego|dajjal|janc[uo]k|pantek|puki?(mak)?|kimak|kampang|lonte|col[i,mek]|pelacur|henceut|nigga|fuck|dick|bitch|tits|bastard|asshole|a[su,w,yu])/i,
  },
  MONTH_NAMES: [
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
    "Desember",
  ],
};

// Utility functions
const utils = {
  generateMessageId: (length = 32) => {
    const chars = "0123456789ABCDEF";
    return Array.from(
      { length },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  },

  isValidDate: (dateString) => CONFIG.PATTERNS.DATE.test(dateString),

  isValidName: (name) =>
    CONFIG.PATTERNS.NAME.test(name) &&
    name.length >= CONFIG.REGISTRATION.NAME_MIN_LENGTH &&
    name.length <= CONFIG.REGISTRATION.NAME_MAX_LENGTH,

  containsBadWords: (input) => CONFIG.PATTERNS.BAD_WORDS.test(input),

  isValidAge: (year) => {
    const age = new Date().getFullYear() - year;
    return (
      age >= CONFIG.REGISTRATION.MIN_AGE && age <= CONFIG.REGISTRATION.MAX_AGE
    );
  },

  formatDate: (day, month, year) =>
    `${day} ${CONFIG.MONTH_NAMES[month - 1]} ${year}`,
};

export default class CommandHandler {
  constructor() {
    this.commands = new Map();
    this.functions = new Set();
    this.prefixes = CONFIG.PREFIXES;
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
    expectedArgs = {},
  }) {
    const commands = Array.isArray(cmd) ? cmd : [cmd];
    commands.forEach((command) => {
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
        expectedArgs,
      });
    });
  }

  addFunction(fn) {
    this.functions.add(fn);
  }

  async loadPlugin(path) {
    try {
      const module = path.endsWith(".cjs") ? require(path) : await import(path);
      return module.default || module;
    } catch (error) {
      console.log(color.red(`[ CMD ] Failed to load module: ${path}`));
      return null;
    }
  }

  async execute(m, sock, db, func, color, util) {
    try {
      if (this.executedCommands.has(m.id)) return false;
      this.executedCommands.add(m.id);

      // Execute registered functions
      await Promise.all(
        [...this.functions].map((fn) =>
          fn(m, { sock, db, color, func, cmds: this.commands }).catch((error) =>
            console.error("[ERROR] Error in function handler:", error)
          )
        )
      );

      if (!m.body) return false;

      const text = m.body.trim();
      const gc = m.isGroup ? db.groups[m.from] : false;
      const usr = db.users[m.sender] || {};

      // Early returns for various conditions
      if (m.isGroup && gc.mute && !m.isOwner) return false;
      if (db.setting.self && !m.isOwner && !m.key.fromMe) return false;

      // Handle autoread
      if (db.setting.autoread) {
        await sock.readMessages([m.key]);
      }

      // Handle story reading
      await this.handleStoryReading(m, sock, db);

      // CRITICAL: Check registration status first
      // If user hasn't registered or is in progress, ONLY allow registration process
      if (!usr.register || usr.progressreg) {
        // If registration hasn't started yet, start it
        if (!usr.progressreg) {
          await this.sendWelcomeMessage(sock, m);
          usr.progressreg = 1;
          return true;
        }
        
        // Continue registration process and BLOCK all other commands
        return await this.handleRegister(usr, sock, m, db);
      }

      // If user is banned, check before processing commands
      if (usr.banned) {
        // May want to send a message about being banned
        return false;
      }

      // Only registered and non-banned users get here
      // Process regular commands
      const prefixMatched = this.prefixes.find((p) => text.startsWith(p));
      return prefixMatched
        ? await this.handleCommand(
            text,
            prefixMatched,
            m,
            sock,
            db,
            func,
            color,
            util,
            usr
          )
        : await this.handleNoPrefixCommand(
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

  async handleStoryReading(m, sock, db) {
    if (
      !db.setting.readstory ||
      m.type === "protocolMessage" ||
      m.key.remoteJid !== "status@broadcast" ||
      m.type === "reactionMessage"
    )
      return;

    const maxTime = 5 * 60 * 1000;
    const timeDiff = Date.now() - m.timestamps * 1000;

    if (timeDiff <= maxTime) {
      await sock.readMessages([m.key]);

      if (db.setting.reactstory) {
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
          "🙄",
        ];
        const emoji = emots[Math.floor(Math.random() * emots.length)];
        const names = await sock.getName(m.key.participant);

        await sock.sendMessage(
          m.key.remoteJid,
          { react: { key: m.key, text: emoji } },
          { statusJidList: [m.key.participant, m.sender] }
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

        await sock.sendMessage(`${db.setting.owner[0]}@s.whatsapp.net`, {
          text: message,
        });
      }
    }
  }

  async sendWelcomeMessage(sock, m) {
    await sock.sendMessage(
      m.from,
      {
        text: "Halo, aku Ami. Aku adalah asisten AI yang dibuat oleh Renshu Mushy untuk membantu kamu. Aku suka ngobrol dan selalu berusaha jadi teman yang ramah dan menyenangkan. Aku ingin kita bisa mengenal satu sama lain. Nama kamu, siapa?",
      },
      {
        quoted: m,
        ephemeralExpiration: m.expiration,
      }
    );
  }

  async handleRegister(usr, sock, m, db) {
    try {
      const response = m.body.trim();

      const stages = {
        1: async () => {
          if (!utils.isValidName(response)) {
            const message = utils.containsBadWords(response)
              ? "Hmm, kayaknya nama itu kurang cocok deh. Coba pakai nama yang lebih ramah ya? 😊"
              : "Nama kamu harus pakai huruf aja (tanpa simbol) dan panjangnya 3-50 karakter. Coba lagi, ya?";
            await sock.sendMessage(m.from, { text: message }, { quoted: m });
          } else {
            usr.name = response;
            usr.progressreg = 1.5;
            await sock.sendMessage(
              m.from,
              {
                text: `Senang bertemu dengan kamu ${usr.name}. Namamu ${usr.name}, benar? Kalau sudah benar, ketik *Ya*. Kalau belum, ketik nama yang benar ya.`,
              },
              { quoted: m }
            );
          }
        },

        1.5: async () => {
          if (response.toLowerCase() === "ya") {
            usr.progressreg = 2;
            await sock.sendMessage(
              m.from,
              {
                text: `Terima kasih ${usr.name.split(" ")[0]}! Untuk tahap selanjutnya, Ami perlu tahu tanggal lahir kamu untuk verifikasi umur.\n\nKetik dengan format *dd/mm/yyyy* ya. Misalnya, 01/01/2005 untuk 1 Januari 2005.`,
              },
              { quoted: m }
            );
          } else if (!utils.isValidName(response)) {
            await sock.sendMessage(
              m.from,
              {
                text: "Nama kamu harus pakai huruf aja (tanpa simbol) dan panjangnya 3-50 karakter. Coba lagi, ya?",
              },
              { quoted: m }
            );
          } else {
            usr.name = response;
            await sock.sendMessage(
              m.from,
              {
                text: `Senang bertemu dengan kamu ${usr.name}. Namamu ${usr.name}, benar? Kalau sudah benar, ketik *Ya*. Kalau belum, ketik nama yang benar ya.`,
              },
              { quoted: m }
            );
          }
        },

        2: async () => {
          if (!utils.isValidDate(response)) {
            await sock.sendMessage(
              m.from,
              {
                text: "Oops, format tanggalnya kurang tepat nih. Coba pakai format *dd/mm/yyyy* ya. Misalnya, 01/01/2005 untuk 1 Januari 2005.",
              },
              { quoted: m }
            );
            return;
          }

          const [day, month, year] = response
            .split("/")
            .map((num) => parseInt(num));
          const age = new Date().getFullYear() - year;

          if (!utils.isValidAge(year)) {
            const message =
              age < CONFIG.REGISTRATION.MIN_AGE
                ? "Wah, sepertinya kamu masih terlalu muda untuk menggunakan bot ini. Tapi kalau tadi ada kesalahan ketik, coba kirim ulang tanggal lahir yang benar ya!"
                : "Hmm, sepertinya ada kesalahan dengan tanggal yang kamu masukkan. Bot ini didesain untuk anak muda. Kalau tadi ada kesalahan ketik, coba kirim ulang tanggal lahir yang benar ya!";
            await sock.sendMessage(m.from, { text: message }, { quoted: m });
            return;
          }

          usr.birth = response;
          usr.progressreg = 2.5;
          await sock.sendMessage(
            m.from,
            {
              text: `Tanggal lahir kamu ${utils.formatDate(
                day,
                month,
                year
              )}, ya? Kalau benar, ketik *Ya*. Kalau salah, ketik ulang tanggal lahirnya.`,
            },
            { quoted: m }
          );
        },

        2.5: async () => {
          if (response.toLowerCase() === "ya") {
            usr.progressreg = 3;
            await sock.sendMessage(
              m.from,
              {
                text: `Terima kasih atas konfirmasinya, ${usr.name.split(" ")[0]}!\n\nAmi perlu tahu hari raya yang kamu rayakan untuk beberapa fitur khusus. Silakan pilih:\n\n*1* - Idul Fitri (Islam)\n*2* - Natal (Kristen)\n*3* - Natal (Katolik)\n*4* - Nyepi (Hindu)\n*5* - Waisak (Buddha)\n*6* - Imlek (Konghucu)\n\nKetik angka pilihanmu ya.`,
              },
              { quoted: m }
            );
          } else if (!utils.isValidDate(response)) {
            await sock.sendMessage(
              m.from,
              {
                text: "Oops, format tanggalnya masih kurang tepat nih. Coba pakai format *dd/mm/yyyy* ya.",
              },
              { quoted: m }
            );
          } else {
            const [day, month, year] = response
              .split("/")
              .map((num) => parseInt(num));
            usr.birth = response;
            await sock.sendMessage(
              m.from,
              {
                text: `Tanggal lahir kamu ${utils.formatDate(
                  day,
                  month,
                  year
                )}, ya? Kalau benar, ketik *Ya*. Kalau salah, ketik ulang tanggal lahirnya.`,
              },
              { quoted: m }
            );
          }
        },

        3: async () => {
          // Process religious holiday selection
          const holidayOptions = {
            "1": { name: "Idul Fitri", religion: "Islam" },
            "2": { name: "Natal", religion: "Kristen" },
            "3": { name: "Natal", religion: "Katolik" },
            "4": { name: "Nyepi", religion: "Hindu" },
            "5": { name: "Waisak", religion: "Buddha" },
            "6": { name: "Imlek", religion: "Konghucu" }
          };
          
          if (!holidayOptions[response]) {
            await sock.sendMessage(
              m.from,
              {
                text: "Mohon ketik angka 1-6 sesuai pilihan yang tersedia.",
              },
              { quoted: m }
            );
            return;
          }
          
          const selectedHoliday = holidayOptions[response];
          usr.holiday = selectedHoliday.name;
          usr.religion = selectedHoliday.religion;
          
          usr.progressreg = 4;
          await sock.sendMessage(
            m.from,
            {
              text: `Ami mengerti! Kamu merayakan ${selectedHoliday.name}.\n\nTerakhir nih, kamu tinggal di provinsi mana? Ini akan membantu Ami memberikan info yang lebih relevan untukmu.`,
            },
            { quoted: m }
          );
        },

        4: async () => {
          // Process province info
          usr.province = response;
          usr.progressreg = 4.5;
          
          await sock.sendMessage(
            m.from,
            {
              text: `Kamu tinggal di ${response} ya? Kalau bener, ketik *Ya*. Kalau ada kesalahan, ketik ulang provinsimu ya.`,
            },
            { quoted: m }
          );
        },

        4.5: async () => {
          if (response.toLowerCase() === "ya") {
            delete usr.progressreg;
            usr.register = true;
            
            // Kirim pesan pertama: pendaftaran selesai
            await sock.sendMessage(
              m.from,
              {
                text: `Pendaftaran selesai! 🎉\n\nAmi senang bisa mengenalmu, ${usr.name.split(" ")[0]}!`,
              },
              { quoted: m }
            );

            // Kirim pesan kedua: cara penggunaan bot
            await sock.sendMessage(
              m.from,
              {
                text: `Sekarang kamu bisa menggunakan semua fitur Ami Bot:\n\n- Ketik *.menu* untuk melihat semua fitur\n- Ketik *Ami, [pertanyaan]* untuk ngobrol dengan Ami\n- Butuh bantuan? Ketik *.bantuan*\n\nAmi siap membantumu kapan saja!`,
              }
            );

            // Kirim pesan ketiga: disclaimer
            await sock.sendMessage(
              m.from,
              {
                text: `Ada hal yang perlu diketahui sebelum kita mulai bekerja sama, walaupun Ami berusaha memberikan yang terbaik dalam setiap percakapan, Ami tidak sempurna. Ami terkadang dapat menghasilkan informasi yang tidak tepat atau menyesatkan dan bias.`,
              }
            );
          } else {
            usr.province = response;
            await sock.sendMessage(
              m.from,
              {
                text: `Kamu tinggal di ${response} ya? Kalau bener, ketik *Ya*. Kalau ada kesalahan, ketik ulang provinsimu ya.`,
              },
              { quoted: m }
            );
          }
        },
      };

      if (usr.progressreg in stages) {
        await stages[usr.progressreg]();
      } else if (!usr.progressreg) {
        usr.progressreg = 1;
      }
    } catch (error) {
      console.error("Error di handleRegister:", error);
    }
  }

  async cmd(command, usr, sock, m, db) {
    const errorMessages = {
      banned: "_Ops... anda dibanned dari bot!!_",
      ownerOnly: "_Fitur ini hanya untuk owner!!_",
      groupOnly: "_Fitur ini hanya dapat digunakan didalam grup!!_",
      adminOnly: "_Fitur ini hanya untuk admin grup!!_",
      botAdminRequired:
        "_Untuk menggunakan fitur ini, bot harus menjadi admin grup!!_",
      privateOnly: "_Fitur ini hanya dapat digunakan di private chat!!_",
    };

    const sendErrorMessage = async (message) => {
      await sock.sendMessage(
        m.from,
        {
          text: message,
          contextInfo: {
            isForwarded: 1337,
            forwardedNewsletterMessageInfo: {
              newsletterJid: db.setting.ch_id,
              serverMessageId: -1,
              newsletterName: (
                await sock.newsletterMetadata("jid", db.setting.ch_id)
              ).name,
            },
          },
        },
        {
          quoted: m,
          ephemeralExpiration: m.expiration,
          messageId: utils.generateMessageId(),
        }
      );
      return true;
    };

    // Check conditions and send appropriate error messages
    if (command && usr.banned) {
      return await sendErrorMessage(errorMessages.banned);
    }
    if (command.isOwner && !m.isOwner && !m.key.fromMe) {
      return await sendErrorMessage(errorMessages.ownerOnly);
    }
    if (command.isGroup && !m.isGroup) {
      return await sendErrorMessage(errorMessages.groupOnly);
    }
    if (command.isAdmin && !m.isAdmin) {
      return await sendErrorMessage(errorMessages.adminOnly);
    }
    if (command.isBotAdmin && !m.isBotAdmin) {
      return await sendErrorMessage(errorMessages.botAdminRequired);
    }
    if (command.isPrivate && m.isGroup) {
      return await sendErrorMessage(errorMessages.privateOnly);
    }
    return false;
  }

  async handleCommand(text, prefix, m, sock, db, func, color, util, usr) {
    const [cmd, ...args] = text.slice(prefix.length).trim().split(" ");
    const command = this.commands.get(cmd.toLowerCase());

    if (command && !command.noPrefix) {
      const mcmd = await this.cmd(command, usr, sock, m, db);
      if (mcmd) return;
      try {
        const parsedArgs = this.parseArguments(args, command.expectedArgs);
        await command.run(m, {
          sock,
          args: parsedArgs,
          db,
          util,
          color,
          func,
          cmds: this.commands,
        });
        return true;
      } catch (error) {
        console.error("[ERROR] Error executing prefixed command:", error);
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
        const parsedArgs = this.parseArguments(args, command.expectedArgs);
        await command.run(m, {
          sock,
          args: parsedArgs,
          db,
          util,
          color,
          func,
          cmds: this.commands,
        });
        return true;
      } catch (error) {
        console.error("[ERROR] Error executing non-prefixed command:", error);
      }
    }
    return false;
  }

  parseArguments(args, expectedArgs) {
    const argObject = {};
    args.forEach((arg) => {
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