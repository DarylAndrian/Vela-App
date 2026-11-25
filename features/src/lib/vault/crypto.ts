/**
 * Vault encryption utilities — AES-256-GCM with PBKDF2 key derivation.
 *
 * Master password never leaves the client. It's used to derive an encryption
 * key via PBKDF2 (600k iterations, SHA-256). The entire Vault is encrypted with
 * AES-256-GCM using a new IV on each save.
 */

const PBKDF2_ITERATIONS = 600_000
const SALT_LENGTH = 16
const IV_LENGTH = 12

/* ── Key Derivation ──────────────────────────────────────────────── */

async function deriveKey(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/* ── Encrypt a single value ─────────────────────────────────────── */

export async function encryptValue(value: string, masterPassword: string, salt: Uint8Array): Promise<string> {
  return encryptWithKey(value, await deriveKey(masterPassword, salt))
}

async function encryptWithKey(value: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoder = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length)
  combined.set(iv, 0)
  combined.set(new Uint8Array(encrypted), iv.length)
  let binary = ''
  for (let offset = 0; offset < combined.length; offset += 8192) {
    binary += String.fromCharCode(...combined.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

/* ── Decrypt a single value ─────────────────────────────────────── */

export async function decryptValue(encryptedBase64: string, masterPassword: string, salt: Uint8Array): Promise<string> {
  return decryptWithKey(encryptedBase64, await deriveKey(masterPassword, salt))
}

async function decryptWithKey(encryptedBase64: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}

/* ── Generate salt ──────────────────────────────────────────────── */

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  return btoa(String.fromCharCode(...salt))
}

export function saltFromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

/* ── Vault data structure ────────────────────────────────────────── */

export interface VaultField {
  id: string
  label: string
  value: string  // plaintext in memory, encrypted at rest
  type: 'text' | 'password' | 'pin' | 'url' | 'notes'
}

export interface VaultAccount {
  id: string
  label: string
  fields: VaultField[]
  createdAt: string
  updatedAt: string
}

export interface VaultProduct {
  id: string
  name: string
  url: string
  tags: string[]
  accounts: VaultAccount[]
  createdAt: string
  updatedAt: string
}

/** Legacy flat entry (v1). Only used to migrate existing vaults. */
export interface VaultEntry {
  id: string
  name: string
  url: string
  fields: VaultField[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface EncryptedVault {
  version: number
  salt: string        // base64
  entries: string     // encrypted JSON blob (base64)
  createdAt: string
  updatedAt: string
}

export type VaultSnapshot =
  | { kind: 'empty'; revision: 0 }
  | { kind: 'legacy'; revision: number; entries: string | null; createdAt: string; updatedAt: string }
  | { kind: 'ready'; revision: number; vault: EncryptedVault }

export async function createVaultKey(masterPassword: string, salt = generateSalt()) {
  return { salt, key: await deriveKey(masterPassword, saltFromB64(salt)) }
}

export type VaultKey = Awaited<ReturnType<typeof createVaultKey>>

/* ── Full vault encrypt / decrypt ────────────────────────────────── */

export async function encryptVault(products: VaultProduct[], masterPassword: string, existingSaltB64?: string): Promise<EncryptedVault> {
  return sealVault(products, await createVaultKey(masterPassword, existingSaltB64))
}

export async function sealVault(products: VaultProduct[], { salt, key }: VaultKey): Promise<EncryptedVault> {
  const encrypted = await encryptWithKey(JSON.stringify(products), key)
  const now = new Date().toISOString()
  return {
    version: 2,
    salt,
    entries: encrypted,
    createdAt: now,
    updatedAt: now,
  }
}

function isLegacyEntry(e: any): boolean {
  return e && typeof e === 'object' && 'fields' in e && !('accounts' in e)
}

function migrateLegacyEntries(entries: VaultEntry[]): VaultProduct[] {
  return entries.map((e) => {
    const now = e.updatedAt || new Date().toISOString()
    const usernameField = e.fields?.find(f => /username|email|login/i.test(f.label || ''))
    const accountLabel = usernameField?.value?.trim() || 'Default'
    return {
      id: e.id,
      name: e.name,
      url: e.url,
      tags: e.tags || [],
      accounts: [{
        id: `${e.id}-account`,
        label: accountLabel,
        fields: e.fields || [],
        createdAt: e.createdAt || now,
        updatedAt: e.updatedAt || now,
      }],
      createdAt: e.createdAt || now,
      updatedAt: now,
    }
  })
}

export async function decryptVault(vault: EncryptedVault, masterPassword: string): Promise<VaultProduct[]> {
  return unsealVault(vault, await createVaultKey(masterPassword, vault.salt))
}

export async function unsealVault(vault: EncryptedVault, { salt, key }: VaultKey): Promise<VaultProduct[]> {
  if (vault.salt !== salt || (vault.version !== 1 && vault.version !== 2)) throw new Error('Unsupported Vault encryption.')
  const json = await decryptWithKey(vault.entries, key)
  const data = JSON.parse(json)
  if (!Array.isArray(data)) throw new Error('Invalid Vault contents.')
  if (Array.isArray(data) && data.length > 0 && isLegacyEntry(data[0])) {
    return migrateLegacyEntries(data)
  }
  return data as VaultProduct[]
}

export function generatePassword(length = 20, characters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+-=[]{}|;:,.<>?') {
  if (!characters.length || characters.length > 256 || !Number.isSafeInteger(length) || length < 1 || length > 256) {
    throw new Error('Invalid password generator options.')
  }
  const limit = 256 - (256 % characters.length)
  let password = ''
  const random = new Uint8Array(64)
  while (password.length < length) {
    crypto.getRandomValues(random)
    for (const byte of random) {
      if (byte < limit) password += characters[byte % characters.length]
      if (password.length === length) break
    }
  }
  return password
}
