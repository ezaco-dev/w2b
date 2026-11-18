import { Ban } from './actions.js';
import { executionContext } from './context.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'node:fs';
import path from 'node:path';
import mime from 'mime-types';

export class UserPlaceholder {
  toString() {
    return '__USER_ID_PLACEHOLDER__';
  }
  Ban() {
    return Ban(this);
  }
}

export function GetUsrId() {
  return new UserPlaceholder();
}

export function Mention(userId) {
  if (userId instanceof UserPlaceholder || String(userId) === '__USER_ID_PLACEHOLDER__') {
    return '__MENTION_SENDER__';
  }
  return `__MENTION_JID__:${userId}__`;
}

export function Arg(index, endIndex) {
  const currentCtx = executionContext.getStore();
  if (currentCtx) {
    return currentCtx.getArg(index, endIndex);
  }
  return {
    type: 'arg_placeholder',
    index,
    endIndex
  };
}

function getMediaInfo(msg) {
  const m = msg?.message;
  if (!m) return null;
  
  let content = m;
  if (content.viewOnceMessage?.message) content = content.viewOnceMessage.message;
  else if (content.viewOnceMessageV2?.message) content = content.viewOnceMessageV2.message;
  else if (content.ephemeralMessage?.message) content = content.ephemeralMessage.message;
  
  if (!content) return null;
  
  if (content.imageMessage) return { type: 'image', content: content.imageMessage };
  if (content.videoMessage) return { type: 'video', content: content.videoMessage };
  if (content.audioMessage) return { type: 'audio', content: content.audioMessage };
  if (content.documentMessage) return { type: 'document', content: content.documentMessage };
  if (content.stickerMessage) return { type: 'sticker', content: content.stickerMessage };
  if (content.locationMessage) return { type: 'location', content: content.locationMessage };
  
  return null;
}

export class MediaPlaceholder {
  toString() {
    return '__MEDIA_PLACEHOLDER__';
  }
}

export function GetMedia() {
  const ctx = executionContext.getStore();
  if (ctx) {
    return resolveMediaPlaceholder(new MediaPlaceholder(), ctx);
  }
  return new MediaPlaceholder();
}

export async function resolveMediaPlaceholder(placeholder, ctx, preResolved) {
  if (preResolved !== undefined) {
    return preResolved;
  }
  const info = getMediaInfo(ctx.message);
  if (!info) return null;
  
  if (info.type === 'location') {
    return {
      type: 'location',
      latitude: info.content.degreesLatitude,
      longitude: info.content.degreesLongitude,
      name: info.content.name || '',
      address: info.content.address || ''
    };
  }
  
  try {
    const buffer = await downloadMediaMessage(
      ctx.message,
      'buffer',
      {},
      {
        logger: ctx.sock.logger,
        reuploadRequest: ctx.sock.updateMediaMessage
      }
    );
    
    if (!buffer) return null;
    
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const mimetype = info.content.mimetype || 'application/octet-stream';
    const ext = mime.extension(mimetype) || 'bin';
    const filename = info.content.fileName || `media_${Date.now()}.${ext}`;
    
    const tempFileName = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}.${ext}`;
    const tempFilePath = path.join(tempDir, tempFileName);
    
    fs.writeFileSync(tempFilePath, buffer);
    
    if (ctx.tempFiles) {
      ctx.tempFiles.push(tempFilePath);
    }
    
    return {
      type: info.type,
      path: tempFilePath,
      mimetype: mimetype,
      filename: filename
    };
  } catch (err) {
    console.error('Gagal mengunduh media dari placeholder:', err);
    return null;
  }
}
