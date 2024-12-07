import axios from 'axios'
// pr from @Abuzzpoet
export default (handler) => {
  handler.reg({
    cmd: ['sdcd'],
    tags: 'ai',
    desc: 'Claude-Sonnet-3.5',
    isLimit: true,
    run: async (m) => {
        const print = await func.loads("amiruldev/print.js")
        m.reply(`${print}`, true)
    },
  })
}
