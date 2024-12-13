/* module internal */
import setting from "./setting.js"

const schema = async (m, sock, db) => {
    const isNumber = x => typeof x === "number" && !isNaN(x)
    const isBoolean = x => typeof x === "boolean" && Boolean(x)
    db.users = db.users || {}
    db.groups = db.groups || {}

    let user = db.users[m.sender]
    if (typeof user !== "object") db.users[m.sender] = {}
    if (user) {
        if (!("name" in user)) user.name = m.pushName
        if (!("lastChat" in user)) user.lastChat = -1
        if (!("ads" in user)) user.ads = -1
        if (!("lang" in user)) user.lang = ""
        if (!isNumber(user.afk)) user.afk = -1
        if (!("afk_reason" in user)) user.afk_reason = ""
        if (!isNumber(user.exp)) user.exp = 0
        if (!isNumber(user.saldo)) user.saldo = 0
        if (!isNumber(user.point)) user.point = 0
        if (!("exp_prem" in user)) user.exp_prem = 0
        if (!isBoolean(user.premium)) user.premium = false
        if (!isBoolean(user.autoDownload)) user.autoDownload = false
        if (!isBoolean(user.autoSticker)) user.autoSticker = false
        if (!isBoolean(user.banned)) user.banned = false
        if (!("logAi" in user)) user.logAi = []
        if (!("total_trx" in user)) user.total_trx = 0
        if (!("jumlah_trx" in user)) user.jumlah_trx = 0
        if (!("depo" in user)) user.depo = {}
    } else {
        db.users[m.sender] = {
            name: m.pushName,
            lastChat: -1,
            ads: -1,
            lang: "",
            afk: -1,
            afk_reason: "",
            exp: 0,
            saldo: 0,
            point: 0,
            exp_prem: 0,
            premium: false,
            banned: false,
        }
    }

    if (m.isGroup) {
        let group = db.groups[m.from]
        if (typeof group !== "object") db.groups[m.from] = {}
        if (group) {
            if (!("name" in group)) group.name = await sock.getName(m.from)
            if (!isNumber(group.lastChat)) group.lastChat = new Date() * 1
            if (!isBoolean(group.mute)) group.mute = false
            if (!isBoolean(group.antiLink)) group.antiLink = false
            if (!("blacklist" in group)) group.blacklist = []
        } else {
            db.groups[m.from] = {
                name: await sock.getName(m.from),
                lastChat: new Date() * 1,
                mute: false,
                antiLink: false,
                blacklist: []
            }
        }
    }

    let setting = db.setting
    if (typeof setting !== "object") db.setting = {}
    if (setting) {
        if (!("readstory" in setting)) setting.readstory = true
        if (!("reactstory" in setting)) setting.reactstory = true
        if (!("autoread" in setting)) setting.autoread = false
        if (!("self" in setting)) setting.self = false
        if (!("number" in setting)) setting.number = ""
        if (!("owner" in setting)) setting.owner = setting.owner
        if (!("ch_id" in setting)) setting.ch_id = "120363181344949815@newsletter"
        if (!("bot_logo" in setting)) setting.bot_logo = setting.bot_logo
        if (!("dev" in setting)) setting.dev = "Made by Renshu Visualz"
        if (!("lang" in setting)) setting.lang = "id"
    } else {
        db.setting = {
            readstory: true,
            reactstory: true,
            autoread: false,
            self: false,
            number: "",
            owner: setting.owner,
            ch_id: "120363181344949815@newsletter",
            bot_logo: setting.bot_logo,
            dev: "Made by Renshu Visualz",
            lang: "id"
        }
    }
}

export default { schema }