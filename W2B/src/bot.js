import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  generateWAMessageFromContent,
  generateMessageIDV2,
  normalizeMessageContent,
  proto
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import mime from 'mime-types';
import { spawn } from 'node:child_process';

import { executionContext } from './context.js';
import { globalConfig, attachActionConfig } from './config.js';
import { routes } from './routing.js';
import { UserPlaceholder, MediaPlaceholder, resolveMediaPlaceholder } from './placeholders.js';
import { processCliOptions, normalizePhone, question } from './cli.js';
import { getBaileysLogger, LOG_FILE } from './logger.js';

let eventHandlers = {};
const sessions = new Map();
const customActions = new Map();

export function registerAction(type, executor) {
  if (typeof type !== 'string' || !type) {
    throw new Error('registerAction: type harus berupa string non-kosong');
  }
  if (typeof executor !== 'function') {
    throw new Error(`registerAction: executor untuk "${type}" harus berupa fungsi`);
  }
  customActions.set(type, executor);
}
let suppressFurtherRuns = false;
let awaitingNewSessionName = null;
const NEW_SESSION_CONNECT_TIMEOUT = 600000; // 10 menit untuk scan QR / input pairing code

function getSession(sessionName) {
  return sessions.get(sessionName);
}

export function Event(name, handler) {
  if (typeof name === 'object') {
    Object.assign(eventHandlers, name);
  } else {
    eventHandlers[name] = handler;
  }
}

function getMessageText(msg, buttonSendMap) {
  const m = normalizeMessageContent(msg.message);
  if (!m) return '';
  
  const displayText = m.conversation || 
         m.extendedTextMessage?.text || 
         m.imageMessage?.caption || 
         m.videoMessage?.caption || 
         m.documentMessage?.caption || 
         '';
  
  if (displayText) return displayText;
  
  // Handle interactiveResponseMessage (nativeFlow buttons)
  const interactiveResp = m.interactiveResponseMessage;
  if (interactiveResp?.nativeFlowResponseMessage) {
    try {
      const params = JSON.parse(interactiveResp.nativeFlowResponseMessage.paramsJson);
      const selectedId = params.id || params.selected_id;
      const selectedText = params.display_text || params.selected_display_text;
      if (selectedId && buttonSendMap.has(selectedId)) {
        return buttonSendMap.get(selectedId);
      }
      if (selectedText && buttonSendMap.has(selectedText)) {
        return buttonSendMap.get(selectedText);
      }
      return selectedId || selectedText || '';
    } catch (e) {
      return '';
    }
  }
  
  // Handle buttonsResponseMessage (legacy template buttons)
  const btnResp = m.buttonsResponseMessage;
  if (btnResp) {
    const btnText = btnResp.selectedDisplayText;
    if (btnText && buttonSendMap.has(btnText)) {
      return buttonSendMap.get(btnText);
    }
    const btnId = btnResp.selectedButtonId;
    if (btnId && buttonSendMap.has(btnId)) {
      return buttonSendMap.get(btnId);
    }
    return btnText || btnId || '';
  }
  
  return '';
}

function resolvePlaceholders(text, ctx) {
  if (typeof text !== 'string') return text;
  
  let result = text;
  const senderNumber = ctx.sender.split('@')[0];
  result = result.replace(/__USER_ID_PLACEHOLDER__/g, senderNumber);
  result = result.replace(/__MENTION_SENDER__/g, `@${senderNumber}`);
  
  const mentionJidPattern = /__MENTION_JID__:(.+?)__/g;
  result = result.replace(mentionJidPattern, (match, jid) => {
    const num = jid.split('@')[0];
    return `@${num}`;
  });
  
  return result;
}

function extractMentions(text, ctx) {
  if (typeof text !== 'string') return [];
  const mentions = [];
  
  if (text.includes('__USER_ID_PLACEHOLDER__') || text.includes('__MENTION_SENDER__')) {
    mentions.push(ctx.sender);
  }
  
  const mentionJidPattern = /__MENTION_JID__:(.+?)__/g;
  let match;
  while ((match = mentionJidPattern.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  
  return mentions;
}

function rememberButton(map, key, value) {
  const MAX_BUTTON_MAP = 500;
  if (map.size >= MAX_BUTTON_MAP) {
    map.delete(map.keys().next().value);
  }
  map.set(key, value);
}

function isOwnerMatch(config, sender) {
  const ownerList = Array.isArray(config.Owner) ? config.Owner : [config.Owner];
  const senderNum = sender.split('@')[0];
  return ownerList.some(o => String(o || '').replace(/[^0-9]/g, '') === senderNum);
}

async function hasPermission(sock, config, chat, sender, isGroup) {
  if (config.OwnerOnly && !isOwnerMatch(config, sender)) return false;
  if (config.GrubOnly && !isGroup) return false;
  if (config.PrivateOnly && isGroup) return false;
  if (config.AdminOnly && isGroup) {
    const groupMetadata = await sock.groupMetadata(chat);
    const participants = groupMetadata.participants || [];
    const participant = participants.find(p => p.id === sender);
    const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
    if (!isAdmin) return false;
  }
  return true;
}

async function applyResolvedMedia(action, media) {
  if (!media) return false;

  if (media.path) {
    const isDocumentAction = action.type === 'document';
    const isMatchingType = media.type === action.type;
    if (isMatchingType || (isDocumentAction && media.type !== 'location')) {
      action.urlOrPath = media.path;
      if (isDocumentAction && !action.filename) action.filename = media.filename;
      return true;
    }
    return false;
  }

  if (media.type === 'location' && action.type === 'location') {
    action.latitude = media.latitude;
    action.longitude = media.longitude;
    action.name = action.name || media.name;
    action.address = action.address || media.address;
    return true;
  }

  return false;
}

async function getMediaSource(urlOrPath) {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    const response = await axios.get(urlOrPath, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }
  
  const absolutePath = path.isAbsolute(urlOrPath) 
    ? urlOrPath 
    : path.resolve(process.cwd(), urlOrPath);
    
  if (fs.existsSync(absolutePath)) {
    return fs.readFileSync(absolutePath);
  }
  
  throw new Error(`File media tidak ditemukan: ${absolutePath}`);
}

function flattenActions(arr) {
  if (!Array.isArray(arr)) {
    return [arr];
  }
  return arr.reduce((acc, val) => acc.concat(Array.isArray(val) ? flattenActions(val) : val), []);
}

const PRIVACY_MODE_TS_OFFSET = 77980457;

function buildBizNode() {
  return {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: (Math.floor(Date.now() / 1000) - PRIVACY_MODE_TS_OFFSET).toString()
    },
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [
          { tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }
        ]
      },
      {
        tag: 'quality_control',
        attrs: { source_type: 'third_party' }
      }
    ]
  };
}

function interactiveRelayOptions(chat, messageId) {
  const additionalNodes = chat.endsWith('@g.us')
    ? [buildBizNode()]
    : [{ tag: 'bot', attrs: { biz_bot: '1' } }, buildBizNode()];
  return { messageId, additionalNodes };
}

async function relayInteractiveMessage(sock, chat, msg, interactiveMsg, ctx, buttonLabels) {
  const msgContent = generateWAMessageFromContent(chat, interactiveMsg, {
    userJid: sock.user?.id,
    quoted: msg,
    messageId: generateMessageIDV2(sock.user?.id)
  });
  try {
    await sock.relayMessage(chat, msgContent.message, interactiveRelayOptions(chat, msgContent.key.id));
  } catch (err) {
    console.error('[Button] Gagal mengirim interactive message, fallback ke teks:', err?.message || err);
    const notice = [
      ctx && resolvePlaceholders(interactiveMsg.interactiveMessage?.body?.text, ctx) || '',
      '',
      '⚠️ Button function only available for business account',
      'Silakan ketik perintah manual:',
      ...buttonLabels.map(label => `▸ ${label}`)
    ].join('\n');
    await sock.sendMessage(chat, { text: notice.trim() }, { quoted: msg });
  }
}

async function executeActions(sock, chat, msg, rawActions, ctx, buttonSendMap) {
  const actions = flattenActions(rawActions);
  
  let i = 0;
  while (i < actions.length) {
    let action = actions[i];
    if (!action) { i++; continue; }

    if (action.type === 'arg_placeholder') {
      action = { type: 'text', text: ctx.getArg(action.index, action.endIndex) };
    }

    if (typeof action === 'string') {
      action = { type: 'text', text: action };
    }

    // Resolve media: MediaPlaceholder atau Promise hasil GetMedia() di dalam handler
    if (action.urlOrPath instanceof MediaPlaceholder ||
        (action.urlOrPath && typeof action.urlOrPath.then === 'function')) {
      const media = await resolveMediaPlaceholder(
        action.urlOrPath instanceof MediaPlaceholder ? action.urlOrPath : null,
        ctx,
        action.urlOrPath instanceof MediaPlaceholder ? undefined : await action.urlOrPath
      );
      const ok = await applyResolvedMedia(action, media);
      if (!ok) { i++; continue; }
    }

    if (action.type === 'location' && action.latitude instanceof MediaPlaceholder) {
      const media = await resolveMediaPlaceholder(action.latitude, ctx);
      const ok = await applyResolvedMedia(action, media);
      if (!ok) { i++; continue; }
    }

    // Merge: Text diikuti Button → 1 pesan dengan interactiveMessage
    if (action.type === 'text') {
      const nativeButtons = [];
      let text = action.text;
      let j = i + 1;
      while (j < actions.length && actions[j]?.type === 'button') {
        const btn = actions[j];
        rememberButton(buttonSendMap, btn.label, btn.sendMsg);
        nativeButtons.push({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({ display_text: btn.label, id: btn.sendMsg })
        });
        j++;
      }
      const resolvedText = resolvePlaceholders(text, ctx);
      const mentions = extractMentions(text, ctx);
      if (nativeButtons.length > 0) {
        const interactiveMsg = {
          interactiveMessage: {
            body: { text: resolvedText },
            nativeFlowMessage: {
              buttons: nativeButtons,
              messageParamsJson: '{}',
              messageVersion: 1
            }
          }
        };
        await relayInteractiveMessage(
          sock, chat, msg, interactiveMsg, ctx,
          nativeButtons.map(b => {
            try { return JSON.parse(b.buttonParamsJson).display_text; } catch (e) { return ''; }
          }).filter(Boolean)
        );
      } else {
        await sock.sendMessage(chat, { text: resolvedText, mentions }, { quoted: msg });
      }
      i = j;
      continue;
    }

    if (action.type === 'button') {
      // Button tanpa Text sebelumnya → kirim sendiri
      const resolvedText = resolvePlaceholders(action.label, ctx);
      rememberButton(buttonSendMap, action.label, action.sendMsg);
      const interactiveMsg = {
        interactiveMessage: {
          body: { text: resolvedText },
          nativeFlowMessage: {
            buttons: [{
              name: 'quick_reply',
              buttonParamsJson: JSON.stringify({ display_text: action.label, id: action.sendMsg })
            }],
            messageParamsJson: '{}',
            messageVersion: 1
          }
        }
      };
      await relayInteractiveMessage(sock, chat, msg, interactiveMsg, ctx, [action.label]);
      i++;
      continue;
    }

    // Action type kustom dari plugin (mis. w2b-web)
    const customExecutor = customActions.get(action.type);
    if (customExecutor) {
      await customExecutor({ sock, chat, msg, action, ctx, buttonSendMap });
      i++;
      continue;
    }

    switch (action.type) {
      case 'reload': {
        triggerReloadProcess();
        break;
      }
      case 'image': {
        const resolvedCaption = action.caption ? resolvePlaceholders(action.caption, ctx) : undefined;
        const mentions = action.caption ? extractMentions(action.caption, ctx) : [];
        const mediaSource = await getMediaSource(action.urlOrPath);
        await sock.sendMessage(chat, { image: mediaSource, caption: resolvedCaption, mentions }, { quoted: msg });
        break;
      }
      case 'video': {
        const resolvedCaption = action.caption ? resolvePlaceholders(action.caption, ctx) : undefined;
        const mentions = action.caption ? extractMentions(action.caption, ctx) : [];
        const mediaSource = await getMediaSource(action.urlOrPath);
        await sock.sendMessage(chat, { video: mediaSource, caption: resolvedCaption, mentions }, { quoted: msg });
        break;
      }
      case 'document': {
        const resolvedCaption = action.caption ? resolvePlaceholders(action.caption, ctx) : undefined;
        const mentions = action.caption ? extractMentions(action.caption, ctx) : [];
        const mediaSource = await getMediaSource(action.urlOrPath);
        const filename = action.filename || path.basename(action.urlOrPath);
        const mimetype = mime.lookup(filename) || 'application/octet-stream';
        await sock.sendMessage(chat, { 
          document: mediaSource, 
          caption: resolvedCaption, 
          fileName: filename, 
          mimetype,
          mentions 
        }, { quoted: msg });
        break;
      }
      case 'audio': {
        const mediaSource = await getMediaSource(action.urlOrPath);
        const mimetype = mime.lookup(action.urlOrPath) || 'audio/mp4';
        await sock.sendMessage(chat, { 
          audio: mediaSource, 
          ptt: action.ptt,
          mimetype
        }, { quoted: msg });
        break;
      }
      case 'sticker': {
        const mediaSource = await getMediaSource(action.urlOrPath);
        await sock.sendMessage(chat, { sticker: mediaSource }, { quoted: msg });
        break;
      }
      case 'poll': {
        if (!Array.isArray(action.options) || action.options.length < 2) {
          throw new Error(`Poll "${action.question}" membutuhkan minimal 2 opsi. Contoh: Poll("Judul", ["Opsi 1", "Opsi 2"])`);
        }
        await sock.sendMessage(chat, {
          poll: {
            name: resolvePlaceholders(action.question, ctx),
            values: action.options.map(opt => resolvePlaceholders(opt, ctx)),
            selectableCount: 1
          }
        }, { quoted: msg });
        break;
      }
      case 'location': {
        await sock.sendMessage(chat, {
          location: {
            degreesLatitude: action.latitude,
            degreesLongitude: action.longitude,
            name: resolvePlaceholders(action.name, ctx),
            address: resolvePlaceholders(action.address, ctx)
          }
        }, { quoted: msg });
        break;
      }
      case 'delete': {
        await sock.sendMessage(chat, { delete: msg.key });
        break;
      }
      case 'ban': {
        if (!ctx.isGroup) break;
        let targetJid = action.userId;
        if (targetJid === '__USER_ID_PLACEHOLDER__' || targetJid instanceof UserPlaceholder) {
          targetJid = ctx.sender;
        }
        if (!String(targetJid).includes('@')) {
          targetJid = `${String(targetJid).replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        }
        await sock.groupParticipantsUpdate(chat, [targetJid], 'remove');
        break;
      }
    }
    i++;
  }
}

async function processMessage(sock, msg, text, buttonSendMap) {
  const sender = msg.key.participant || msg.key.remoteJid;
  const chat = msg.key.remoteJid;
  const isGroup = chat.endsWith('@g.us');
  
  const trimmed = text.trim();
  
  // Prefix: jika diatur, pesan harus dimulai dengan prefix
  const prefix = globalConfig.Prefix || '';
  let commandText = trimmed;
  if (prefix) {
    if (!trimmed.startsWith(prefix)) return;
    commandText = trimmed.slice(prefix.length).trimStart();
  }
  
  const words = commandText.split(/\s+/);
  const commandWord = words[0]?.toLowerCase();
  const originalCommandWord = trimmed.split(/\s+/)[0]?.toLowerCase();
  const includeHaystack = commandText.toLowerCase();
  const originalHaystack = trimmed.toLowerCase();
  
  let matchedKey = null;
  let matchedHandler = null;
  
  for (const [key, handler] of Object.entries(routes)) {
    if (key.startsWith('__INCLUDE__:')) {
      const incWords = key.substring(12).split(',');
      const found = incWords.some(w => includeHaystack.includes(w.toLowerCase()) || originalHaystack.includes(w.toLowerCase()));
      if (found) {
        matchedKey = key;
        matchedHandler = handler;
        break;
      }
    } else if (key.includes(',')) {
      const cmdList = key.split(',').map(k => k.trim().toLowerCase());
      if (cmdList.includes(commandWord) || cmdList.includes(originalCommandWord)) {
        matchedKey = key;
        matchedHandler = handler;
        break;
      }
    } else if (key.toLowerCase() === commandWord || key.toLowerCase() === originalCommandWord) {
      matchedKey = key;
      matchedHandler = handler;
      break;
    }
  }

  if (!matchedHandler) return;

  const ctx = {
    sock,
    message: msg,
    sender,
    chat,
    isGroup,
    config: { ...globalConfig },
    args: words,
    tempFiles: [],
    getArg(index, endIndex) {
      if (endIndex === undefined) {
        return this.args[index] || '';
      }
      return this.args.slice(index, endIndex + 1).join(' ');
    }
  };

  try {
    // Cek permission SEBELUM mengeksekusi handler
    if (!(await hasPermission(sock, ctx.config, chat, sender, isGroup))) return;

    const result = await executionContext.run(ctx, async () => {
      if (typeof matchedHandler === 'function') {
        return await matchedHandler();
      }
      return matchedHandler;
    });

    // Config per-route: Setup() dalam file command menempel .config pada action
    for (const a of flattenActions(result || [])) {
      if (a && typeof a === 'object' && a.config) {
        Object.assign(ctx.config, a.config);
      }
    }

    // Verifikasi ulang dengan config per-route, sebelum action dikirim
    if (!(await hasPermission(sock, ctx.config, chat, sender, isGroup))) return;

    if (result) {
      await executeActions(sock, chat, msg, result, ctx, buttonSendMap);
    }
  } catch (error) {
    console.error('Error processing command:', error);
  } finally {
    if (ctx.tempFiles && ctx.tempFiles.length > 0) {
      for (const filePath of ctx.tempFiles) {
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.error(`Gagal menghapus file sementara ${filePath}:`, err);
        }
      }
    }
  }
}

let isInitialRun = true;
let isRestarting = false;

export function GetSession(sessionName) {
  return sessions.get(sessionName) || null;
}

export function GetSessions() {
  return Array.from(sessions.keys());
}

function triggerReloadProcess() {
  if (isRestarting) return;
  isRestarting = true;
  
  console.log('\n[Reload] Merestart bot...');
  for (const [, session] of sessions) {
    if (session.socket) {
      try { session.socket.end(); } catch (e) {}
    }
  }
  
  const args = process.argv.slice(1).filter(arg => arg !== '-new');
  setTimeout(() => {
    spawn(process.argv[0], args, {
      stdio: 'inherit'
    });
    process.exit(0);
  }, 500);
}

export function Reload() {
  const ctx = executionContext.getStore();
  if (ctx) {
    triggerReloadProcess();
    return;
  }
  return attachActionConfig({ type: 'reload' });
}

// Menunggu hasil koneksi nyata untuk sesi baru: true saat 'open',
// false saat gagal definitif atau timeout.
function waitSessionConnect(session, timeoutMs = NEW_SESSION_CONNECT_TIMEOUT) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        if (!ok) session.abandoned = true;
        resolve(ok);
      }
    };
    session.connectWaiter = finish;
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

export async function Run(options = {}) {
  if (suppressFurtherRuns) return;

  let pairing = options.Pairing === true;
  let showQr = !pairing && options.Qrcode !== false;
  let sessionName = options.SessionName || "W2B Bot";

  if (isInitialRun) {
    isInitialRun = false;
    
    // Clean up temp directory on startup
    const tempDir = path.join(process.cwd(), 'temp');
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      fs.mkdirSync(tempDir, { recursive: true });
    } catch (err) {
      console.error('Gagal membersihkan folder temp:', err);
    }

    // CLI multi-session: -h, -l, -rm, -n
    const cliResult = await processCliOptions(process.argv.slice(2), process.cwd(), options);
    if (cliResult.exit) {
      process.exit(cliResult.code ?? 0);
    }
    if (cliResult.options) {
      Object.assign(options, cliResult.options);
    }
    if (cliResult.suppressRest) {
      suppressFurtherRuns = true;
      awaitingNewSessionName = options.SessionName || null;
      pairing = options.Pairing === true;
      showQr = !pairing && options.Qrcode !== false;
      sessionName = options.SessionName || "W2B Bot";
    }
  }

  // authFolder dihitung SETELAH CLI, agar opsi -n (nama sesi baru) ikut terpakai
  const authFolder = path.join(process.cwd(), `session_${sessionName.replace(/\s+/g, '_')}`);

  // Create or get session state (setelah CLI, agar nama sesi dari -n terpakai)
  let session = sessions.get(sessionName);
  if (!session) {
    session = {
      name: sessionName,
      socket: null,
      buttonSendMap: new Map(),
      activePhoneNumber: null,
      pairingCodeRequested: false
    };
    sessions.set(sessionName, session);
  }

  // Log internal Baileys masuk ke w2b.log (level diatur via env W2B_LOG)
  const logger = getBaileysLogger();
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  // 1. Prompt for phone number BEFORE socket creation to avoid timing out the WebSocket
  // Catatan: creds.registered milik Baileys baru menjadi true setelah sesi aktif
  // menerima pesan, jadi keberadaan me.id juga dihitung sebagai sudah terdaftar.
  const hasRegisteredIdentity = !!state.creds.me?.id;
  if (pairing && !state.creds.registered && !hasRegisteredIdentity && !session.activePhoneNumber) {
    if (options.PhoneNumber) {
      // Nomor sudah dikumpulkan oleh wizard (-n)
      session.activePhoneNumber = normalizePhone(options.PhoneNumber);
    } else {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const question = (text) => new Promise((resolve) => rl.question(text, resolve));
      
      console.log('\n--- Requesting Pairing Code ---');
      const phoneNumberInput = await question('Masukkan nomor telepon bot (contoh: 628xxx): ');
      rl.close();
      
      session.activePhoneNumber = normalizePhone(phoneNumberInput);
    }
  }
  
  const { version } = await fetchLatestBaileysVersion();
  
  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    logger,
    browser: Browsers.ubuntu('Chrome')
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    // 2. Request pairing code only when the socket is fully connected and waiting for authentication (emits QR)
    if (qr) {
      const ts = new Date().toLocaleTimeString();
      if (showQr) {
        console.log(`\n--- [${ts}] SCAN QR CODE DI BAWAH ---`);
        qrcode.generate(qr, { small: true });
      }
      
      if (pairing && session.activePhoneNumber && !session.pairingCodeRequested) {
        session.pairingCodeRequested = true;
        console.log('\nSedang meminta pairing code dari WhatsApp...');
        try {
          const code = await sock.requestPairingCode(session.activePhoneNumber);
          console.log(`\n===================================`);
          console.log(`Pairing code Anda: ${code}`);
          console.log(`===================================\n`);
        } catch (err) {
          console.error('Gagal meminta pairing code:', err);
          session.pairingCodeRequested = false; // Reset to allow retry on next connection update
        }
      }
    }
    
    if (connection === 'close') {
      session.pairingCodeRequested = false; // Reset pairing request flag on connection close
      const statusCode = (lastDisconnect?.error)?.output?.statusCode || (lastDisconnect?.error)?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const reason = lastDisconnect?.error?.message || lastDisconnect?.error || 'Koneksi ditutup oleh server';
      
      console.log(`[${new Date().toLocaleTimeString()}] Koneksi terputus: ${reason} (Status Code: ${statusCode}). Menghubungkan kembali: ${shouldReconnect}`);
      
      // Sesi baru yang sudah dinyatakan gagal/timeout tidak boleh mencoba ulang
      if (session.abandoned) return;

      const sessionCorrupted = statusCode === DisconnectReason.badSession || statusCode === DisconnectReason.multideviceMismatch;
      
      // Kegagalan definitif saat menunggu koneksi pertama sesi baru → laporkan gagal
      if (session.connectWaiter && !session.connected &&
          (statusCode === DisconnectReason.loggedOut || sessionCorrupted)) {
        session.abandoned = true;
        session.connectWaiter(false);
        session.connectWaiter = null;
        return;
      }

      if (statusCode === DisconnectReason.loggedOut || sessionCorrupted) {
        console.log('Sesi telah kedaluwarsa, logout, atau rusak. Menghapus folder sesi...');
        try {
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
          }
        } catch (err) {
          console.error('Gagal menghapus folder sesi:', err);
        }
        session.activePhoneNumber = null; // Reset phone number prompt state
      }
      
      if (shouldReconnect && !session.reconnecting) {
        session.reconnecting = true;
        console.log('Mencoba menghubungkan kembali dalam 5 detik...');
        setTimeout(() => {
          session.reconnecting = false;
          Run(options);
        }, 5000);
      }
    } else if (connection === 'open') {
      console.log(`Koneksi WhatsApp berhasil dibuka! (Sesi: ${sessionName})`);
      session.connected = true;
      session.activePhoneNumber = null; // Clear number after successful connection
      if (session.connectWaiter) {
        const waiter = session.connectWaiter;
        session.connectWaiter = null;
        waiter(true);
      }
      if (eventHandlers['connection.open']) {
        eventHandlers['connection.open'](sock);
      }
    }
    
    if (eventHandlers['connection.update']) {
      eventHandlers['connection.update'](update, sock);
    }
  });
  
  sock.ev.on('group-participants.update', (ev) => {
    if (eventHandlers['group-participants.update']) {
      eventHandlers['group-participants.update'](ev, sock);
    }
  });

  session.socket = sock;

  sock.ev.on('messages.upsert', async (m) => {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      if (!msg.message) continue;
      if (msg.key.fromMe) continue;
      
      const messageText = getMessageText(msg, session.buttonSendMap);
      if (!messageText) continue;

      await processMessage(sock, msg, messageText, session.buttonSendMap);
    }
  });

  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      
      process.stdin.removeAllListeners('data');
      
      process.stdin.on('data', (key) => {
        if (key === '\u0012') {
          Reload();
        }
        if (key === '\u0003') {
          process.exit(0);
        }
      });
      
      console.log('\n[Hot Reload] Tekan [Ctrl + R] di terminal untuk me-restart/hot-reload bot.');
    } catch (err) {
      // Abaikan jika gagal setRawMode di non-TTY
    }
  }

  // Sesi baru (-n): tunggu hasil koneksi nyata sebelum menyatakan berhasil/gagal
  if (awaitingNewSessionName === sessionName) {
    awaitingNewSessionName = null;
    const ok = await waitSessionConnect(session);
    if (ok) {
      console.log(`\n[Sesi Baru] ✓ Sesi "${sessionName}" berhasil terhubung dan tersimpan.`);
    } else {
      try { session.socket?.end(); } catch (e) {}
      console.error(`\n[Sesi Baru] ✗ Koneksi GAGAL untuk sesi "${sessionName}" (timeout atau ditolak server).`);
      const answer = (await question('Hapus sesi yang gagal ini? (y/N): ')).trim().toLowerCase();
      if (answer === 'y' || answer === 'yes') {
        try {
          if (fs.existsSync(authFolder)) {
            fs.rmSync(authFolder, { recursive: true, force: true });
          }
          console.log(`Sesi "${sessionName}" telah dihapus.`);
        } catch (err) {
          console.error(`Gagal menghapus sesi: ${err.message}`);
        }
      }
      process.exitCode = 1;
    }
  }
}
