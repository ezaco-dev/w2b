# w2b

WhatsApp Bot Helper menggunakan [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).

Wrapper simpel & ringan untuk membuat bot WhatsApp dengan mudah.

## Instalasi

```
npm install w2b
```

## Fitur

- Setup & routing yang mudah.
- Event handling sederhana.
- Placeholder function bawaan.
- Method aksi langsung untuk kirim teks, gambar, video, dokumen, dll.

## Penggunaan

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

// Jalankan bot
Run();
```

## Ekspor

- **Core Lifecycle**: `Setup`, `Run`, `Reload`, `Event`
- **Routing**: `Route`, `Include`
- **Aksi**: `Text`, `Image`, `Video`, `Document`, `Audio`, `Sticker`, `Poll`, `Location`, `Delete`, `Ban`
- **Helper**: `GetUsrId`, `Mention`, `Arg`, `GetMedia`
- **Konteks**: `executionContext`

## Lisensi

MIT
