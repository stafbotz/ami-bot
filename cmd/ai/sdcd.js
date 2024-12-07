import axios from 'axios'
import { writeFile } from 'fs/promises';

// pr from @Abuzzpoet
export default (handler) => {
  handler.reg({
    cmd: ['gfa'],
    tags: 'ai',
    desc: 'Get File Amirul',
    isLimit: true,
    run: async (m,  { func }) => {
    	if (!m.quoted && !m.text) {
                return m.reply('file amirul mana?', true)
        }
        const alok = await func.loads(`amiruldev/${m.text}`)
        await writeFile(m.text, alok.toString());
        m.reply("ok berhasil di simpan", true)
    },
  })
}
