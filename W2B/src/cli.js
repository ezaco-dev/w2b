import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const SESSION_PREFIX = 'session_';

let rl = null;
let pipedBuffer = '';
let pipedWaiter = null;
let pipedAttached = false;

// Pembaca baris untuk stdin yang di-pipe/non-TTY:
// satu listener persisten agar baris yang tiba saat tidak ada
// pertanyaan aktif tidak hilang.
function readPipedLine() {
  return new Promise((resolve) => {
    if (!pipedAttached) {
      pipedAttached = true;
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        pipedBuffer += chunk;
        if (pipedWaiter) {
          const idx = pipedBuffer.indexOf('\n');
          if (idx !== -1) {
            const line = pipedBuffer.slice(0, idx).replace(/\r$/, '');
            pipedBuffer = pipedBuffer.slice(idx + 1);
            const waiter = pipedWaiter;
            pipedWaiter = null;
            waiter(line);
          }
        }
      });
    }
    const idx = pipedBuffer.indexOf('\n');
    if (idx !== -1) {
      const line = pipedBuffer.slice(0, idx).replace(/\r$/, '');
      pipedBuffer = pipedBuffer.slice(idx + 1);
      resolve(line);
    } else {
      pipedWaiter = resolve;
    }
  });
}

export function question(text) {
  if (process.stdin.isTTY) {
    if (!rl) {
      rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    return new Promise((resolve) => rl.question(text, resolve));
  }
  process.stdout.write(text);
  return readPipedLine();
}

function closeRl() {
  if (rl) {
    rl.close();
    rl = null;
  }
}

export function normalizePhone(input) {
  let cleaned = String(input || '').replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  return cleaned;
}

const AUTO_ID_PATTERN = /^ses_(\d+)$/;

// ID sesi otomatis: ses_1, ses_2, dst (lanjut dari yang tertinggi yang ada)
export function generateSessionId(cwd = process.cwd()) {
  let max = 0;
  try {
    for (const entry of fs.readdirSync(cwd)) {
      const match = AUTO_ID_PATTERN.exec(entry.replace(SESSION_PREFIX, ''));
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
  } catch (err) {
    // abaikan, mulai dari ses_1
  }
  return `ses_${max + 1}`;
}

export function getSessionFolder(id, cwd = process.cwd()) {
  return path.join(cwd, SESSION_PREFIX + id);
}

export function listSessions(cwd = process.cwd()) {
  let entries = [];
  try {
    entries = fs.readdirSync(cwd, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith(SESSION_PREFIX))
      .map(e => e.name);
  } catch (err) {
    console.error('Gagal membaca folder sesi:', err.message);
  }
  return entries.map(folder => getSessionInfo(folder.slice(SESSION_PREFIX.length), cwd));
}

export function getSessionInfo(id, cwd = process.cwd()) {
  const info = { id, folder: SESSION_PREFIX + id, registered: false, number: null };
  try {
    const credsPath = path.join(getSessionFolder(id, cwd), 'creds.json');
    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
      if (creds?.me?.id) {
        info.number = String(creds.me.id).split('@')[0].split(':')[0];
        info.registered = true;
      }
    }
  } catch (err) {
    // creds.json rusak/belum ada → anggap belum terdaftar
  }
  return info;
}

export function findSessionByNumber(number, cwd = process.cwd(), excludeId = null) {
  for (const info of listSessions(cwd)) {
    if (info.registered && info.number === number && info.id !== excludeId) {
      return info;
    }
  }
  return null;
}

export function deleteSession(id, cwd = process.cwd()) {
  const folder = getSessionFolder(id, cwd);
  if (!fs.existsSync(folder)) {
    return { id, ok: false, reason: 'tidak ditemukan' };
  }
  try {
    fs.rmSync(folder, { recursive: true, force: true });
    return { id, ok: true };
  } catch (err) {
    return { id, ok: false, reason: err.message };
  }
}

function printHelp() {
  console.log(`
W2B — WhatsApp Bot Multi-Session CLI

Penggunaan: node main.js [opsi]

  (tanpa opsi)       Jalankan sesi sesuai konfigurasi di kode.
                     Pertama kali: diminta scan QR / pairing code.
                     Kedua kali dan seterusnya: langsung berjalan.

  -n                 Buat sesi baru dengan id otomatis (ses_1, ses_2, dst).
                     Metode koneksi mengikuti pengaturan di kode (QR/pairing).
                     Nomor otomatis dicek terhadap sesi lain yang sudah ada.

  -l                 Tampilkan daftar semua sesi beserta id dan nomornya.

  -rm <id> [id...]   Hapus sesi berdasarkan id dari hasil -l.
                     Bisa menghapus banyak sesi sekaligus.

  -h                 Tampilkan bantuan ini.

Contoh:
  node main.js -l
  node main.js -n
  node main.js -rm Chrome
  node main.js -rm Chrome Firefox
`);
}

async function wizardNewSession(cwd = process.cwd(), runOptions = {}) {
  console.log('\n=== Buat Sesi Baru ===\n');

  const existing = listSessions(cwd);
  if (existing.length > 0) {
    console.log('Sesi yang sudah ada:');
    for (const s of existing) {
      console.log(`  - ${s.id}${s.number ? ` (nomor: ${s.number})` : ' (belum pair)'}`);
    }
    console.log('');
  }

  const sessionName = generateSessionId(cwd);
  const pairing = runOptions.Pairing === true;
  const options = {
    SessionName: sessionName,
    Qrcode: !pairing && runOptions.Qrcode !== false,
    Pairing: pairing
  };

  if (pairing) {
    let phoneNumber;
    if (runOptions.PhoneNumber) {
      phoneNumber = normalizePhone(runOptions.PhoneNumber);
    } else {
      const phoneInput = await question('Masukkan nomor telepon bot (contoh: 628xxx): ');
      phoneNumber = normalizePhone(phoneInput);
      if (!phoneNumber || phoneNumber.length < 8) {
        console.log('Nomor tidak valid. Sesi baru dibatalkan.');
        closeRl();
        return { exit: true, code: 1 };
      }
    }

    const conflict = findSessionByNumber(phoneNumber, cwd);
    if (conflict) {
      console.log(`\n⚠️  Nomor ${phoneNumber} sudah terdaftar pada sesi "${conflict.id}".`);
      let choice = '';
      while (choice !== '1' && choice !== '2') {
        choice = (await question(
          '  [1] Hapus sesi lama dan lanjutkan sesi baru\n  [2] Pertahankan sesi lama dan batalkan sesi baru\nPilih (1/2): '
        )).trim();
        if (choice !== '1' && choice !== '2') console.log('Pilihan tidak valid, masukkan 1 atau 2.');
      }
      if (choice === '2') {
        console.log('Sesi baru dibatalkan. Sesi lama tetap dipertahankan.');
        closeRl();
        return { exit: true, code: 0 };
      }
      const result = deleteSession(conflict.id, cwd);
      if (!result.ok) {
        console.error(`Gagal menghapus sesi "${conflict.id}": ${result.reason}`);
        closeRl();
        return { exit: true, code: 1 };
      }
      console.log(`Sesi lama "${conflict.id}" telah dihapus.`);
    }

    options.PhoneNumber = phoneNumber;
  }

  console.log(`Membuat sesi "${sessionName}"... Menunggu koneksi.\n`);
  closeRl();
  return { options, suppressRest: true, waitForConnect: true };
}

export async function processCliOptions(rawArgv = process.argv.slice(2), cwd = process.cwd(), runOptions = {}) {
  if (rawArgv.length === 0) {
    return {};
  }

  const [first] = rawArgv;

  switch (first) {
    case '-h':
    case '--help': {
      printHelp();
      return { exit: true, code: 0 };
    }

    case '-l':
    case '--list': {
      const sessions = listSessions(cwd);
      if (sessions.length === 0) {
        console.log('Belum ada sesi. Buat sesi baru dengan: node main.js -n');
      } else {
        console.log('\nDaftar sesi:');
        sessions.forEach((s, idx) => {
          const status = s.registered ? `✓ terdaftar  ${s.number}` : '✗ belum pair';
          console.log(`  [${idx + 1}] ${s.id.padEnd(20)} ${status}`);
        });
        console.log('\nHapus sesi dengan: node main.js -rm <id>');
      }
      return { exit: true, code: 0 };
    }

    case '-rm':
    case '--remove': {
      const ids = rawArgv.slice(1);
      if (ids.length === 0) {
        console.error('Error: opsi -rm membutuhkan minimal 1 id sesi.');
        console.error('Lihat daftar sesi dengan: node main.js -l');
        return { exit: true, code: 1 };
      }

      const targets = [];
      const invalid = [];
      for (const id of ids) {
        if (fs.existsSync(getSessionFolder(id, cwd))) {
          targets.push(id);
        } else {
          invalid.push(id);
        }
      }

      if (invalid.length > 0) {
        console.error(`Sesi tidak ditemukan: ${invalid.join(', ')}`);
        console.error('Cek daftar sesi dengan: node main.js -l');
        if (targets.length === 0) return { exit: true, code: 1 };
      }

      console.log(`Sesi yang akan dihapus: ${targets.join(', ')}`);
      const answer = (await question('Yakin ingin menghapus? (y/N): ')).trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') {
        console.log('Dibatalkan.');
        closeRl();
        return { exit: true, code: 0 };
      }

      let failed = 0;
      for (const id of targets) {
        const result = deleteSession(id, cwd);
        if (result.ok) {
          console.log(`Sesi "${id}" telah dihapus.`);
        } else {
          console.error(`Gagal menghapus sesi "${id}": ${result.reason}`);
          failed++;
        }
      }
      closeRl();
      return { exit: true, code: failed > 0 ? 1 : 0 };
    }

    case '-n':
    case '--new': {
      return await wizardNewSession(cwd, runOptions);
    }

    default: {
      if (first.startsWith('-')) {
        console.error(`Error: opsi tidak dikenal "${first}".`);
        console.error("Gunakan 'node main.js -h' untuk melihat daftar opsi.");
        return { exit: true, code: 1 };
      }
      console.error(`Error: argumen tidak dikenal "${first}".`);
      console.error("Gunakan 'node main.js -h' untuk melihat daftar opsi.");
      return { exit: true, code: 1 };
    }
  }
}
