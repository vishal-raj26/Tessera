// Small .env text helpers shared by the setup scripts. They keep the file's own line endings
// (Windows checkouts often use CRLF), so edits never leave a file with mixed endings.

export const SECRET_KEYS = ['BOT_TOKEN', 'ADMIN_CHAT_IDS', 'TONCENTER_API_KEY', 'BITREFILL_API_ID', 'BITREFILL_API_SECRET', 'MERCHANT_WALLET'];

export const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

/** Parse KEY=value lines (quotes stripped, CR ignored). */
export function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^['"]|['"]$/g, '')]));
}

/** Set KEY=value, replacing an existing line or appending one, in the file's own line ending. */
export function setEnvText(text, key, value) {
  const eol = eolOf(text);
  const re = new RegExp(`^[ \\t]*${key}[ \\t]*=[^\\r\\n]*`, 'm');
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  const body = text === '' || text.endsWith('\n') ? text : text + eol;
  return `${body}${key}=${value}${eol}`;
}

/**
 * Move secrets pasted into the public example into the private env. A value already set in the
 * env wins. Returns the new texts and which keys moved.
 */
export function moveSecrets(exampleText, envText, keys = SECRET_KEYS) {
  let example = exampleText;
  let env = envText;
  const moved = [];
  for (const key of keys) {
    const re = new RegExp(`^([ \\t]*${key}[ \\t]*=)([^\\r\\n]*)`, 'm');
    const value = example.match(re)?.[2]?.trim();
    if (!value) continue;
    if (!parseEnv(env)[key]) env = setEnvText(env, key, value);
    example = example.replace(re, '$1');
    moved.push(key);
  }
  return { example, env, moved };
}
