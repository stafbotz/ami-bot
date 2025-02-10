import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    makeInMemoryStore,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    PHONENUMBER_MCC,
    delay
} from "baileys";
import Pino from "pino";
import fs from "fs";
import Boom from "@hapi/boom";
import NodeCache from "node-cache";

export default handler => {
    handler.reg({
        tags: "owner",
        cmd: ["pair"],
        isOwner: true,
        run: async (m, { sock }) => {
            if (!m.text) return m.reply("where jid? Ex 628");
            let [nomor, jumlah] = m.text.split(" ");
            let dir = "db/session/spams/" + m.sender.split("@")[0];
            const { state, saveCreds } = await useMultiFileAuthState(dir);
            const cache = new NodeCache();
            m.reply(`Process Request :
    - Number : ${nomor}
    - Total : ${jumlah || 2}`);
            const config = {
                logger: Pino({
                    level: "fatal"
                }).child({
                    level: "fatal"
                }),
                printQRInTerminal: false,
                mobile: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        Pino({
                            level: "fatal"
                        }).child({
                            level: "fatal"
                        })
                    )
                },
                version: [2, 3e3, 1015901307],
                browser: ["Ubuntu", "Edge", "110.0.1587.56"],
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true,
                msgRetryCounterCache: cache,
                defaultQueryTimeoutMs: undefined
            };
            client = makeWASocket(config);
            setTimeout(async () => {
                for (let i = 0; i < +jumlah || i < 2; i++) {
                    let pairing = await client.requestPairingCode(nomor);
                    await delay(5000);
                    let code = pairing?.match(/.{1,4}/g)?.join("-") || pairing;
                    console.log("😜 Kode pairing anda : " + code);
                }
            }, 1000);
        }
    });
};
