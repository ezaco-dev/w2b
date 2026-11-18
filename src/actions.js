import { attachActionConfig } from './config.js';

export function Text(text) {
  return attachActionConfig({ type: 'text', text });
}

export function Image(urlOrPath, caption) {
  return attachActionConfig({ type: 'image', urlOrPath, caption });
}

export function Video(urlOrPath, caption) {
  return attachActionConfig({ type: 'video', urlOrPath, caption });
}

export function Document(urlOrPath, caption, filename) {
  return attachActionConfig({ type: 'document', urlOrPath, caption, filename });
}

export function Audio(urlOrPath, ptt = false) {
  return attachActionConfig({ type: 'audio', urlOrPath, ptt });
}

export function Sticker(urlOrPath) {
  return attachActionConfig({ type: 'sticker', urlOrPath });
}

export function Poll(question, options) {
  return attachActionConfig({ type: 'poll', question, options });
}

export function Location(latitude, longitude, name, address) {
  return attachActionConfig({ type: 'location', latitude, longitude, name, address });
}

export function Delete() {
  return attachActionConfig({ type: 'delete' });
}

export function Ban(userId) {
  return attachActionConfig({ type: 'ban', userId });
}

export function UsrSend(message) {
  return message;
}

export function Button(label, usrSend) {
  const sendMsg = typeof usrSend === 'string' ? usrSend : label;
  return attachActionConfig({ type: 'button', label, sendMsg });
}
