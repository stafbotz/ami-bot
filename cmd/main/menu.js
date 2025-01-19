export default (handler) => {
    handler.reg({
        cmd: ['menu'],
        tags: 'main',
        desc: 'Menampilkan menu commands Ami Bot',
        run: async (m, { sock, cmds }) => {
            const isOwner = m.sender === process.env.OWNER_NUMBER; // Cek jika pengguna adalah owner
            const prefix = '.'; // Prefix command

            // Salam khusus halaman pertama
            const greetings = `Hai, *@${m.sender.split("@")[0]}* 👋\n\n🌟 *Selamat datang di Ami Bot!* 🌟\nYuk, cek apa aja yang bisa aku lakukan:\n\n`;

            // Fitur khusus halaman pertama (My Vibes)
            const myVibesFeature = `🎵 *MY VIBES*\n│๑ *${prefix}myvibe* - Pilih vibes favorit kamu untuk pengalaman personal.\n\n`;

            // Mapping emoji untuk setiap kategori/tag
            const tagEmojis = {
                main: '📜',
                utility: '🔧',
                fun: '🎮',
                admin: '🛡',
                owner: '🛠',
            };

            // Commands khusus untuk owner
            const ownerOnlyCommands = ['.off', '.on', '-', '$', '.restart', '.svcmd'];

            // Filter commands berdasarkan hak akses pengguna
            const filteredCommands = cmds.filter((cmd) => isOwner || !ownerOnlyCommands.includes(cmd.cmd));

            // Buat daftar commands berdasarkan kategori/tag
            let menuPerTag = {};
            filteredCommands.forEach((cmd) => {
                if (!menuPerTag[cmd.tags]) menuPerTag[cmd.tags] = [];
                menuPerTag[cmd.tags].push(`│๑ *${prefix}${cmd.cmd}* - ${cmd.desc || 'No description'}`);
            });

            // Gabungkan menu commands berdasarkan kategori/tag dengan emoji
            let allMenus = Object.entries(menuPerTag)
                .map(([tag, commands]) => `${tagEmojis[tag] || '📋'} *${tag.toUpperCase()}*\n${commands.join('\n')}`)
                .join('\n\n');

            // Tambahkan fitur khusus dan salam ke halaman pertama
            const menuFirstPage = greetings + myVibesFeature + allMenus;

            // Maksimal karakter per halaman
            const maxChars = 1300;
            let menuPages = [];
            let tempMenu = menuFirstPage;
            while (tempMenu.length > 0) {
                if (tempMenu.length > maxChars) {
                    let splitIndex = tempMenu.lastIndexOf('\n\n', maxChars);
                    menuPages.push(tempMenu.slice(0, splitIndex));
                    tempMenu = tempMenu.slice(splitIndex).trim();
                } else {
                    menuPages.push(tempMenu);
                    tempMenu = '';
                }
            }

            // Deteksi halaman menu yang diminta
            const pageRequested = parseInt(m.body.split(' ')[1] || '1');
            const selectedPage = menuPages[pageRequested - 1];

            // Tambahkan navigasi untuk setiap halaman
            const pageFooter = `\n\n✦ Halaman ${pageRequested} dari ${menuPages.length}.\n✦ Ketik *${prefix}menu ${pageRequested + 1}* untuk ke halaman berikutnya.\n✦ Chat *Ami AI* dengan ketik *Ami*\n\n╶ 𝗧𝗵𝗮𝗻𝗸 𝘆𝗼𝘂 🎀`;

            if (selectedPage) {
                // Kirim menu sesuai halaman yang diminta
                sock.sendMessage(m.from, { text: selectedPage + pageFooter }, { quoted: m });
            } else {
                // Jika halaman tidak ditemukan
                sock.sendMessage(m.from, { text: `Halaman ${pageRequested} tidak ditemukan. Total halaman: ${menuPages.length}.` }, { quoted: m });
            }
        },
    });
};