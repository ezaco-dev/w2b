import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';

const LOG_FILE = path.join(process.cwd(), 'w2b.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function stamp() {
  return new Date().toLocaleString();
}

function toText(args) {
  return args.map(a => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.stack || a.message;
    try { return JSON.stringify(a); } catch (e) { return String(a); }
  }).join(' ');
}

// Semua console.log/error ikut ditulis ke w2b.log (kecuali gambar QR)
const origLog = console.log.bind(console);
const origError = console.error.bind(console);

console.log = (...args) => {
  origLog(...args);
  const text = toText(args);
  if (!/^[▄▀█\s]+$/.test(text.trim())) {
    logStream.write(`[${stamp()}] ${text}\n`);
  }
};

console.error = (...args) => {
  origError(...args);
  logStream.write(`[${stamp()}] [ERROR] ${toText(args)}\n`);
};

// Log internal Baileys langsung ke file saja agar tidak mengspam terminal.
// Level diatur via environment: W2B_LOG=trace|debug|info|error (default: trace)
export function getBaileysLogger() {
  return pino({ level: process.env.W2B_LOG || 'trace' }, logStream);
}

export { LOG_FILE };
