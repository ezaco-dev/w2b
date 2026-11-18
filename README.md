# w2b

Repositori helper bot WhatsApp berbasis **Node.js**. Intinya adalah paket [`W2B`](./W2B/README.md) — *WhatsApp Bot Helper* yang membungkus [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) agar membuat bot WhatsApp jadi ringkas: setup sekali, routing berbasis perintah, dan method aksi untuk kirim teks/media.

## Struktur

| Direktori   | Isi                                                            |
| ----------- | -------------------------------------------------------------- |
| `W2B/`      | Paket `w2b`, WhatsApp Bot Helper (library utama).              |
| `W2B/src/`  | Implementasi: config, routing, bot, aksi, placeholder, logger. |

## W2B — apa itu

`W2B` adalah wrapper tipis di atas Baileys. Tujuannya satu: kurangi boilerplate bikin bot WhatsApp. Kamu tinggal:

1. `Setup({...})` — konfigurasi awal (session, QR, dll).
2. `Route('perintah', handler)` — daftarkan perintah.
3. `Run()` — nyalakan bot.

### Fitur

- Setup & routing yang simpel.
- Event handling ringan.
- Placeholder bawaan.
- Method aksi langsung untuk kirim teks, gambar, video, dokumen, dll.

### Penggunaan

```js
import { Setup, Route, Run, Text } from 'w2b';

// Inisialisasi bot
Setup({
  // option konfigurasi
});

// Daftarkan perintah
Route('ping', async () => {
  await Text('pong!');
});

// Jalankan
Run();
```

### Ekspor

- **Core Lifecycle**: `Setup`, `Run`, `Reload`, `Event`
- **Routing**: `Route`, `Include`
- **Aksi**: `Text`, `Image`, `Video`, `Document`, `Audio`, `Sticker`, `Poll`, `Location`, `Delete`, `Ban`, `Button`, `UsrSend`
- **Helper/Placeholder**: `GetUsrId`, `Mention`, `Arg`, `GetMedia`
- **Konteks**: `executionContext`

### Instalasi

```
npm install w2b
```

### Dependensi inti

- `@whiskeysockets/baileys` — SDK WhatsApp.
- `qrcode-terminal` — tampilkan QR login di terminal.
- `pino` — logger.
- `axios` — fetch media/HTTP.
- `mime-types` — deteksi tipe media.

## Catatan

- Project ini fokus ke library `W2B`. Modul `w2b-web` dan contoh proyek sengaja tidak disalin.
- Buat repo baru di GitHub, lalu `git init`, commit, dan push ke remote yang kamu pilih.
- Bot WhatsApp berjalan memakai akun; gunakan sesuai ToS WhatsApp.

## Lisensi

MIT
