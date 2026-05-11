const ACCESS_STORAGE_KEY = "mapa-metodos-access-v1";

const configuredHash = (import.meta.env.VITE_APP_ACCESS_CODE_HASH ?? "").trim().toLowerCase();
const configuredCode = (import.meta.env.VITE_APP_ACCESS_CODE ?? "").trim();

export const accessControlEnabled = Boolean(configuredHash || configuredCode);

function getAccessFingerprint() {
  return configuredHash || (configuredCode ? `plain:${configuredCode}` : "disabled");
}

function normalizeHash(hash) {
  return hash.replace(/^sha-?256:/i, "").trim().toLowerCase();
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Este navegador no soporta validacion segura de codigos.");
  }

  const encoded = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hasStoredAccess() {
  if (!accessControlEnabled) return true;

  try {
    return sessionStorage.getItem(ACCESS_STORAGE_KEY) === getAccessFingerprint();
  } catch {
    return false;
  }
}

export function rememberAccess() {
  if (!accessControlEnabled) return;

  try {
    sessionStorage.setItem(ACCESS_STORAGE_KEY, getAccessFingerprint());
  } catch {
    // If storage is blocked, the user can still work during the current render.
  }
}

export function clearStoredAccess() {
  try {
    sessionStorage.removeItem(ACCESS_STORAGE_KEY);
  } catch {
    // Ignore blocked storage; locking is best-effort in that case.
  }
}

export async function verifyAccessCode(accessCode) {
  if (!accessControlEnabled) return true;

  const cleanCode = accessCode.trim();
  if (!cleanCode) return false;

  if (configuredHash) {
    const hashedCode = await sha256Hex(cleanCode);
    return timingSafeEqual(hashedCode, normalizeHash(configuredHash));
  }

  return timingSafeEqual(cleanCode, configuredCode);
}
