/**
 * Best-effort secret redaction applied to ALL text before it leaves the process.
 * Pattern based: it cannot catch secrets it does not recognise. See README "Privacy".
 */
const RULES: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\b(authorization|proxy-authorization)(["']?\s*[:=]\s*)[^\r\n]+/gi, "$1$2[REDACTED]"], // whole value: Digest/Negotiate carry secrets after spaces and quotes
  [/\b(set-cookie|cookie)(["']?\s*[:=]\s*)[^\r\n]+/gi, "$1$2[REDACTED]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, "Bearer [REDACTED]"],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[REDACTED_JWT]"],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, "[REDACTED_API_KEY]"],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, "[REDACTED_API_KEY]"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[REDACTED_SLACK_TOKEN]"],
  // scheme://user:pass@host
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED]@"],
  // key=value / "key": "value" for sensitive-looking names
  [
    /(["']?\b[\w-]*(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|session[_-]?id)[\w-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&"'}]+)/gi,
    "$1[REDACTED]",
  ],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]"],
];

export function redact(text: string): string {
  return RULES.reduce((acc, [re, rep]) => acc.replace(re, rep), text);
}

/** Keep head and tail of an overlong string (errors usually matter at both ends). */
export function truncateMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.ceil(max * 0.6);
  const tail = max - head;
  return `${text.slice(0, head)}\n[... ${text.length - max} chars truncated ...]\n${text.slice(text.length - tail)}`;
}
