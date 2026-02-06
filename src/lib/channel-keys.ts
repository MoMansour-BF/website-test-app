/**
 * Phase 2: API key selection by channel (guest → B2C, logged-in → CUG).
 * Uses only LITEAPI_KEY_B2C and LITEAPI_KEY_CUG (no fallback) so the correct key is always used.
 */

export type Channel = "b2c" | "cug";

const ENV_B2C = "LITEAPI_KEY_B2C";
const ENV_CUG = "LITEAPI_KEY_CUG";

/** Read env var; handles BOM or invisible chars on first line of .env.local */
function getEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  // First line of .env can have UTF-8 BOM; key may be stored as "\uFEFFLITEAPI_KEY_..."
  const withBom = process.env["\uFEFF" + name];
  if (withBom && typeof withBom === "string" && withBom.trim()) return withBom.trim();
  // Fallback: find key that matches when trimmed (handles BOM/trailing space in key)
  const match = Object.entries(process.env).find(
    ([k]) => k.trim() === name || k.replace(/\uFEFF/g, "").trim() === name
  );
  return match?.[1]?.trim();
}

export function getLiteApiKeyForChannel(channel: Channel): string {
  const envName = channel === "cug" ? ENV_CUG : ENV_B2C;
  const key = getEnv(envName);
  if (!key) {
    throw new Error(
      `${envName} is not set or is empty. Add it to .env.local in the project root (same folder as package.json), save without BOM, and restart the dev server.`
    );
  }
  return key;
}
