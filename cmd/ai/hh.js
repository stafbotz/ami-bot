import { date, time, getGreeting } from "../../system/function.js";

export default function (handler) {
    handler.addFunction(async (m, { sock, db }) => {
        if (time(Date.now(), { timeZone: "Asia/Jakarta" }) == "19:07") {
            sock.sendMessage("62882017534504@s.whatsapp.net", { text: "halo" });
        }
    });
}
