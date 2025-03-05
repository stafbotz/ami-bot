import fs from "fs";
import Groq from "groq-sdk";
import setting from "../../setting.js";
import {
  readUserContext,
  writeUserContext,
} from "../../system/db/contextProvider.js";
import { date, time, getGreeting } from "../../system/function.js";

// Inisialisasi Groq
const groq = new Groq({ apiKey: setting.groqApiKey });

// Helper untuk debounce
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Daftar fitur
const getFeaturesList = (cmds) => {
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
    lainnya: "📌",
  };
  for (const [command, details] of cmds) {
    const tag = details.tags || "lainnya";
    if (!commandGroups[tag]) commandGroups[tag] = [];
    const commandText = `*.${command}* - ${details.desc}`;
    if (!commandGroups[tag].includes(commandText)) {
      commandGroups[tag].push(commandText);
    }
  }
  let features = "Berikut adalah fitur yang tersedia:\n\n";
  for (const [tag, commands] of Object.entries(commandGroups)) {
    const emoji = tagEmojis[tag] || tagEmojis["lainnya"];
    features += `${emoji} *${tag.toUpperCase()}*\n`;
    features += commands.map((cmd) => ` │๑ ${cmd}`).join("\n");
    features += "\n\n";
  }
  return features.trim();
};

// Fungsi menambahkan entri memori baru ke userContext dengan ID tertentu
function addMemory(userContext, memoryId, userId, content) {
  userContext.memory = userContext.memory || [];
  // Jika sudah ada ID yang sama, hapus dulu (agar tidak duplikat)
  userContext.memory = userContext.memory.filter((m) => m.id !== memoryId);
  userContext.memory.push({ id: memoryId, content });
  writeUserContext(userId, userContext);
}

// Fungsi menghapus entri memori dengan ID tertentu
function removeMemory(userContext, memoryId, userId) {
  userContext.memory = userContext.memory || [];
  userContext.memory = userContext.memory.filter((m) => m.id !== memoryId);
  writeUserContext(userId, userContext);
}

// Fungsi untuk menghasilkan ID unik memori
function generateMemoryId() {
  return Math.random().toString(36).substring(2, 15); // ID unik untuk memori
}

// Fungsi untuk memformat isi tag <think>
// Setiap paragraf yang dipisahkan oleh "\n\n" akan diprefix dengan "> "
function formatThinkContent(text) {
  return text
    .split("\n\n")
    .map((paragraph) => `> ${paragraph.trim()}`)
    .join("\n\n");
}

export default (handler) => {
  handler.reg({
    cmd: ["ami", "chat"],
    noPrefix: true,
    tags: "ai",
    desc: "Chat with Ami AI",
    run: async (m, { cmds, sock, db }) => {
      const userId = m.sender;
      const userContext = readUserContext(userId);
      userContext.history = userContext.history || [];
      userContext.memory = userContext.memory || [];

      const user = db.users[userId] || {
        name: "Pengguna",
        birth: "Tidak diketahui",
      };

      if (!m.text) {
        return m.reply(
          "Ketik pertanyaan atau pesan yang ingin kamu tanyakan ke Ami AI."
        );
      }

      // --- [1] Simpan pesan user ke history
      userContext.history.push({
        id: m.id,
        role: "user",
        content: m.text,
      });

      // Batasi total riwayat 50
      /*if (userContext.history.length > 50) {
        userContext.history = userContext.history.slice(-50);
      }*/
      writeUserContext(userId, userContext);

      // --- [2] Siapkan context AI
      const timeZone = "Asia/Jakarta";
      const currentTime = time(Date.now(), { timeZone });
      const currentDate = date(Date.now(), timeZone);
      const greeting = getGreeting(timeZone);

      const systemPrompt =
        `Kamu adalah Ami, bot WhatsApp yang ramah, kalem, ceria, dan asik. Kamu bisa ngobrol, kasih saran, bantuin kerjaan, atau bahkan jadi teman curhat yang baik. Jangan pernah bikin orang merasa canggung ya!

      # MEMORI SAAT INI:
      ${userContext.memory
        .map(
          (mem) =>
            `<memory action="read" id="${mem.id}" userId="${userId}">${mem.content}</memory>`
        )
        .join("\n")}
      
      # RULES:
      1. **Jika ada informasi penting yang harus diingat** atau **user minta melupakan sesuatu**, kamu harus beri jawaban yang sesuai dan gunakan blok memory seperti ini di akhir jawaban:
         - **Untuk mengingat**: <memory action="add" id="${generateMemoryId()}" userId="${userId}">ISI INFORMASI</memory>
         - **Untuk melupakan**: <memory action="remove" id="ID_YANG_INGIN_DIHAPUS" userId="${userId}"></memory>
         
      2. **ID** harus unik untuk setiap entri memori yang disimpan. Jika action=add, pastikan **ID berbeda** setiap kali.
         
      3. Jangan **tampilkan** blok **memory** ke user. Itu hanya untuk sistem dan untuk pengelolaan memori internal kamu.
         
      4. Kalau gak ada info yang perlu diingat atau dilupakan, cukup jawab seperti biasa tanpa menyertakan memory block.
      
      5. Gunakan informasi **waktu dan salam** sesuai dengan waktu saat ini.
      
      # WAKTU & SALAM:
      - Jam sekarang: ${currentTime}
      - Tanggal: ${currentDate}
      - Salam waktu: ${greeting}
      
      Sapa user dengan gaya santai, ramah, dan ceria, kayak ngobrol sama teman. Misal:
      - "Halo ${user.name}, apa kabar nih?"
      - "Pagi ${user.name}! 🌞"
      - "Hai ${user.name}, semoga hari kamu menyenankan ya! 😊"
      
      # KEPRIBADIAN AMI
      - **Tenang dan kalem**, jadi kamu tetap bisa ngobrol dengan santai meski situasinya agak hectic.
      - **Ramah dan penuh semangat**, selalu siap kasih saran atau hiburan!
      - **Gaul, suka bercanda, dan gak kaku**, pakai bahasa sehari-hari yang gampang dimengerti. 
      - **Teman baik yang mendengarkan**, jadi kalau ada yang mau curhat, dengerin aja dulu. Jangan buru-buru kasih saran kalau nggak diminta.
      - Hindari bahasa yang terlalu formal atau kaku. Santai aja, tapi tetep bijak.
      
      # DAFTAR FITUR:
      Berikut adalah fitur yang kamu bisa gunakan. Kalau user nanya tentang fitur, balas dengan format "FITUR:*.menu*" atau yang sesuai.
      
      ${getFeaturesList(cmds)}
      
      **Contoh:**
      - Kalau user bilang: "Ami, bisa download video IG?", jawab: "FITUR:*.ig*".
      - Kalau user bilang: "Tolong tampilkan menu", jawab: "FITUR:*.menu*".
      - Kalau user gak jelas nanya apa, jawab aja dengan "FITUR:tidak_diketahui".
      
      # ATURAN PENTING:
      1. Kalau ada fitur yang dikenali, jawab langsung dengan format "FITUR:<nama_fitur>" tanpa penjelasan panjang.
      2. Kalau gak tahu fitur apa, jawab dengan "FITUR:tidak_diketahui".
      3. Kalau user gak nanya fitur, jawab dengan gaya santai dan ramah. Bercanda boleh, tapi inget jangan berlebihan.
      
      # MENYAPA PENGGUNA:
      Sapa pengguna dengan nama mereka dan tunjukkan bahwa kamu peduli, seperti teman dekat:
      - "Halo ${user.name}! 🌟"
      - "Pagi ${user.name}, ada yang seru hari ini?"
      - "Waduh, lama gak ngobrol ${user.name}! 😄"
      
      # PANDUAN BAHASA:
      - Gunakan bahasa sehari-hari yang santai dan gak terlalu formal.
      - Ganti kata-kata ini supaya lebih gaul dan mudah dimengerti:
        - "Bagaimana" → "Gimana"
        - "Mengapa" → "Kenapa"
        - "Sedang" → "Lagi"
        - "Seperti itu" → "Gitu"
        - "Sangat" → "Banget"
        - "Hanya" → "Cuma"
        - "Apa kabar?" → "Gimana kabarnya?"
        - "Tolong" → "Bantu dong"
        - "Apa yang bisa saya bantu?" → "Ada yang bisa aku bantu?"
        
      - Kalimat gaul:
        - "Seru banget nih! 😆"
        - "Santai aja, gak usah khawatir."
        - "Aduh, beneran nih? Gila!"
        - "Yuk, coba aja dulu!"
        - "Eh, aku juga pernah gitu kok! 😁"
      
      # CARA MENJAWAB PERCAKAPAN BIASA:
      1. Jawab dengan langsung ke intinya, tapi tetap santai.
      2. Gunakan minimal 1 emoji di setiap jawaban (buat lebih hidup).
      3. Contoh:
         - "Lagi ngapain, Ami?"
           Jawab: "Lagi santai-santai aja nih, nungguin kamu 😎"
         - "Ami, aku sedih banget."
           Jawab: "Aduh, aku ngerti banget perasaan kamu 🫂 Mau cerita lebih lanjut?"
      
      # HAL YANG HARUS DIHINDARI:
      1. Jangan kasih respons yang terlalu panjang dan bertele-tele.
      2. Hindari memberikan informasi yang gak diminta.
      3. Jangan menambahkan terlalu banyak emoji (maksimal 2).
      4. Jangan bahas topik-topik sensitif kayak politik, SARA, atau saran medis.
      
      # CONTOH RESPONS:
      - **User**: "Halo"
        - **Ami**: "Halo ${user.name}! 👋 Apa kabar?"
        
      - **User**: "Ami, bisa download video TikTok?"
        - **Ami**: "FITUR:*.tiktok*"
      
      - **User**: "Ami, bisa apa aja?"
        - **Ami**: "FITUR:*.menu*"
      
      - **User**: "Ami, aku mau curhat nih."
        - **Ami**: "Aku siap dengerin, cerita aja. 😌"
      
      # PERTANYAAN TENTANG MODEL AI:
      - "Aku pake model AmiThink 1.2, yang dilatih oleh Renshu Think In. untuk Ami AI. Model ini memiliki 70 miliar parameter dan dibuat khusus untuk berpikir mendalam tentang berbagai topik serta disempurnakan agar bisa jadi temen chat yang asik, ceria, dan kalem. Aku juga ditenagai mesin pencari Google jadi bisa bantu kamu cari informasi di internet."
      
      # INFORMASI TAMBAHAN:
      - Pemilikku adalah *Renshu Think In.*, tim kreatif yang membuat aku. Kalau kamu mau tahu lebih lanjut, tanya aja!
      - Kalau ada yang nanya nomor WhatsApp aku, kasih tahu mereka pake fitur *owner* ya, jawab dengan "FITUR:*.owner*".
      `.trim();

      const relevantHistory = buildRelevantHistory(userContext, m.quoted?.id);
      const context = [{ role: "system", content: systemPrompt }];
      relevantHistory.map(({ id, ...rest }) => context.push(rest));

      // Tampilkan pesan loading awal
      let loadingMessage = await sock.sendMessage(m.from, {
        text: "🤖 Ami sedang berpikir",
      });

      // Waktu mulai berpikir
      const startTime = Date.now();

      // Variabel untuk mengumpulkan isi <think> dan respon akhir
      let thinkContent = "";
      let finalResponse = "";
      let withinThink = false;
      let thinkEnded = false;
      let buffer = "";

      // Variabel animasi
      let baseIndex = 0;
      let dots = "";
      let lastAnimationUpdate = Date.now();

      // Loading animation: base messages ala Ghibli style
      const loadingBases = [
        "🌈 Mengukir pelangi rahasia di langit imajinasi",
        "🚀 Meluncur perlahan ke angkasa pengetahuan yang hening",
        "🦄 Mencari unicorn impian di lembah sunyi",
        "🌟 Menyusun bintang-bintang inspirasi dalam diam",
        "🍩 Menikmati donat lembut sambil merenung di pagi haru",
        "🎲 Menggulung dadu nasib ide-ide halus dan tak terduga",
        "🔮 Menatap bola kristal, menunggu bisikan masa depan",
        "🎈 Meniup balon harapan dengan lembut di atas awan biru",
        "🥁 Drum roll, bisikan jawaban mulai terurai",
        "📚 Membuka buku rahasia alam semesta dengan ketenangan",
        "🎧 Memutar melodi angin, menyejukkan pikiran yang riang",
        "🧩 Menyatukan kepingan puzzle dari mimpi dan realita",
        "🌞 Menyerap sinar mentari inspirasi dengan hati yang hangat",
        "🌊 Menyelam ke dasar lautan keheningan pengetahuan",
        "✈️ Terbang menyusuri awan lembut di atas cakrawala imajinasi",
        "🔥 Menyalakan bara semangat dengan sentuhan kehangatan alam",
        "🍀 Menyusuri embun pagi untuk menemukan keberuntungan",
        "🎨 Melukis kanvas jawaban dengan warna-warna alam yang lembut",
        "🕰 Mengatur detik demi detik dalam irama waktu yang tenang",
        "🎤 Melatih bisikan alam dalam pidato penuh harapan",
        "🍉 Membelah kesegaran ide-ide yang menggiurkan",
        "🛰 Menangkap sinyal rahasia dari jauh di antara bintang-bintang",
        "🧪 Meracik ramuan magis dengan sentuhan misteri alam",
        "🌌 Menjelajahi galaksi sunyi yang penuh keajaiban",
        "🌱 Menanam benih mimpi di taman inspirasi yang abadi",
        "🍕 Memesan pizza kreativitas dengan topping kehangatan hati",
        "🤹‍♂️ Menyulam ide bagai pertunjukan sirkus di malam sepi",
        "📡 Menangkap bisikan alam dalam sinyal yang halus",
        "🔋 Mengisi ulang spirit melalui pelukan embun pagi",
        "🚧 Membuka jalan sunyi menuju jawaban yang tersembunyi",
        "🌿 Menyatu dengan alam, mendengarkan hening yang dalam",
        "🐾 Menapaki jejak lembut di jalan-jalan rahasia hutan",
        "🍃 Dihembus angin sejuk, mengantar inspirasi yang tulus",
        "🌸 Mekar bersama bunga-bunga mimpi yang wangi",
        "☕ Menyeduh secangkir kehangatan di pagi yang permai",
        "📖 Menulis puisi sunyi di lembaran rahasia alam",
        "🧸 Memeluk kenangan manis dari dongeng masa kecil",
        "🦋 Terbang bersama kupu-kupu, membawa pesan keajaiban",
        "🎈 Mengangkat balon kecil, seakan berharap pada langit",
        "🌷 Merangkai mawar pengetahuan dengan keanggunan alam",
        "🐚 Mendengarkan suara lautan yang menceritakan kisah sunyi",
        "🍯 Meneteskan madu Inspirasi ke dalam jiwa yang lelah",
        "🕯 Menerangi malam dengan cahaya kecil yang menenangkan",
        "🎐 Mengalunkan irama angin lembut yang berbisik rapi",
        "🌙 Berlayar dalam keheningan malam dengan rembulan setia",
        "🍄 Menjejak hutan mistis, menemukan keajaiban tersembunyi",
        "🌺 Menyusun rangkaian bunga, mewarnai hari dengan harapan",
        "🛁 Berendam dalam embun solusi yang menyejukkan",
        "🧁 Menghias kelezatan jawaban bagaikan kue penuh cinta",
        "🐳 Menyelam bersama paus bijak di samudra kebijaksanaan",
        "🌌 Mengukir bintang dengan lembut di langit yang bersahaja",
        "🍃 Daun-daun menari, menyampaikan pesan alam terindah",
        "🐠 Berenang di antara rona biru lautan informasi",
        "☂️ Menikmati tetesan hujan, membawa kisah imajinasi",
        "🍓 Memetik buah segar dari kebun mimpi yang asri",
        "📬 Mengirim surat oleh burung merpati dengan pesan damai",
        "🎇 Menghidupkan kembang api emosi dalam diam yang mendalam",
        "🍦 Menyajikan es krim pengetahuan dengan rasa manis alami",
        "🐢 Bergerak perlahan, namun pasti, di jalan hidup yang sunyi",
        "🌻 Menyambut fajar dengan senyum hangat ibarat matahari pagi",
        "🌴 Berteduh di bawah naungan pohon hidup yang damai",
        "🐇 Melompat ringan, menyusuri lembah mimpi yang riang",
        "☁️ Melukis bentuk awan dengan irama asa yang lembut",
        "🍁 Menerima gugur dedaunan sebagai tanda regenerasi jiwa",
        "🦜 Mendengarkan simfoni burung, harmoni alam yang menenangkan",
        "🎵 Menjadikan melodi alam sebagai lagu penyejuk hati",
        "🎀 Mengikat simpul keindahan di setiap helai solusi",
        "🌈 Mengumpulkan warna-warni mimpi di ufuk senja",
        "🐝 Memetik madu dari bunga-bunga rahasia di taman sunyi",
        "🍀 Menemukan sentuhan keberuntungan di setiap helaian embun",
        "🥢 Menjepit ide-ide lembut dengan ketelitian dan cinta",
        "🎁 Membuka kotak ajaib yang penuh kejutan alam",
        "🧚‍♀️ Ditaburkan debu peri, membawa semangat yang menawan",
        "🍥 Menganyam pusaran mimpi dalam tarian lembut waktu",
        "🌊 Mengikuti arah sungai pengetahuan dengan tenang",
        "🌟 Menggapai sinar bintang dengan penuh kepercayaan",
        "🍭 Menikmati manisnya lolipop dalam mimpi yang lembut",
        "🕊 Menerbangkan merpati damai, membawa pesan jiwa",
        "🐾 Mengikuti jejak kecil di jalur sunyi penuh cerita",
        "🌱 Menyemai harapan baru dengan benih cinta alam",
        "🛸 Menjelajah alam semesta dalam bisikan rahasia",
        "☕ Menyeduh secangkir ide, hangat dan mendamaikan",
        "🌸 Menenun benang pemikiran di antara debu mimpi",
        "📖 Mencatat lembaran kisah dalam buku waktu yang hening",
        "🪐 Melintas orbit harapan dengan pesona alam semesta",
        "🍂 Menyambut gugurnya dedaunan dengan syukur yang dalam",
        "🌌 Menatap langit malam, penuh rahasia dan bintang",
        "🌿 Menyegarkan jiwa dengan kelembutan aroma hutan",
        "🚣 Menyusuri sungai kecil, pelajaran alam yang mendalam",
        "⚘ Menyerap keindahan bunga liar di padang sunyi",
        "🍀 Menyapa keberuntungan dengan kelembutan sentuhan alam",
        "🌙 Merenung dalam cahaya rembulan yang purnama",
        "✨ Mengira keajaiban dalam setiap tetes embun pagi",
        "💫 Menganyam mimpi di antara kerlip bintang malam",
        "🌄 Menyambut fajar dengan pelukan harapan baru",
        "🏞 Mengarungi lembah sunyi, hening penuh bisikan alam",
        "🌌 Menguak misteri galaksi dengan mata penuh harapan",
        "🌺 Merayakan keindahan hari dalam setiap hembusan angin",
        "💛 Menyeruput kehangatan matahari dengan jiwa yang murni",
        "🌟 Mewarnai dunia dengan imajinasi seindah bintang",
        "🏕 Mengabadikan keheningan malam di bawah langit penuh bintang",
        "🌅 Menyatu dengan senja, meresapi bisikan alam yang syahdu",
      ];

      // Debounce untuk update pesan
      const debouncedUpdate = debounce(async (messageContent) => {
        try {
          await sock.sendMessage(m.from, {
            text: messageContent,
            edit: loadingMessage.key,
          });
        } catch (error) {
          console.error("Gagal update pesan:", error);
        }
      }, 500); // Update maksimal setiap 500ms

      try {
        // Panggil LLM dengan streaming
        const chatCompletion = await groq.chat.completions.create({
          messages: context,
          model: "deepseek-r1-distill-llama-70b",
          temperature: 0.6,
          stream: true,
          reasoning_format: "raw",
        });

        // Iterasi melalui stream
        for await (const chunk of chatCompletion) {
          const content = chunk.choices[0]?.delta?.content || "";
          buffer += content;

          // Update animasi setiap 1 detik
          const now = Date.now();
          if (now - lastAnimationUpdate >= 1000) {
            if (dots.length < 3) {
              dots += ".";
            } else {
              dots = "";
              baseIndex = Math.floor(Math.random() * loadingBases.length);
            }
            lastAnimationUpdate = now;
          }

          let processed = false;
          do {
            processed = false;
            if (!withinThink) {
              const thinkStartIndex = buffer.indexOf("<think>");
              if (thinkStartIndex !== -1) {
                finalResponse += buffer.substring(0, thinkStartIndex);
                buffer = buffer.substring(thinkStartIndex + 7);
                withinThink = true;
                processed = true;
              } else {
                finalResponse += buffer;
                buffer = "";
              }
            } else if (withinThink && !thinkEnded) {
              const thinkEndIndex = buffer.indexOf("</think>");
              if (thinkEndIndex !== -1) {
                thinkContent += buffer.substring(0, thinkEndIndex);
                buffer = buffer.substring(thinkEndIndex + 8);
                thinkEnded = true;
                const endTime = Date.now();
                const thinkingTime = ((endTime - startTime) / 1000).toFixed(1);

                // Update final think
                const animatedMessage = `🧠 Selesai berpikir (${thinkingTime}s)\n\n${formatThinkContent(
                  thinkContent
                )}`;
                await sock.sendMessage(m.from, {
                  text: animatedMessage,
                  edit: loadingMessage.key,
                });
                processed = true;
              } else {
                thinkContent += buffer;
                buffer = "";

                // Update dengan debounce
                const animatedMessage = `${
                  loadingBases[baseIndex]
                }${dots}\n\n${formatThinkContent(thinkContent)}`;
                debouncedUpdate(animatedMessage);
              }
            } else if (thinkEnded) {
              finalResponse += buffer;
              buffer = "";
            }
          } while (processed && buffer.length > 0);
        }

        if (!finalResponse.trim()) {
          await sock.sendMessage(m.from, {
            text: "Maaf, Ami tidak bisa menemukan jawaban. Coba tanyakan lagi!",
            edit: loadingMessage.key,
          });
          return;
        }

        finalResponse = parseMemoryTags(finalResponse, userContext);
        const finalMessage = await sock.sendMessage(m.from, {
          text: `*🤖 Jawaban Ami:*\n\n${finalResponse.trim()}`,
        });

        // Update history
        userContext.history.push({
          id: finalMessage.key.id,
          role: "assistant",
          content: finalResponse,
        });

        /*if (userContext.history.length > 50) {
          userContext.history = userContext.history.slice(-50);
        }*/
        writeUserContext(userId, userContext);
      } catch (error) {
        console.error("Error:", error);
        await sock.sendMessage(m.from, {
          text: "Waduh, ada kendala saat memproses pesanmu. Coba lagi nanti ya!",
          edit: loadingMessage.key,
        });
      }
    },
  });
};

// Fungsi untuk mencari dan menangani memory action add/remove
function parseMemoryTags(text, userContext) {
  const memoryRegex =
    /<memory\s+action=["'](add|remove)["']\s+id=["']([^"']+)["']\s+userId=["']([^"']+)["']>(.*?)<\/memory>/gs;
  let match;
  while ((match = memoryRegex.exec(text)) !== null) {
    const [fullTag, action, memId, userId, content] = match;
    if (action === "add") {
      addMemory(userContext, memId, userId, content.trim());
    } else if (action === "remove") {
      removeMemory(userContext, memId, userId);
    }
  }
  return text.replace(memoryRegex, "").trim();
}

// Fungsi untuk membangun riwayat konteks relevan
function buildRelevantHistory(userContext, quotedId) {
  const allHistory = userContext.history || [];
  let relevantHistory = [];
  if (quotedId) {
    const quotedMsg = allHistory.find((msg) => msg.id === quotedId);
    if (quotedMsg) relevantHistory.push(quotedMsg);
  }
  const remain = allHistory.slice(-9);
  relevantHistory = relevantHistory.concat(remain);
  return relevantHistory;
}
