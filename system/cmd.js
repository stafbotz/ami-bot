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
        text: "Hai! Aku Ami.\n\nAku asisten AI buatan Renshu Mushy yang siap bantu kamu. Aku suka ngobrol dan bakal jadi temen yang asik buat sharing atau tanya-tanya.\n\nKita kenalan dulu yuk!\n\n*Nama kamu siapa?*\n\n(ketik nama kamu untuk melanjutkan)",
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
                text: `Namamu ${usr.name}, ya? Kalau udah bener, ketik *Ya* aja. Kalau belum, ketik nama yang bener ya.`,
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
                text: `Thanks ${
                  usr.name.split(" ")[0]
                }!\n\nNext, Ami perlu tau tanggal lahir kamu buat verifikasi umur.\n\nKetik dengan format: *tanggal/bulan/tahun*\n\nTips: Untuk tanggal & bulan yang satuan (1-9), tulis pake angka 0 di depan. Kalo udah puluhan (10-31) langsung aja.\n\nContoh:\n• *01/05/2005* untuk tanggal 1 Mei 2005\n• *15/12/2004* untuk tanggal 15 Desember 2004`,
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
                text: `Senang bertemu dengan kamu ${usr.name}! Namamu ${usr.name}, benar? Kalau udah bener, ketik *Ya* aja. Kalau belum, ketik nama yang bener ya.`,
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
                text: "Oops, format tanggalnya kurang tepat nih.\n\nInget ya, formatnya: *tanggal/bulan/tahun*\n\nUntuk tanggal & bulan yang satuan (1-9), tulis pake angka 0 di depan.\n\nContoh:\n• *01/05/2005* untuk tanggal 1 Mei 2005\n• *15/12/2004* untuk tanggal 15 Desember 2004",
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
              text: `Jadi umur kamu sekarang ${age} tahun, ya?\n\nKalau udah bener, ketik *Ya* aja.\nKalau ada yang salah, ketik ulang tanggal lahirmu dengan format yang bener.`,
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
                text: `Makasih ${
                  usr.name.split(" ")[0]
                }!\n\nAmi perlu tau hari raya yang kamu rayakan buat beberapa fitur khusus. Pilih aja:\n\n*1* - Idul Fitri (Islam)\n*2* - Natal (Kristen)\n*3* - Natal (Katolik)\n*4* - Nyepi (Hindu)\n*5* - Waisak (Buddha)\n*6* - Imlek (Konghucu)\n\nKetik angka pilihanmu.`,
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
                )}, ya? Kalau bener, ketik *Ya* aja. Kalau salah, ketik ulang tanggal lahirnya.`,
              },
              { quoted: m }
            );
          }
        },

        3: async () => {
          // Process religious holiday selection
          const holidayOptions = {
            1: { name: "Idul Fitri", religion: "Islam" },
            2: { name: "Natal", religion: "Kristen" },
            3: { name: "Natal", religion: "Katolik" },
            4: { name: "Nyepi", religion: "Hindu" },
            5: { name: "Waisak", religion: "Buddha" },
            6: { name: "Imlek", religion: "Konghucu" },
          };

          if (!holidayOptions[response]) {
            await sock.sendMessage(
              m.from,
              {
                text: "Ketik angka 1-6 aja sesuai pilihan ya.",
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
              text: `Oke, kamu merayakan ${selectedHoliday.name} ya!\n\nNext, Ami mau tau kode pos daerah kamu nih. Ini bakal bantu Ami ngasih info cuaca, berita lokal, atau peringatan bencana yang relevan buat kamu.\n\nKetik kode pos kamu (5 digit) atau ketik *Skip* kalau mau isi nanti.`,
            },
            { quoted: m }
          );
        },

        4: async () => {
          // Process postal code info
          if (response.toLowerCase() === "skip") {
            usr.postal_code = "belum diisi";
            usr.progressreg = 5;

            await sock.sendMessage(
              m.from,
              {
                text: `No problem! Kamu bisa update kode pos kapan aja nanti dengan ketik *.myprofile*.\n\nSebelum kita lanjut, ada hal yang perlu kamu tau:`,
              },
              { quoted: m }
            );

            // Send disclaimer right away
            await sock.sendMessage(m.from, {
              text: `*DISCLAIMER*\n\nWalaupun Ami berusaha memberikan yang terbaik dalam setiap percakapan, Ami nggak sempurna. Ami kadang bisa ngasih info yang kurang tepat atau bias. Ami juga masih belajar dan berkembang.\n\nKetik *Setuju* untuk melanjutkan.`,
            });
          } else if (/^\d{5}$/.test(response)) {
            usr.postal_code = response;
            usr.progressreg = 5;

            await sock.sendMessage(
              m.from,
              {
                text: `Thanks! Ami udah catat kode pos kamu: ${response}.\n\nSebelum kita lanjut, ada hal yang perlu kamu tau:`,
              },
              { quoted: m }
            );

            // Send disclaimer right away
            await sock.sendMessage(m.from, {
              text: `*DISCLAIMER*\n\nWalaupun Ami berusaha memberikan yang terbaik dalam setiap percakapan, Ami nggak sempurna. Ami kadang bisa ngasih info yang kurang tepat atau bias. Ami juga masih belajar dan berkembang.\n\nKetik *Setuju* untuk melanjutkan.`,
            });
          } else {
            await sock.sendMessage(
              m.from,
              {
                text: `Hmm, format kode posnya kayaknya kurang tepat. Kode pos biasanya 5 digit angka. Coba lagi atau ketik *Skip* kalau mau isi nanti.`,
              },
              { quoted: m }
            );
          }
        },

        5: async () => {
          if (response.toLowerCase() === "setuju") {
            usr.progressreg = 6;
            usr.disclaimer_accepted = true;

            await sock.sendMessage(
              m.from,
              {
                text: `Siip! Pendaftaran hampir selesai, ${
                  usr.name.split(" ")[0]
                }! 🎉\n\nMau tau cara pake bot? Aku ada tutorial singkat nih.\n\nKetik *Lanjut* buat ikutin tutorial atau *Skip* kalo kamu udah tau/pernah pake bot sejenis.`,
              },
              { quoted: m }
            );
          } else {
            await sock.sendMessage(
              m.from,
              {
                text: `Untuk lanjut pake Ami Bot, kamu perlu menyetujui disclaimer dulu ya. Ketik *Setuju* untuk melanjutkan.`,
              },
              { quoted: m }
            );
          }
        },

        // Tambahkan kondisi baru di stage 6
        6: async () => {
          if (response.toLowerCase() === "skip") {
            // Skip tutorial dan langsung selesai
            delete usr.progressreg;
            usr.register = true;
            usr.tutorial_completed = true;

            await sock.sendMessage(m.from, {
              text: `Sip! Kamu udah resmi jadi pengguna Ami Bot.\n\nInget ya:\n- Ngobrol sama Ami: ketik *Ami*\n- Liat semua fitur: ketik *.menu*\n- Butuh bantuan: ketik *.bantuan*\n\nHappy chatting! 😎`,
            });
          } else if (response.toLowerCase() === "lanjut") {
            // Mulai tutorial
            usr.progressreg = 6.5;
            await sock.sendMessage(
              m.from,
              {
                text: `Oke, kita mulai ya!\n\nPertama, coba ketik *.menu* (pake titik di depan) buat liat semua fitur Ami Bot.`,
              },
              { quoted: m }
            );
          } else {
            await sock.sendMessage(
              m.from,
              {
                text: `Cukup ketik *Lanjut* kalo mau tutorial atau *Skip* kalo udah tau cara makenya.`,
              },
              { quoted: m }
            );
          }
        },

        // Tambahkan stage 6.5 untuk menggantikan stage 6 yang asli
        6.5: async () => {
          // Tutorial .menu
          if (response.toLowerCase() === ".menu") {
            usr.progressreg = 7;
            await sock.sendMessage(m.from, {
              text: `Keren! Kamu udah berhasil, itu tadi cara nampilin menu Ami Bot 👏\n\nNext, coba ketik *Ami*`,
            });
          } else {
            await sock.sendMessage(
              m.from,
              {
                text: `Ups, hampir bener! Coba ketik *.menu* (pake titik di depan).`,
              },
              { quoted: m }
            );
          }
        },

        7: async () => {
          // Tutorial Ami,
          if (response.toLowerCase() === "ami") {
            usr.progressreg = 8;

            await sock.sendMessage(m.from, {
              text: `Mantap! Itu tadi cara untuk ngobrol sama aku Ami AI Assistant 🙌\n\nTerakhir nih, coba ketik *.bantuan* buat tau cara minta bantuan kalo ada masalah.`,
            });
          } else {
            await sock.sendMessage(
              m.from,
              {
                text: `Coba lagi ya! Ketik *Ami* aja (tanpa titik atau tambahan).`,
              },
              { quoted: m }
            );
          }
        },

        8: async () => {
          // Tutorial .bantuan
          if (response.toLowerCase() === ".bantuan") {
            delete usr.progressreg;
            usr.register = true;
            usr.tutorial_completed = true;

            await sock.sendMessage(m.from, {
              text: `Wah! Kamu udah ngerti cara pake Ami Bot! 🎊\n\nSekarang kamu resmi jadi pengguna Ami Bot. Kamu bisa:\n- Ngobrol sama Ami: ketik *Ami*\n- Liat semua fitur: ketik *.menu*\n- Butuh bantuan: ketik *.bantuan*\n\nHappy chatting! 😎`,
            });
          } else {
            await sock.sendMessage(
              m.from,
              {
                text: `Dikit lagi! Coba ketik *.bantuan* (pake titik di depan).`,
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
