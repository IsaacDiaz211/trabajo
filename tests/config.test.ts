import { expect, test } from "bun:test";
import {
  DEFAULT_CONFIG,
  isValidTimezone,
  mergeConfig,
} from "../src/config";

const base = () => structuredClone(DEFAULT_CONFIG);

test("timezone acepta IANA comunes", () => {
  for (const tz of [
    "America/Argentina/Buenos_Aires",
    "UTC",
    "America/Santiago",
    "America/Sao_Paulo",
    "America/Bogota",
    "America/Mexico_City",
    "Europe/Madrid",
  ]) {
    expect(isValidTimezone(tz)).toBe(true);
    expect(mergeConfig(base(), { timezone: tz }).timezone).toBe(tz);
  }
});

test("timezone acepta UTC±N (N 0-14)", () => {
  for (const tz of ["UTC-5", "UTC+9", "UTC+0", "UTC-0", "UTC+14", "UTC-14", "UTC+1", "UTC-12"]) {
    expect(isValidTimezone(tz)).toBe(true);
    expect(mergeConfig(base(), { timezone: tz }).timezone).toBe(tz);
  }
});

test("timezone rechaza inválidos", () => {
  for (const tz of [
    "FOO/BAR",
    "NotATimezone",
    "UTC+15",
    "UTC-15",
    "UTC+99",
    "UTC++5",
    "UTC+",
    "UTC",
    // "UTC" sin offset es válido (va arriba); aquí solo inválidos reales
  ].filter((t) => t !== "UTC")) {
    expect(isValidTimezone(tz)).toBe(false);
    expect(() => mergeConfig(base(), { timezone: tz })).toThrow("Zona horaria inválida");
  }
  // UTC±N fuera de rango con texto
  expect(isValidTimezone("UTC+14 ")).toBe(true); // trailing space se tolera (trim)
  expect(isValidTimezone("UTC+15")).toBe(false);
  expect(isValidTimezone("America/Invalid_City_XYZ")).toBe(false);
});

test("mergeConfig sin timezone conserva base y con vacío conserva base", () => {
  expect(mergeConfig(base(), {}).timezone).toBe(DEFAULT_CONFIG.timezone);
  expect(mergeConfig(base(), { timezone: "" }).timezone).toBe(DEFAULT_CONFIG.timezone);
  expect(mergeConfig(base(), { timezone: "   " }).timezone).toBe(DEFAULT_CONFIG.timezone);
});
