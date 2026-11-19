import { test } from "node:test";
import assert from "node:assert/strict";
import { load, makeHass, mount, ago, flush } from "./helpers.mjs";

const E = "input_button.regar";

test("tap asks first, yes waters an input_button", async () => {
  const api = load();
  const hass = makeHass({ [E]: ago(3) });
  const card = mount(api, { entity: E }, hass);
  assert.notEqual(card._el.confirm.hidden, false, "no question before tapping");
  card._el.card.fire("pointerdown");
  card._el.card.fire("pointerup");
  assert.equal(card._el.confirm.hidden, false, "confirmation shown");
  assert.equal(hass.calls.length, 0);
  card.shadowRoot.querySelector(".yes").fire("click");
  await flush();
  assert.deepEqual(hass.calls, [["input_button", "press", { entity_id: E }]]);
  assert.equal(card._el.confirm.hidden, true);
  assert.ok(card._el.card.classList.contains("watering"), "watering-can animation");
});

test("no closes the question without watering", () => {
  const hass = makeHass({ [E]: ago(3) });
  const card = mount(load(), { entity: E }, hass);
  card._tap();
  card.shadowRoot.querySelector(".no").fire("click");
  assert.equal(card._el.confirm.hidden, true);
  assert.equal(hass.calls.length, 0);
});

test("confirm: false waters straight away; Enter works like a tap", async () => {
  const hass = makeHass({ [E]: ago(3) });
  const card = mount(load(), { entity: E, confirm: false }, hass);
  card._el.card.fire("keydown", { key: "Enter" });
  await flush();
  assert.equal(hass.calls.length, 1);
});

test("an input_datetime is set to now", async () => {
  const dt = "input_datetime.riego";
  const hass = makeHass({ [dt]: ago(3) });
  const card = mount(load(), { entity: dt, confirm: false }, hass);
  card._tap();
  await flush();
  const [[dom, svc, data]] = hass.calls;
  assert.deepEqual([dom, svc, data.entity_id], ["input_datetime", "set_datetime", dt]);
  assert.ok(Math.abs(data.timestamp - Date.now() / 1000) < 5);
});

test("a read-only entity can't be watered: a notification instead", async () => {
  const api = load();
  const s = "sensor.last_watered";
  const hass = makeHass({ [s]: ago(3) });
  const card = mount(api, { entity: s, confirm: false }, hass);
  card._tap();
  await flush();
  assert.equal(hass.calls.length, 0);
  const ev = api.events.at(-1);
  assert.equal(ev.type, "hass-notification");
  assert.equal(ev.detail.message, "This entity can't be marked as watered");
});

test("long press opens more-info", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const api = load();
  const card = mount(api, { entity: E }, makeHass({ [E]: ago(3) }));
  card._el.card.fire("pointerdown");
  t.mock.timers.tick(500);
  card._el.card.fire("pointerup");
  const ev = api.events.at(-1);
  assert.equal(ev.type, "hass-action");
  assert.deepEqual(ev.detail, { config: { entity: E, hold_action: { action: "more-info" } }, action: "hold" });
  assert.notEqual(card._el.confirm.hidden, false, "a long press is not a tap");
});

test("tap and hold actions can be replaced", async () => {
  const api = load();
  const hass = makeHass({ [E]: ago(3) });
  const card = mount(api, { entity: E, tap_action: { action: "navigate", navigation_path: "/plantas" }, hold_action: { action: "water" } }, hass);
  card._tap();
  assert.deepEqual(api.events.at(-1).detail, { config: { entity: E, tap_action: { action: "navigate", navigation_path: "/plantas" } }, action: "tap" });
  card._hold();
  await flush();
  assert.equal(hass.calls.length, 1, "hold waters");
  const n = api.events.length;
  mount(api, { entity: E, hold_action: { action: "none" } }, hass)._hold();
  assert.equal(api.events.length, n, "none does nothing");
});

test("setConfig needs an entity", () => {
  const api = load();
  assert.throws(() => new api.CutePlantCard().setConfig({}), /entity/);
});

test("default size is 3 × 2 in the sections view", () => {
  const api = load();
  const card = new api.CutePlantCard();
  assert.deepEqual(card.getGridOptions(), { columns: 3, rows: 2, min_columns: 2, min_rows: 2 });
  assert.equal(card.getCardSize(), 2);
});

test("the stub config picks a watering button", () => {
  const api = load();
  const stub = api.CutePlantCard.getStubConfig({ states: { "input_button.doorbell": {}, "input_button.regar_monstera": {} } });
  assert.deepEqual(stub, { entity: "input_button.regar_monstera", species: "auto" });
});

test("the card registers itself for the card picker", () => {
  const api = load();
  assert.equal(api.defined["cute-plant-card"], api.CutePlantCard);
  assert.equal(api.window.customCards.filter((c) => c.type === "cute-plant-card").length, 1);
});

test("screen readers get one button for the plant and named yes/no buttons", () => {
  const api = load();
  const card = mount(api, { entity: E, name: "Fern" }, makeHass({ [E]: ago(1) }, { language: "es" }));
  assert.match(card._el.wrap.attrs["aria-label"], /^Fern\. /);
  assert.equal(card._el.yes.attrs["aria-label"], "Sí, la he regado");
  assert.equal(card._el.no.attrs["aria-label"], "Todavía no");
  assert.equal(card._el.card.attrs.role, undefined, "the card itself isn't a button around other buttons");
});
