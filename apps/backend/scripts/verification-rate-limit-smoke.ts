import assert from "node:assert/strict";

import {
  consumeVerificationSessionRateLimit,
  parseVerificationRateLimit,
  type VerificationRateLimitDatabase,
} from "../src/security/verification-rate-limit";

class InMemoryRateLimitDatabase implements VerificationRateLimitDatabase {
  private readonly counters = new Map<string, number>();

  prepare(_query: string) {
    return {
      bind: (...values: unknown[]) => ({
        first: async <T>() => {
          const [dimension, keyHash, surveyId, windowStart] = values.map(String);
          const key = [dimension, keyHash, surveyId, windowStart].join("|");
          const count = (this.counters.get(key) ?? 0) + 1;
          this.counters.set(key, count);
          return { request_count: count } as T;
        },
      }),
    };
  }
}

async function main() {
  assert.equal(parseVerificationRateLimit(undefined, 5), 5);
  assert.equal(parseVerificationRateLimit("0", 5), 5);
  assert.equal(parseVerificationRateLimit("12", 5), 12);

  const db = new InMemoryRateLimitDatabase();
  const now = new Date("2026-08-18T10:15:00.000Z");
  const request = new Request("https://app.dscope.app", {
    headers: { "cf-connecting-ip": "203.0.113.10" },
  });
  const base = {
    db,
    request,
    surveyId: "survey-1",
    walletAddress: `0x${"1".repeat(64)}`,
    secret: "rate-limit-secret",
    walletLimit: 2,
    ipLimit: 3,
    now,
  };

  const first = await consumeVerificationSessionRateLimit(base);
  const second = await consumeVerificationSessionRateLimit(base);
  const third = await consumeVerificationSessionRateLimit(base);

  assert.equal(first.allowed, true);
  assert.equal(first.ipProtectionApplied, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.blockedDimension, "wallet");
  assert.equal(third.retryAfterSeconds, 45 * 60);

  const rotatedWallet = await consumeVerificationSessionRateLimit({
    ...base,
    walletAddress: `0x${"2".repeat(64)}`,
  });
  assert.equal(rotatedWallet.allowed, false);
  assert.equal(rotatedWallet.blockedDimension, "ip");

  const noSecret = await consumeVerificationSessionRateLimit({
    ...base,
    db: new InMemoryRateLimitDatabase(),
    secret: undefined,
  });
  assert.equal(noSecret.allowed, true);
  assert.equal(noSecret.ipProtectionApplied, false);
  assert.equal(noSecret.ipCount, null);

  console.log("VERIFICATION_RATE_LIMIT_SMOKE_PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
