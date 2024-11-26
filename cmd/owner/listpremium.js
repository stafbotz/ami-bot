import moment from "moment-timezone"
import { checkPremiumUser, getPremiumExpired, getAllPremiumUser } from "../../system/db/premium.js"

export default (handler) => {
    handler.reg({
        cmd: ['listpremium', 'listprem', 'premiumlist'],
        tags: 'owner',
        desc: 'list premium user.',
        isOwner: true,
        run: async (m, { db }) => {
            const premiumUsers = getAllPremiumUser(db) // Mendapatkan semua pengguna premium

            if (premiumUsers.length === 0) {
                return m.reply('❌ Tidak ada pengguna premium saat ini.')
            }

            let message = '*📋 Daftar Pengguna Premium:*\n\n'
            premiumUsers.forEach((userId, index) => {
                // Cek ulang apakah status premium valid
                const isValidPremium = checkPremiumUser(userId, db)
                if (!isValidPremium) return // Skip jika premium tidak valid

                const user = db.users[userId]
                const expTime = getPremiumExpired(userId, db)

                const expiryDate = expTime === 0
                    ? 'Tanpa Batas Waktu'
                    : moment(expTime).tz('Asia/Jakarta').format('HH:mm:ss [WIB], DD MMMM YYYY')

                message += `*${index + 1}. ${user.name || 'Tidak Diketahui'}* (@${userId.split('@')[0]})\n`
                message += `   └ Expired: ${expiryDate}\n\n`
            })

            if (message.trim() === '*📋 Daftar Pengguna Premium:*\n\n') {
                // Jika semua premium sudah kedaluwarsa
                return m.reply('❌ Tidak ada pengguna premium yang valid saat ini.')
            }

            m.reply({
                text: message.trim(),
                mentions: premiumUsers, // Memastikan semua pengguna premium disebutkan
            })
        },
    })
}