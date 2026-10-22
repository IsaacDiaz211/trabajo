import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const htmlPath = join(import.meta.dir, "../public/index.html");
const html = readFileSync(htmlPath, "utf8");

function runGetSelectedTimezone(state: Record<string, string>): string {
  const m = html.match(/function getSelectedTimezone\(\) \{[\s\S]*?\n\}/);
  expect(m).not.toBeNull();
  const fnSrc = m![0];
  const $ = (id: string) => ({ value: state[id] ?? "" });
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function("$", `${fnSrc}\nreturn getSelectedTimezone();`) as (
    dollar: (id: string) => { value: string },
  ) => string;
  return fn($);
}

test("mantiene labels y modal de confirmación", () => {
  expect(html).toContain("Signo (-/+)");
  expect(html).toContain("Horas (0–14)");
  expect(html).toContain("O escribir UTC±N");
  expect(html).toContain("¿Seguro que quieres guardar los cambios?");
});

test("tocar signo/número limpia el texto manual precargado", () => {
  // El fix debe cablear signo y número para limpiar #c-tz-custom.
  expect(html).toContain("c-tz-sign");
  expect(html).toContain("c-tz-offset");
  expect(html).toContain("c-tz-custom");
  const clearsCustom = (html.match(/c-tz-custom['"\)\]]*\s*\.value\s*=\s*['"]{2}/g) ?? []).length;
  expect(clearsCustom).toBeGreaterThanOrEqual(2);
  // Debe haber listeners sobre signo y sobre número.
  expect(html.includes("c-tz-sign") && html.includes("addEventListener")).toBe(true);
  expect(html.includes("c-tz-offset") && html.includes("addEventListener")).toBe(true);
});

test("caso UTC-5 -> UTC+9 vía controles sin borrar texto debe guardar UTC+9", () => {
  // Estado tras loadConfig("UTC-5"): controles en -/5 y texto precargado "UTC-5".
  // Usuario cambia controles a +/9. El fix (listeners) limpia el texto a "".
  const afterTouchState = {
    "c-timezone": "__custom__",
    "c-tz-sign": "+",
    "c-tz-offset": "9",
    "c-tz-custom": "", // limpiado por el fix al tocar signo/número
  };
  expect(runGetSelectedTimezone(afterTouchState)).toBe("UTC+9");

  // Documenta el bug original: con el texto viejo sin limpiar, volvía UTC-5.
  const staleState = {
    "c-timezone": "__custom__",
    "c-tz-sign": "+",
    "c-tz-offset": "9",
    "c-tz-custom": "UTC-5",
  };
  expect(runGetSelectedTimezone(staleState)).toBe("UTC-5");
});

test("UTC-5 -> UTC+9 simulando listeners reales (change/input en #c-tz-sign y #c-tz-offset)", () => {
  // Carga public/index.html como texto (lectura explícita dentro del test).
  const raw = readFileSync(join(import.meta.dir, "../public/index.html"), "utf8");
  expect(raw).toContain("c-tz-sign");
  expect(raw).toContain("c-tz-offset");
  expect(raw).toContain("c-tz-custom");
  const script = raw.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? raw;

  type FakeEl = {
    value: string;
    listeners: Record<string, Array<() => void>>;
    addEventListener: (type: string, fn: () => void) => void;
    dispatch: (type: string) => void;
  };
  const makeEl = (value: string): FakeEl => {
    const listeners: Record<string, Array<() => void>> = {};
    const el: FakeEl = {
      value,
      listeners,
      addEventListener: (type, fn) => {
        (listeners[type] ??= []).push(fn);
      },
      dispatch: (type) => {
        for (const fn of listeners[type] ?? []) fn();
      },
    };
    return el;
  };

  // Estado tras loadConfig("UTC-5"): controles en -/5 y texto precargado "UTC-5".
  const els: Record<string, FakeEl> = {
    "c-timezone": makeEl("__custom__"),
    "c-tz-sign": makeEl("-"),
    "c-tz-offset": makeEl("5"),
    "c-tz-custom": makeEl("UTC-5"),
  };
  const $fake = (id: string): FakeEl => els[id];

  // Cablea los listeners REALES declarados en el HTML (no stubs):
  // evalúa cada `$('c-tz-sign'|'c-tz-offset').addEventListener(...)` tal cual está en el script.
  const listenerStmts =
    script.match(/\$\('c-tz-(?:sign|offset)'\)\.addEventListener\(.*?\}\s*\);/gs) ?? [];
  expect(listenerStmts.length).toBeGreaterThanOrEqual(2);
  expect(listenerStmts.some((s) => s.includes("c-tz-sign"))).toBe(true);
  expect(listenerStmts.some((s) => s.includes("c-tz-offset"))).toBe(true);
  for (const stmt of listenerStmts) {
    const wire = new Function("$", stmt) as ($: (id: string) => FakeEl) => void;
    wire($fake);
  }
  // Verificación de handler: ambos controles quedaron con listeners.
  expect((els["c-tz-sign"].listeners["change"] ?? []).length).toBeGreaterThanOrEqual(1);
  const offsetListeners =
    (els["c-tz-offset"].listeners["input"] ?? []).length +
    (els["c-tz-offset"].listeners["change"] ?? []).length;
  expect(offsetListeners).toBeGreaterThanOrEqual(1);

  // Extrae getSelectedTimezone() real del HTML y lo evalúa contra el fake DOM.
  const m = script.match(/function getSelectedTimezone\(\) \{[\s\S]*?\n\}/);
  expect(m).not.toBeNull();
  const getSelectedTimezone = new Function(
    "$",
    `${m![0]}\nreturn getSelectedTimezone();`,
  ) as ($: (id: string) => { value: string }) => string;

  // Usuario toca ambos controles para pasar a +/9 (dispatch de eventos reales).
  els["c-tz-sign"].value = "+";
  els["c-tz-sign"].dispatch("change");
  els["c-tz-offset"].value = "9";
  els["c-tz-offset"].dispatch("input");
  els["c-tz-offset"].dispatch("change");

  // Los listeners reales debieron limpiar el texto manual precargado.
  expect(els["c-tz-custom"].value).toBe("");
  // Y getSelectedTimezone() real debe producir UTC+9 desde los controles.
  expect(getSelectedTimezone($fake)).toBe("UTC+9");
});
