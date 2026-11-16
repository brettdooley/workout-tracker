// GitHub backup: reads and writes workouts.json in Brett's private backup repo.
// Never touches any other file in that repo (the Cycle app keeps vault.json there).

export const BACKUP_FILE = 'workouts.json';

function utf8ToB64(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToUtf8(b64) {
  const s = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class BackupError extends Error {
  constructor(message, { auth = false } = {}) { super(message); this.auth = auth; }
}

function headers(token) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}
function fileUrl(cfg) {
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${BACKUP_FILE}`;
}
async function check(res) {
  if (res.status === 401) throw new BackupError('GitHub rejected the token. It may have expired; paste a new one in Settings.', { auth: true });
  if (res.status === 403) throw new BackupError('The GitHub token does not have permission. It needs Contents: Read and write on the backup repo.', { auth: true });
  if (res.status === 404) throw new BackupError('GitHub could not find that repo. Check the username and repo name, and that the token can access it.', { auth: true });
  if (!res.ok) throw new BackupError(`GitHub error ${res.status}.`);
}

// Confirms the repo exists, is private, and the token can write to it.
export async function githubTest(cfg) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, { headers: headers(cfg.token), cache: 'no-store' });
  await check(res);
  const info = await res.json();
  if (!info.private) throw new BackupError('That repo is public. Backups must go to a private repo.');
  if (info.permissions && info.permissions.push === false) throw new BackupError('The token can read but not write that repo. Give it Contents: Read and write.');
  return true;
}

async function getMeta(cfg) {
  const res = await fetch(fileUrl(cfg), { headers: headers(cfg.token), cache: 'no-store' });
  if (res.status === 404) return null;
  await check(res);
  return res.json();
}

export async function githubUpload(cfg, text) {
  await githubTest(cfg);
  const meta = await getMeta(cfg);
  const body = { message: 'Workout backup', content: utf8ToB64(text) };
  if (meta && meta.sha) body.sha = meta.sha;
  const res = await fetch(fileUrl(cfg), { method: 'PUT', headers: { ...headers(cfg.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await check(res);
}

export async function githubDownload(cfg) {
  const meta = await getMeta(cfg);
  if (!meta) throw new BackupError('No workouts.json backup found in that repo yet.');
  if (meta.content) return b64ToUtf8(meta.content);
  const res = await fetch(meta.download_url, { headers: { Authorization: `Bearer ${cfg.token}` }, cache: 'no-store' });
  await check(res);
  return res.text();
}
