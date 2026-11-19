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
  for (const lang of ["en", "es"]) {
    const local = load({ language: lang });
    const form = local.CutePlantCard.getConfigForm();
    for (const name of fields(form.schema)) assert.ok(form.computeLabel({ name }), `${lang}: ${name}`);
    assert.equal(form.computeLabel({ name: "entity" }), local.T[lang].labels.entity);
  }
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
