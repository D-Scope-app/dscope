export function nowIso(): string {
  return new Date().toISOString();
}

export function isExpiredAt(
  value: string | null | undefined,
  now = new Date(),
): boolean {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return true;
  }

  return parsed.getTime() <= now.getTime();
}
