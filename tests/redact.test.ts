import { describe, expect, it } from "vitest";
import { redact, truncateMiddle } from "../src/redact.js";

describe("redact", () => {
  const cases: [string, string, string][] = [
    ["bearer token", "Authorization: Bearer abc123def456ghi789", "abc123def456ghi789"],
    ["jwt", "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl", "eyJhbGciOiJIUzI1NiJ9"],
    ["anthropic key", "key sk-ant-api03-ABCDEFGHIJKLMNOP", "sk-ant-api03"],
    ["aws key", "AKIAIOSFODNN7EXAMPLE in env", "AKIAIOSFODNN7EXAMPLE"],
    ["github token", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghp_abcdef"],
    ["password json", '{"email":"a","password":"Sup3rS3cret!"}', "Sup3rS3cret!"],
    ["env style secret", "CLIENT_SECRET=topsecretvalue123", "topsecretvalue123"],
    ["url credentials", "postgres://admin:hunter2@db.internal:5432/app", "hunter2"],
    ["cookie header", "Set-Cookie: sid=abcdef123456; HttpOnly", "abcdef123456"],
    ["email", "user jane.doe@corp.example.com failed", "jane.doe@corp.example.com"],
    ["openai project key", "OPENAI sk-proj-abcDEF123_ghiJKL456-mnoPQR789", "sk-proj-abcDEF"],
    ["github fine-grained pat", "github_pat_11ABCDEFG0123456789_abcdefghijklmnop", "github_pat_11ABC"],
    ["digest authorization", 'Authorization: Digest username="u", response="6629fae49393a05397450978507c4ef1"', "6629fae4939"],
    ["private key", "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----", "MIIB"],
  ];
  it.each(cases)("redacts %s", (_n, input, secret) => {
    const out = redact(input);
    expect(out).not.toContain(secret);
    expect(out).toContain("[REDACTED");
  });

  it("leaves ordinary diagnostic text intact", () => {
    const s = "Expected: 'Total: $64.78' Received: 'Total: $59.98' at checkout.spec.ts:19";
    expect(redact(s)).toBe(s);
  });

  it("truncates the middle of long strings, keeping both ends", () => {
    const t = truncateMiddle("A".repeat(100) + "Z".repeat(100), 50);
    expect(t.startsWith("A")).toBe(true);
    expect(t.endsWith("Z")).toBe(true);
    expect(t).toContain("truncated");
  });
});
