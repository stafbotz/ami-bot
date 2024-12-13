[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#table-of-contents)
### Ami Bot
[![-----------------------------------------------------](https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/colored.png)](#table-of-contents)
- [x] Support Single & Multi Handler
- [x] Support CommonJs & ESM
- [x] Stable On Ram 350MB
- [x] Support Termux, VPS, RDP (Windows)
- [x] Support Panel Pterodactyl
- [x] Support cPanel, Plesk
- [x] Support Session Internal (Json) & External (MongoDB)
- [ ] Support Case (Soon)
- [ ] Support Multi Type Plugins (Soon)
- [ ] Support Running Code Python (Soon)
- [ ] Support Running Code Shell Script - Bash (Soon)

### Add Plugins Command Support Multi
```Javascript
export default (handler) => {
    handler.reg({
        cmd: ['command1', 'command2'],
        tags: 'main',
        desc: 'Deskripsi command',
        isLimit: true,
        ...opsi lain,
        run: async (m, { sock, dll }) => {
            m.reply("hello world")
        }
    })
// tambahkan lagi seperti ini jika ingij 1 file 2 fitur/lebih
    handler.reg({
        cmd: ['command1', 'command2'],
        tags: 'main',
        desc: 'Deskripsi command',
        isLimit: true,
        ...opsi lain,
        run: async (m, { sock, dll }) => {
            m.reply("hello world")
        }
    })
}
```
> command 1 didalam cmd itu yang nanti akan ditampilkan di list menu
> islimit jika true = memotong 1 limit, jika ingin potong 2/3 limit jadikan isLimit: 2, sesuaikan nominal yang kamu mau
> ...Opsi lain itu adalah opsional seperti dibawah ini
1. isOwner
2. isAdmin
3. isBotAdmin
4. isGroup
5. isPrivate
> contoh penggunaan: isOwner: true,
> unuk opsi dll setelah sock itu adalah (sock, db, util, color, func, scraper)
### Add Handler Function
```Javascript
export default function (handler) {
    handler.addFunction(async (m, { sock, dll }) => {
        if (m.body === "bot") return m.reply(" hello")
    })
}
```
> isi dll sama seperti contoh plugins db, util dll
