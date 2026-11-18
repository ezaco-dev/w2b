# w2b

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/WhatsBot-WhatsApp%20Bot-25D366?style=for-the-badge&logo=whatsapp" alt="WhatsApp Bot">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/Baileys-6.7.9-orange?style=for-the-badge" alt="Baileys">
</p>

**w2b** (*WhatsApp Bot Helper*) — wrapper tipis & ekspresif di atas **[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)**.  
Tujuannya satu: **bikin bot WhatsApp jadi se-simple mungkin** — setup sekali, routing deklaratif, aksi langsung.

```bash
npm install w2b
```

---

## 🚀 Quick Start

```js
// main.js
import { Setup, Route, Run, Text, Image, Sticker } from 'w2b';

// 1️⃣ Setup global (opsional)
Setup({
  Owner: "628xx",      // Nomor owner (untuk fitur OwnerOnly)
  Prefix: "!",         // Prefix command default
  GrubOnly: false,     // Hanya grup?
  PrivateOnly: false,  // Hanya private?
  OwnerOnly: false,    // Hanya owner?
  AdminOnly: false     // Hanya admin grup?
});

// 2️⃣ Daftarkan route (command → aksi)
Route({
  // Command sederhana
  "ping": Text("pong! 🏓"),
  
  // Multiple aksi sekaligus
  "hai": [
    Text("Halo! 👋"),
    Image("https://example.com/gambar.jpg", "Ini gambarnya")
  ],
  
  // Stiker dari media yang dikirim user (reply)
  "stiker": Sticker(GetMedia()),
  
  // Hapus pesan yg mengandung kata kotor
  [Include(["kasar", "kotorr"])]: Delete(),
  
  // Argumen: "say hello world" → bot balas "hello world"
  "say": Arg(1, 10),
  
  // Tombol interaktif
  "menu": [
    Text("Pilih:"),
    Button("Halo", UsrSend("halo")),
    Button("Bye", UsrSend("bye"))
  ]
});

// 3️⃣ Jalankan
Run({ Qrcode: true, Pairing: false, SessionName: "bot-ku" });
```

```bash
node main.js
# Scan QR → bot hidup!
```

---

## 📦 Struktur Project

```
w2b/
├── index.js           # Entry point — ekspor semua publik
├── package.json       # Metadata & dependencies
├── src/
│   ├── config.js      # Setup & config global/per-command
│   ├── routing.js     # Route(), Include()
│   ├── bot.js         # Run(), Event(), Reload(), GetSession()
│   ├── actions.js     # Text, Image, Video, Document, Audio, Sticker, Poll, Location, Delete, Ban, Button, UsrSend
│   ├── placeholders.js# GetUsrId, Mention, Arg, GetMedia
│   ├── context.js     # executionContext (internal)
│   ├── logger.js      # Pino logger wrapper
│   └── cli.js         # CLI helpers
```

---

## 📚 API Reference — Lengkap dengan Contoh

### 1. `Setup(config)` — Konfigurasi Global

Dipanggil **sebelum** `Route()` & `Run()`. Bisa dipanggil berkali-kali (override).

| Opsi | Tipe | Default | Deskripsi |
|------|------|---------|-----------|
| `Owner` | `string` | `""` | Nomor owner (format: `628xx`). Digunakan `OwnerOnly`, `Ban()`, dsb. |
| `Prefix` | `string` | `""` | Prefix command global (mis. `"!"`, `"/"`, `"."`). |
| `GrubOnly` | `boolean` | `false` | Hanya respon di grup. |
| `PrivateOnly` | `boolean` | `false` | Hanya respon di chat pribadi. |
| `OwnerOnly` | `boolean` | `false` | Hanya respon ke owner. |
| `AdminOnly` | `boolean` | `false` | Hanya respon ke admin grup (bot harus admin). |

```js
Setup({
  Owner: "628123456789",
  Prefix: "!",
  GrubOnly: false,
  OwnerOnly: false
});
```

> **Tip:** `Setup()` juga bisa dipakai **per-command** (lihat bagian *Per-Command Config*).

---

### 2. `Route(mapping)` — Pendaftaran Command

Menerima **object** dengan key = command (string atau array), value = aksi (function/array).

```js
Route({
  // ── Command dasar ──
  "ping": Text("pong!"),
  "hai": [Text("Halo!"), Text("Ada yang bisa dibantu?")],
  
  // ── Array command (alias) ──
  ["p", "ping", "test"]: Text("pong!"),
  
  // ── Include: deteksi kata di mana saja di pesan ──
  [Include(["bodoh", "tolol", "goblok"])]: Delete(),
  Include("link grup"): Text("Dilarang share link grup!"),
  
  // ── Argumen: ambil kata ke-N sampai M ──
  // User: "say hello world" → bot: "hello world"
  "say": Arg(1, 10),
  
  // ── Placeholder media (reply media) ──
  "stiker": Sticker(GetMedia()),
  "kirimgambar": Image(GetMedia(), "Ini gambarmu"),
  "kirimvideo": Video(GetMedia()),
  "kirimdok": Document(GetMedia(), "File dari kamu"),
  
  // ── Mention & GetUsrId ──
  "siapa": Text(`Kamu: @${GetUsrId()}`),           // Mention otomatis pengirim
  "tagowner": Text(`Owner: ${Mention("628xx@s.whatsapp.net")}`),
  
  // ── Ban user (hapus dari grup) ──
  "ban": Ban(GetUsrId()),
  "ban @user": Ban(Mention("@user")),
  
  // ── Button interaktif ──
  "btn": [
    Text("Pilih:"),
    Button("Opsi 1", UsrSend("opsi1")),
    Button("Opsi 2", UsrSend("opsi2"))
  ],
  "opsi1": Text("Kamu pilih Opsi 1 ✅"),
  "opsi2": Text("Kamu pilih Opsi 2 ✅"),
  
  // ── Poll ──
  "poll": Poll("Makan apa?", ["Nasi Goreng", "Mie Ayam", "Sate"]),
  
  // ── Location ──
  "lokasi": Location(-6.2088, 106.8456, "Monas", "Jakarta Pusat"),
  
  // ── Reload config tanpa restart ──
  "reload": Reload(),
  
  // ── Per-command Setup (override global) ──
  "owneronly": [
    Setup({ OwnerOnly: true }),  // Hanya owner yg bisa jalankan command ini
    Text("Ini cuma buat owner! 👑")
  ],
  "gruponly": [
    Setup({ GrubOnly: true }),
    Text("Command ini hanya di grup 📍")
  ],
  
  // ── Custom handler pakai Event (advanced) ──
  // Lihat bagian Event()
});
```

#### Bentuk Key Command

| Bentuk | Contoh | Artinya |
|--------|--------|---------|
| `string` | `"ping"` | Match exact `ping` |
| `string[]` | `["p", "ping"]` | Match `p` ATAU `ping` |
| `Include(words)` | `Include("halo")` | Match jika pesan **mengandung** kata "halo" |
| `Include(words[])` | `Include(["a","b"])` | Match jika pesan mengandung **salah satu** kata |

---

### 3. Aksi Kirim Pesan — `src/actions.js`

Semua aksi **return config object** yang dieksekusi oleh `Run()`.

| Fungsi | Parameter | Contoh |
|--------|-----------|--------|
| **`Text(text)`** | `text: string` | `Text("Halo!")` |
| **`Image(urlOrPath, caption?)`** | `urlOrPath: string`, `caption?: string` | `Image("https://.../img.jpg", "Caption")` |
| **`Video(urlOrPath, caption?)`** | `urlOrPath: string`, `caption?: string` | `Video("./video.mp4", "Lucu!")` |
| **`Document(urlOrPath, caption?, filename?)`** | `urlOrPath: string`, `caption?: string`, `filename?: string` | `Document("./file.pdf", "Ini PDF", "laporan.pdf")` |
| **`Audio(urlOrPath, ptt?)`** | `urlOrPath: string`, `ptt?: boolean` | `Audio("./voice.ogg", true)` → voice note |
| **`Sticker(urlOrPath)`** | `urlOrPath: string` | `Sticker(GetMedia())` |
| **`Poll(question, options[])`** | `question: string`, `options: string[]` | `Poll("Pilih:", ["A","B"])` |
| **`Location(lat, lon, name?, address?)`** | `lat: number`, `lon: number`, `name?: string`, `address?: string` | `Location(-6.2, 106.8, "Monas", "Jakarta")` |
| **`Delete()`** | — | `Delete()` → hapus pesan trigger (bot harus admin) |
| **`Ban(userId)`** | `userId: string \| UserPlaceholder` | `Ban(GetUsrId())` → kick user dari grup |
| **`Button(label, usrSend)`** | `label: string`, `usrSend: string \| UsrSend` | `Button("Klik", UsrSend("cmd"))` |
| **`UsrSend(message)`** | `message: string` | `UsrSend("halo")` → kirim seolah user mengetik |

#### Contoh Kombinasi

```js
Route({
  // Multi-aksi sequential
  "welcome": [
    Image("https://example.com/banner.jpg", "Selamat datang! 🎉"),
    Text("Ketik !menu untuk bantuan"),
    Button("Mulai", UsrSend("menu"))
  ],
  
  // Reply media → jadi stiker
  "stiker": Sticker(GetMedia()),
  
  // Voice note (PTT)
  "vn": Audio("./assets/voice.ogg", true),
  
  // Kirim file dengan nama custom
  "apk": Document("./app-release.apk", "Versi terbaru", "w2b-v1.0.apk"),
  
  // Poll interaktif
  "makan": Poll("Makan apa hari ini?", ["Nasi Goreng", "Mie Ayam", "Sate", "Bakso"]),
  
  // Lokasi
  "kantor": Location(-6.21462, 106.84513, "Kantor Pusat", "Jl. Sudirman No. 1"),
  
  // Hapus pesan kasar (bot harus admin grup)
  [Include(["anjg", "bngst", "kntr"])]: Delete(),
  
  // Ban user yg spam
  "ban": [
    Text("Bye! 👋"),
    Ban(GetUsrId())
  ],
  
  // Tombol button (native flow)
  "pilih": [
    Text("Pilih menu:"),
    Button("🍕 Makanan", UsrSend("makanan")),
    Button("🥤 Minuman", UsrSend("minuman")),
    Button("🍰 Dessert", UsrSend("dessert"))
  ]
});
```

---

### 4. Placeholder — `src/placeholders.js`

Digunakan **di dalam Route** untuk akses konteks runtime (pengirim, argumen, media reply).

| Fungsi | Return | Deskripsi |
|--------|--------|-----------|
| **`GetUsrId()`** | `UserPlaceholder` | JID pengirim pesan (format `628xx@s.whatsapp.net`) |
| **`Mention(userId)`** | `string` | Format mention `@user` untuk dikirim di text |
| **`Arg(start, end?)`** | `string \| ArgPlaceholder` | Ambil argumen ke-`start` sampai `end` (0-index) |
| **`GetMedia()`** | `MediaPlaceholder` | Media dari **reply** user (image/video/audio/doc/sticker) |

#### Contoh Penggunaan

```js
Route({
  // Mention pengirim
  "siapa": Text(`Halo @${GetUsrId()}! 👋`),
  
  // Mention nomor tertentu
  "tagowner": Text(`Owner: ${Mention("628123456789@s.whatsapp.net")}`),
  
  // Argumen: "echo hello world" → "hello world"
  // Arg(1) = kata ke-2, Arg(1,3) = kata ke-2 s.d ke-4
  "echo": Arg(1),
  "echo2": Arg(1, 5),
  
  // Reply gambar → balas stiker
  "stiker": Sticker(GetMedia()),
  
  // Reply video → balas video dengan caption
  "balasvideo": Video(GetMedia(), "Ini videomu"),
  
  // Ban user yg reply pesan ini
  "banreply": Ban(GetUsrId()),
  
  // Kombinasi: mention + arg
  "panggil": Text(`${Mention(GetUsrId())} ${Arg(1)}`),
  
  // Simulasi user kirim pesan (untuk button)
  "testbtn": [
    Text("Klik:"),
    Button("Test", UsrSend("halo"))
  ]
});
```

---

### 5. `Event(name, handler)` — Custom Event Handler

Untuk logika **di luar command** (mis. welcome, logging, anti-link, dsb).

```js
import { Event, Text, Delete, GetUsrId, Mention } from 'w2b';

// Welcome group
Event("group-participants-update", async (ctx) => {
  const { action, participants } = ctx.message;
  if (action === "add") {
    for (const jid of participants) {
      await ctx.sock.sendMessage(ctx.key.remoteJid, {
        text: `Selamat datang @${jid.split("@")[0]}! 🎉`,
        mentions: [jid]
      });
    }
  }
});

// Anti link grup (hapus pesan berisi link)
Event("messages.upsert", async (ctx) => {
  const msg = ctx.message;
  if (!msg.message) return;
  const text = getMessageText(msg); // helper internal
  if (text.includes("chat.whatsapp.com") && ctx.isGroup) {
    await ctx.sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
    await ctx.sock.sendMessage(msg.key.remoteJid, { 
      text: `@${GetUsrId()} dilarang share link grup!`,
      mentions: [msg.key.participant]
    });
  }
});

// Logging semua pesan
Event("messages.upsert", (ctx) => {
  const { pushName, key } = ctx.message;
  console.log(`[${new Date().toISOString()}] ${pushName}: ${getMessageText(ctx.message)}`);
});
```

**Event tersedia:** `messages.upsert`, `messages.update`, `messages.delete`, `groups.update`, `group-participants-update`, `connection.update`, `creds.update`, dsb (lihat Baileys docs).

---

### 6. `Run(options)` — Jalankan Bot

```js
Run({
  Qrcode: true,           // Tampilkan QR di terminal (default: true)
  Pairing: false,         // Gunakan pairing code (WhatsApp Web style)
  SessionName: "bot-ku",  // Nama folder session di ./auth/
  PrintQRInTerminal: true // Alias Qrcode
});
```

#### Multi-Session

```js
// Session 1
Run({ Qrcode: true, SessionName: "session-1" });

// Session 2 (pairing code)
Run({ Qrcode: false, Pairing: true, SessionName: "session-2" });

// Akses session lain
import { GetSession, GetSessions } from 'w2b';
const sess = GetSession("session-1");
const all = GetSessions();
```

---

### 7. `Reload()` — Hot Reload Config

Reload route & config **tanpa restart bot**.

```js
Route({
  "reload": Reload(),
  "setprefix": [
    Setup({ Prefix: Arg(1) }),  // Ganti prefix runtime
    Text(`Prefix diubah jadi: ${Arg(1)}`)
  ]
});
```

---

### 8. `Include(words)` — Deteksi Kata di Pesan

Bukan exact match, tapi **substring match** di mana saja.

```js
Route({
  // Hapus pesan yg mengandung kata kotor
  [Include(["anjg", "bngst", "tolol", "goblok"])]: Delete(),
  
  // Auto-reply kalau ada kata "hai"/"hello"
  Include(["hai", "hello", "hi"]): Text("Halo juga! 👋"),
  
  // Deteksi link grup
  Include("chat.whatsapp.com"): [
    Delete(),
    Text("Dilarang share link grup! ❌")
  ]
});
```

---

## 🎨 Contoh Project Lengkap

### `main.js` — Bot Siap Pakai

```js
import { 
  Setup, Route, Run, Reload, Event,
  Text, Image, Video, Document, Audio, Sticker, Poll, Location,
  Delete, Ban, Button, UsrSend,
  GetUsrId, Mention, Arg, GetMedia, Include
} from 'w2b';

// ═══════════════════════════════════════════
// KONFIGURASI GLOBAL
// ═══════════════════════════════════════════
Setup({
  Owner: "628123456789",   // Ganti nomor kamu
  Prefix: "!",
  GrubOnly: false,
  PrivateOnly: false,
  OwnerOnly: false,
  AdminOnly: false
});

// ═══════════════════════════════════════════
// EVENT HANDLER (non-command)
// ═══════════════════════════════════════════
Event("group-participants-update", async (ctx) => {
  const { action, participants } = ctx.message;
  if (action === "add") {
    for (const jid of participants) {
      await ctx.sock.sendMessage(ctx.key.remoteJid, {
        text: `Selamat datang @${jid.split("@")[0]}! 🎉\nKetik !menu untuk bantuan.`,
        mentions: [jid]
      });
    }
  }
});

// Anti link grup
Event("messages.upsert", async (ctx) => {
  const msg = ctx.message;
  if (!msg.message || !ctx.isGroup) return;
  
  const text = msg.message.conversation 
    || msg.message.extendedTextMessage?.text 
    || msg.message.imageMessage?.caption 
    || msg.message.videoMessage?.caption 
    || "";
  
  if (text.includes("chat.whatsapp.com")) {
    await ctx.sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
    await ctx.sock.sendMessage(msg.key.remoteJid, {
      text: `@${msg.key.participant?.split("@")[0]} dilarang share link grup! ❌`,
      mentions: [msg.key.participant]
    });
  }
});

// ═══════════════════════════════════════════
// COMMAND ROUTES
// ═══════════════════════════════════════════
Route({
  // ── Info & Test ──
  "ping": Text("pong! 🏓 Latency: ${Date.now() - ctx.timestamp}ms"),
  "id": Text(`ID Kamu: @${GetUsrId()}`),
  "owner": Text(`Owner: ${Mention("628123456789@s.whatsapp.net")}`),
  
  // ── Echo & Argumen ──
  "say": Arg(1, 20),
  "echo": Text(`Kamu bilang: ${Arg(1)}`),
  
  // ── Media (reply media) ──
  "stiker": Sticker(GetMedia()),
  "toimg": Image(GetMedia(), "Ini gambarmu"),
  "tovid": Video(GetMedia(), "Ini videomu"),
  "todoc": Document(GetMedia(), "File kamu"),
  "tovoice": Audio(GetMedia(), true),
  
  // ── Kirim Media dari URL/Local ──
  "gambar": Image("https://picsum.photos/400/300", "Random image"),
  "video": Video("https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4", "Sample video"),
  "dokumen": Document("./package.json", "package.json", "package.json"),
  "voice": Audio("./assets/voice.ogg", true),
  "lokasi": Location(-6.2088, 106.8456, "Monas", "Jakarta Pusat"),
  
  // ── Poll & Interaktif ──
  "poll": Poll("Makan apa?", ["Nasi Goreng", "Mie Ayam", "Sate", "Bakso", "Soto"]),
  "btn": [
    Text("Pilih menu:"),
    Button("🍕 Makanan", UsrSend("makanan")),
    Button("🥤 Minuman", UsrSend("minuman")),
    Button("🍰 Dessert", UsrSend("dessert"))
  ],
  "makanan": Text("🍕 Nasi Goreng - Rp 15.000"),
  "minuman": Text("🥤 Es Teh - Rp 5.000"),
  "dessert": Text("🍰 Es Krim - Rp 10.000"),
  
  // ── Moderasi ──
  [Include(["anjg", "bngst", "tolol", "goblok", "kontol", "memek", "bangsat"])]: Delete(),
  Include("chat.whatsapp.com"): [Delete(), Text("Dilarang share link grup! ❌")],
  "ban": [Text("Bye @${GetUsrId()}! 👋"), Ban(GetUsrId())],
  "ban @user": Ban(Mention("@user")),
  
  // ── Owner Only ──
  "setprefix": [
    Setup({ OwnerOnly: true }),
    Setup({ Prefix: Arg(1) }),
    Text(`Prefix diubah jadi: ${Arg(1)}`)
  ],
  "reload": Reload(),
  "setowner": [
    Setup({ OwnerOnly: true }),
    Text("Hanya owner yang bisa akses ini 👑")
  ],
  
  // ── Fun ──
  "fakta": Text("💡 Faktanya: 1 hari di Venus = 243 hari di Bumi"),
  "motivasi": Text("💪 Jangan menyerah! Setiap langkah kecil = progres."),
  "quote": Text('"Hidup itu seperti bersepeda. Untuk menjaga keseimbangan, kamu harus terus bergerak." — Albert Einstein'),
  
  // ── Alias command ──
  ["p", "ping", "test"]: Text("pong! 🏓"),
  ["s", "stiker", "sticker"]: Sticker(GetMedia())
});

// ═══════════════════════════════════════════
// JALANKAN BOT
// ═══════════════════════════════════════════
Run({ 
  Qrcode: true, 
  Pairing: false, 
  SessionName: "w2b-bot" 
});
```

### `package.json`

```json
{
  "name": "my-w2b-bot",
  "version": "1.0.0",
  "type": "module",
  "main": "main.js",
  "scripts": {
    "start": "node main.js",
    "dev": "node --watch main.js"
  },
  "dependencies": {
    "w2b": "^1.0.0"
  }
}
```

---

## 🔧 Advanced: Per-Command Config

`Setup()` di dalam `Route()` **override config global** untuk command tsb saja.

```js
Route({
  // Command ini HANYA bisa dipakai owner
  "admin": [
    Setup({ OwnerOnly: true }),
    Text("Ini command owner only 👑")
  ],
  
  // Command ini HANYA di grup
  "grup": [
    Setup({ GrubOnly: true }),
    Text("Command ini cuma di grup 📍")
  ],
  
  // Command ini HANYA di private chat
  "privat": [
    Setup({ PrivateOnly: true }),
    Text("Command ini cuma di private 💬")
  ],
  
  // Command ini HANYA admin grup (bot harus admin)
  "kick": [
    Setup({ AdminOnly: true }),
    Ban(GetUsrId())
  ],
  
  // Ganti prefix cuma buat command ini
  "customprefix": [
    Setup({ Prefix: "/" }),
    Text("Prefix ini pake /")
  ]
});
```

---

## 🧠 Tips & Best Practice

| Tips | Penjelasan |
|------|------------|
| **Gunakan `Run({ SessionName: "nama" })`** | Session tersimpan di `./auth/nama/`. Bisa multi-bot. |
| **`Delete()` butuh bot admin** | Kalau bot bukan admin, hapus pesan gagal. |
| **`Ban()` butuh bot admin** | Kick member dari grup. |
| **`GetMedia()` hanya works kalau reply** | User harus **reply** media (image/video/doc) lalu ketik command. |
| **`Arg(1)` = kata ke-2** | Index 0 = command, 1 = arg pertama. `Arg(1,3)` = arg 1-3. |
| **`Mention()` format** | Pakai JID lengkap: `628xx@s.whatsapp.net` atau `GetUsrId()`. |
| **Hot reload** | Pakai `Reload()` atau `Event` custom untuk reload route tanpa restart. |
| **Error handling** | Wrap handler di `try/catch` kalau butuh custom error handling. |

---

## 📂 File `src/` — Ringkasan Internal

| File | Fungsi Utama |
|------|--------------|
| `config.js` | `Setup()`, `attachActionConfig()`, `globalConfig` |
| `routing.js` | `Route()`, `Include()`, `routes` object |
| `bot.js` | `Run()`, `Event()`, `Reload()`, `GetSession()`, session management, message handler |
| `actions.js` | Semua fungsi kirim: `Text`..`Button`, `UsrSend` |
| `placeholders.js` | `GetUsrId()`, `Mention()`, `Arg()`, `GetMedia()`, `resolveMediaPlaceholder()` |
| `context.js` | `executionContext` (AsyncLocalStorage untuk ctx per-request) |
| `logger.js` | Pino logger wrapper (pretty print) |
| `cli.js` | CLI helper (pairing code, dll) |

---

## ❓ FAQ

**Q: Bot tidak merespon command?**  
A: Cek `Prefix` di `Setup()`. Default kosong (tanpa prefix). Pastikan command match exact (case-sensitive).

**Q: `GetMedia()` return null?**  
A: User harus **reply** media (bukan forward). Cek `ctx.message.message` punya `imageMessage`/`videoMessage`/dst.

**Q: `Delete()` / `Ban()` error?**  
A: Bot **harus admin grup**. Juga butuh permission "Delete Messages" / "Remove Participants".

**Q: Bisa multi-bot?**  
A: Bisa. `Run({ SessionName: "bot1" })`, `Run({ SessionName: "bot2" })` beda session.

**Q: Deploy ke VPS?**  
A: `pm2 start main.js --name w2b-bot`. Pastikan `SessionName` konsisten supaya QR tidak scan ulang.

---

## 📄 Lisensi

**MIT** — bebas pakai, modifikasi, distribusi. Lihat [LICENSE](LICENSE).

---

## 🤝 Kontribusi

1. Fork repo
2. Buat branch: `git checkout -b fitur-baru`
3. Commit: `git commit -m "feat: tambah fitur X"`
4. Push: `git push origin fitur-baru`
5. Buat Pull Request

---

## 🔗 Link Terkait

- **Repo Asli (Baileys):** [github.com/WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
- **w2b di GitHub:** [github.com/ezaco-dev/w2b](https://github.com/ezaco-dev/w2b)
- **Issues & Feature Request:** [github.com/ezaco-dev/w2b/issues](https://github.com/ezaco-dev/w2b/issues)

---

<p align="center">
  Dibuat dengan ❤️ untuk komunitas WhatsApp Bot Indonesia<br>
  <strong>w2b</strong> — Simple, Powerful, Elegant.
</p>