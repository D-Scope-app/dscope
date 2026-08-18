function normalizeFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function envFlag(publicName: string, viteName: string, fallback = false): boolean {
  const env = import.meta.env as unknown as Record<string, unknown>;
  if (env[publicName] !== undefined) return normalizeFlag(env[publicName]);
  if (env[viteName] !== undefined) return normalizeFlag(env[viteName]);
  return fallback;
}

export function isLocalhostRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}

export const PUBLIC_ENABLE_ADMIN = envFlag(
  "PUBLIC_ENABLE_ADMIN",
  "VITE_ENABLE_ADMIN",
  false,
);

export const PUBLIC_ENABLE_DEV_MODE =
  envFlag("PUBLIC_ENABLE_DEV_MODE", "VITE_ENABLE_DEV_MODE", false) ||
  isLocalhostRuntime();

export const PUBLIC_SHOW_CONTRACT_DETAILS = envFlag(
  "PUBLIC_SHOW_CONTRACT_DETAILS",
  "VITE_SHOW_CONTRACT_DETAILS",
  false,
);
