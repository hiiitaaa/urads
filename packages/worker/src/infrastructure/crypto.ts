/**
 * AES-256-GCM 暗号化モジュール（Web Crypto API）
 * D1にAPIキー等を安全に保存するため使用
 * 形式: base64(iv).base64(ciphertext)
 */

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const KEY_LENGTH = 32; // 256 bits

/**
 * ENCRYPTION_KEY文字列からCryptoKeyを導出
 */
async function deriveKey(keyString: string): Promise<CryptoKey> {
  // キー文字列をSHA-256でハッシュして32バイトに正規化
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keyString);
  const hash = await crypto.subtle.digest('SHA-256', keyData);

  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: ALGORITHM, length: KEY_LENGTH * 8 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * 平文を暗号化
 * @returns "base64(iv).base64(ciphertext)" 形式
 */
export async function encryptField(encryptionKey: string, plaintext: string): Promise<string> {
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY が設定されていません。wrangler secret put ENCRYPTION_KEY を実行してください。');
  }
  const key = await deriveKey(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoder.encode(plaintext),
  );

  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ctBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

  return `${ivBase64}.${ctBase64}`;
}

/**
 * 暗号文を復号
 * @param encrypted "base64(iv).base64(ciphertext)" 形式
 */
/**
 * 平文フォールバック付き復号
 * 暗号化形式（iv.ciphertext）でなければ平文としてそのまま返す
 * 既存の平文データとの互換性を保つ
 */
export async function decryptFieldSafe(encryptionKey: string, value: string): Promise<string> {
  const parts = value.split('.');
  if (parts.length !== 2) {
    // 平文（既存データ）→ そのまま返す
    return value;
  }
  return decryptField(encryptionKey, value);
}

export async function decryptField(encryptionKey: string, encrypted: string): Promise<string> {
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY が設定されていません。wrangler secret put ENCRYPTION_KEY を実行してください。');
  }
  const parts = encrypted.split('.');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted format');
  }

  const key = await deriveKey(encryptionKey);
  const iv = Uint8Array.from(atob(parts[0]), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}
