import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_LOCALE,
  formatCurrency,
  formatDateTime,
  formatNumber,
  getTextDirection,
  isSupportedLocale,
  resolveLocale,
} from "./locale.ts";

test("supported locales are resolved safely", () => {
  assert.equal(DEFAULT_LOCALE, "fa-AF");
  assert.equal(resolveLocale("fa-IR"), "fa-IR");
  assert.equal(resolveLocale("ps_AF"), "ps-AF");
  assert.equal(resolveLocale("EN-us"), "en");
  assert.equal(resolveLocale("not-a-locale"), DEFAULT_LOCALE);
  assert.equal(resolveLocale(null), DEFAULT_LOCALE);
  assert.equal(isSupportedLocale("ur"), true);
  assert.equal(isSupportedLocale("fr"), false);
});

test("direction is locale-specific and English remains left-to-right", () => {
  assert.equal(getTextDirection("fa-AF"), "rtl");
  assert.equal(getTextDirection("ps-AF"), "rtl");
  assert.equal(getTextDirection("ar"), "rtl");
  assert.equal(getTextDirection("ur"), "rtl");
  assert.equal(getTextDirection("en"), "ltr");
});

test("number and currency formatting never convert transaction currency", () => {
  assert.equal(formatNumber(Number.NaN, "en"), "—");
  assert.equal(formatCurrency(Number.NaN, "en", "en"), "—");
  assert.match(formatCurrency(1250, "AFN", "en"), /AFN/);
  assert.throws(() => formatCurrency(10, "tomans", "fa-AF"), RangeError);
});

test("invalid dates fail safely and explicit time zones are accepted", () => {
  assert.equal(formatDateTime("not-a-date", "en"), "—");
  assert.doesNotThrow(() =>
    formatDateTime("2026-01-01T12:00:00Z", "en", "Asia/Kabul"),
  );
});
