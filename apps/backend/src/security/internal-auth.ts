const MAX_AUTHORIZATION_HEADER_BYTES = 4096;

/**
 * Compares two short secrets without returning on the first different byte.
 * This avoids the obvious timing leak from ordinary string equality while
 * remaining compatible with the Cloudflare Workers runtime.
 */
export function timingSafeStringEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);

  if (
    leftBytes.length > MAX_AUTHORIZATION_HEADER_BYTES ||
    rightBytes.length > MAX_AUTHORIZATION_HEADER_BYTES
  ) {
    return false;
  }

  const comparedLength = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < comparedLength; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

export function hasValidBearerToken(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return false;

  const authorization = request.headers.get("authorization") ?? "";
  return timingSafeStringEqual(authorization, `Bearer ${expectedToken}`);
}
