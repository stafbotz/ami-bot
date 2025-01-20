/*
pengaturan lainnya ada di db.setting. anda bisa gunakan command owner. default bahasa adalah id. lakukan perintah - db.setting.lang = "en" atau kode bahasa lainnya untuk mengubahnya
-
Other settings are in db.setting. you can use the owner command. default language is id. do the command - db.setting.lang = "en" or any other language code to change it
*/
export default {
    bot_logo: "",
    
    /* database setting */
    db: {
        local: "mywadb.json",
        mongo: "url"
    },
    
    groqApiKey: "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",
    owner: ["6281360190018"],
    typedb: "json", // use json / mongo
}
