import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default (handler) => {
    handler.reg({
        cmd: ['menu', 'list', 'help', 'start'],
        tags: 'main',
        desc: 'Show all commands',
        run: async (m, { sock, cmds, db, func }) => {
            const commandGroups = {}
            const baseDir = path.join(__dirname)

            if (!fs.existsSync(baseDir)) {
                console.error(`[ERROR] Directory not found: ${baseDir}`)
                await m.reply("Command directory not found.")
                return
            }

            const loadCommands = (dir) => {
                const items = fs.readdirSync(dir)
                items.forEach(item => {
                    const itemPath = path.join(dir, item)
                    if (fs.statSync(itemPath).isDirectory()) {
                        loadCommands(itemPath) // Rekursif untuk subfolder
                    } else if (path.extname(item) === '.js') {
                        import(itemPath).then(commandModule => {
                            if (commandModule.default) {
                                commandModule.default(handler)
                            }
                        }).catch(error => {
                            console.error(`[ERROR] Failed to load command from ${itemPath}:`, error)
                        })
                    }
                })
            }

            loadCommands(baseDir)

            for (const [command, details] of cmds) {
                const tag = details.tags || 'LAINNYA'
                if (!commandGroups[tag]) {
                    commandGroups[tag] = []
                }

                const commandText = `${command}${details.isLimit ? ' ♤' : ''}\n> ${details.desc}`

                // Pastikan command untuk owner tidak ditampilkan jika bukan owner
                if (tag === 'owner' && !m.isOwner) continue

                if (!commandGroups[tag].some(cmd => cmd.includes(`\n> ${details.desc}`))) {
                    commandGroups[tag].push(commandText)
                }
            }

            const orderedTags = ['main', 'convert', 'ai', 'downloader', 'group', 'channel', 'owner', 'tools', 'anime']
            const tagEmojis = {
                main: '📜',
                convert: '🔄',
                ai: '🤖',
                downloader: '📥',
                group: '👥',
                channel: '📡',
                owner: '🛠',
                tools: '🧰',
                anime: '🎌',
                lainnya: '📋'
            }

            const greetings = `Hi, *@${m.sender.split("@")[0]}* 👋\n\n🌟 *Selamat datang di Ami Bot!* 🌟`
            const myVibesFeature = `🎵 *MY VIBES*\n│๑ *.myvibe* - Pilih vibes favorit kamu untuk pengalaman personal.\n\n`
            const header = `${greetings}\n\n${myVibesFeature}Bot ini masih dalam tahap beta\n\n*♤ : Command Memakai Limit*\n\n`

            let menu = ''
            let counter = 1

            orderedTags.forEach(tag => {
                const upperTag = tag.toUpperCase()
                if (commandGroups[tag]) {
                    menu += `${tagEmojis[tag] || '📋'} *# ${upperTag} MENU* (${commandGroups[tag].length})\n`
                    commandGroups[tag].forEach(command => {
                        menu += `${counter}. ${command}\n`
                        counter++
                    })
                    menu += '\n'
                }
            })

            const maxChars = 1300
            let pages = []
            let tempMenu = header + menu

            while (tempMenu.length > 0) {
                if (tempMenu.length > maxChars) {
                    let splitIndex = tempMenu.lastIndexOf('\n\n', maxChars)
                    pages.push(tempMenu.slice(0, splitIndex).trim())
                    tempMenu = tempMenu.slice(splitIndex).trim()
                } else {
                    pages.push(tempMenu.trim())
                    tempMenu = ''
                }
            }

            const pageRequested = parseInt(m.body.split(' ')[1] || '1')
            const selectedPage = pages[pageRequested - 1]

            if (selectedPage) {
                const footer = `\n\n✦ Halaman ${pageRequested} dari ${pages.length}\n✦ Ketik *.menu ${pageRequested + 1}* untuk halaman berikutnya.`
                await sock.sendMessage(m.from, { text: selectedPage + footer }, { quoted: m })
            } else {
                await sock.sendMessage(m.from, { text: `Halaman ${pageRequested} tidak ditemukan. Total halaman: ${pages.length}.` }, { quoted: m })
            }
        }
    })
}