import { date, time, getGreeting } from "../../system/function.js";

export default function (handler) {
    handler.addFunction(async (m, { sock, db }) => {
        if (m.body == "halop") return m.reply(`halo apa ${time}`);
    });
}
