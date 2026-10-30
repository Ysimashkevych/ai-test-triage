import { describe, expect, it } from "vitest";
import { parseReport, parseReportText, ReportParseError } from "../src/parser/playwright.js";
import { fixtureText } from "./helpers.js";

describe("playwright parser", () => {
  const checkout = parseReportText(fixtureText("checkout-report.json"));

  it("extracts only failed and flaky tests, skipping passing ones", () => {
    expect(checkout.map((f) => f.id)).toEqual([
      "checkout.spec.ts:14 [chromium]",
      "checkout.spec.ts:41 [chromium]",
      "checkout.spec.ts:58 [chromium]",
      "checkout.spec.ts:75 [chromium]",
    ]);
  });

  it("strips ANSI codes and keeps nested suite titles", () => {
    expect(checkout[0]!.errorMessage).not.toContain("\u001b");
    expect(checkout[0]!.errorMessage).toContain('Received: "Total: $59.98"');
    expect(checkout[0]!.title).toBe("Checkout > applies 8% tax to cart total");
  });

  it("captures trace, screenshot and console output", () => {
    expect(checkout[0]!.tracePath).toBe("test-results/checkout-tax/trace.zip");
    expect(checkout[0]!.screenshotPath).toMatch(/test-failed-1\.png$/);
    expect(checkout[0]!.stdout.join("")).toContain("taxRate=0");
  });

  it("marks flaky tests and uses the failed attempt's error", () => {
    const flaky = checkout[3]!;
    expect(flaky.outcome).toBe("flaky");
    expect(flaky.attempts.map((a) => a.status)).toEqual(["failed", "passed"]);
    expect(flaky.errorMessage).toContain("Timeout 30000ms exceeded");
  });

  it("handles suites nested in a different shape (specs + child suites)", () => {
    expect(parseReportText(fixtureText("auth-report.json"))).toHaveLength(3);
  });

  it("rejects non-reports", () => {
    expect(() => parseReportText("not json")).toThrow(ReportParseError);
    expect(() => parseReport({ foo: 1 })).toThrow(/suites/);
  });
});
