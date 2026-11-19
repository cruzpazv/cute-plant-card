import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { load, ROOT } from "./helpers.mjs";

const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const api = load();

test("hacs.json points at the card in dist/", () => {
  const hacs = JSON.parse(read("hacs.json"));
  assert.equal(hacs.filename, "cute-plant-card.js");
  assert.ok(existsSync(new URL(`dist/${hacs.filename}`, ROOT)));
  assert.match(hacs.homeassistant, /^\d{4}\.\d+\.\d+$/);
});

test("package.json version matches the card (the README badge reads it)", () => {
  assert.equal(JSON.parse(read("package.json")).version, api.VERSION);
});

test("the changelog has an entry for this version", () => {
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${api.VERSION.replace(/\./g, "\\.")}$`, "m"));
});

test("English and Spanish have the same keys", () => {
  const shape = (o, p = "") => Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? shape(v, `${p}${k}.`) : [`${p}${k}:${Array.isArray(v) ? `array${v.length}` : typeof v}`]);
  assert.deepEqual(shape(api.T.es).sort(), shape(api.T.en).sort());
});

const fields = (schema) => schema.flatMap((s) => (s.schema ? fields(s.schema) : [s.name]));

test("every editor field has a label in both languages", () => {
  for (const lang of ["en", "es"])
    for (const name of fields(api.SCHEMA(api.T[lang]))) assert.ok(api.T[lang].labels[name], `${lang}: ${name}`);
});

test("the editor shows on-by-default switches as on", () => {
  const editor = new api.CutePlantCardEditor();
  editor.setConfig({ type: "custom:cute-plant-card", entity: "input_button.regar" });
  editor.hass = { locale: { language: "es" } };
  const form = editor.children[0];
  assert.equal(form.tagName, "ha-form");
  for (const k of ["show_name", "show_light", "confirm", "show_bubbles"]) assert.equal(form.data[k], true, k);
  assert.equal(form.data.entity, "input_button.regar");
  assert.equal(form.computeLabel({ name: "show_name" }), "Mostrar nombre");
});

test("the editor keeps defaults and empty fields out of the YAML", () => {
  const editor = new api.CutePlantCardEditor();
  editor.setConfig({ type: "custom:cute-plant-card", entity: "input_button.regar" });
  editor.hass = { locale: { language: "en" } };
  const form = editor.children[0];
  let out;
  editor.dispatchEvent = (e) => { out = e.detail.config; };
  form.fire("value-changed", { detail: { value: { ...form.data, show_name: false, name: "", sensors: [] } } });
  assert.deepEqual(out, { type: "custom:cute-plant-card", entity: "input_button.regar", show_name: false });
});

test("the card opens its own editor", () => {
  assert.equal(api.CutePlantCard.getConfigElement().tagName, "cute-plant-card-editor");
  assert.equal(api.defined["cute-plant-card-editor"], api.CutePlantCardEditor);
});

test("every editor field is documented in the README", () => {
  const readme = read("README.md");
  for (const name of [...fields(api.SCHEMA(api.T.en)), "tap_action", "hold_action"])
    assert.ok(readme.includes(`\`${name}\``), name);
});

test("every plant type is listed in the editor and in the README", () => {
  const readme = read("README.md");
  for (const kind of Object.keys(api.SPECIES)) {
    assert.ok(api.T.en.species[kind] && api.T.es.species[kind], kind);
    assert.ok(readme.includes(`\`${kind}\``), kind);
  }
});
