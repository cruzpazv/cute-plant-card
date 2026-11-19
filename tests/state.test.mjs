import { test } from "node:test";
import assert from "node:assert/strict";
import { load, makeHass, mount, ago } from "./helpers.mjs";

const api = load();
const E = "input_button.regar";
const state = (config, states, opts) => {
  const card = mount(api, { entity: E, ...config }, makeHass(states, opts));
  return { card, r: card._compute(), el: card._el };
};

test("freshly watered: happy, full countdown", () => {
  const { r, el } = state({ species: "generic" }, { [E]: ago(0.01) });
  assert.equal(r.status, "ok");
  assert.equal(r.mood, "happy");
  assert.equal(r.daysLeft, 7);
  assert.ok(r.wet, "drops on the leaves right after watering");
  assert.equal(el.chip.textContent, "7d");
  assert.equal(el.sub.textContent, "Water in 7 days");
});

test("the plant goes from happy to ok to tired as days pass", () => {
  const at = (days) => state({ species: "generic" }, { [E]: ago(days) }).r;
  assert.deepEqual([at(3.5).mood, at(3.5).status, at(3.5).daysLeft], ["ok", "ok", 4]);
  assert.deepEqual([at(5.5).mood, at(5.5).status, at(5.5).daysLeft], ["tired", "soon", 2]);
  assert.deepEqual([at(6.5).mood, at(6.5).status, at(6.5).daysLeft], ["tired", "soon", 1]);
});

test("watering day and overdue: sad, red chip", () => {
  const today = state({ species: "generic" }, { [E]: ago(7) });
  assert.equal(today.r.status, "water");
  assert.equal(today.r.mood, "sad");
  assert.equal(today.r.d, 1);
  assert.equal(today.el.chip.textContent, "Today!");
  const late = state({ species: "generic" }, { [E]: ago(9) });
  assert.equal(late.el.chip.textContent, "+2d");
  assert.equal(late.el.chip.className, "chip water");
  assert.equal(late.el.sub.textContent, "Time to water! (2 days late)");
});

test("nothing logged yet: asleep", () => {
  const { r, el } = state({}, { [E]: "unknown" });
  assert.equal(r.status, "unknown");
  assert.equal(r.mood, "sleep");
  assert.equal(el.chip.textContent, "?");
  assert.equal(el.sub.textContent, "Tap to log a watering");
});

test("interval: config beats Perenual beats the plant type", () => {
  assert.equal(state({ species: "cactus" }, { [E]: ago(1) }).r.interval, 21);
  assert.equal(state({ species: "cactus", interval: 10 }, { [E]: ago(1) }).r.interval, 10);
  const card = mount(api, { entity: E, species: "cactus" }, makeHass({ [E]: ago(1) }));
  card._pe = { interval: 12, light: { min: 3, max: 3 } };
  assert.equal(card._compute().interval, 12);
});

test("input_datetime and timestamp sensors work as the watering entity", () => {
  const dt = "input_datetime.riego";
  const a = mount(api, { entity: dt, species: "generic" }, makeHass({ [dt]: { state: "x", attributes: { timestamp: (Date.now() - 2 * 864e5) / 1000, has_date: true } } }));
  assert.equal(a._compute().daysLeft, 5);
  const s = "sensor.last_watered";
  const b = mount(api, { entity: s, species: "generic" }, makeHass({ [s]: ago(3) }));
  assert.equal(b._compute().daysLeft, 4);
});

test("outdoors, rain since the last watering resets the countdown", () => {
  const states = { [E]: ago(5), "input_datetime.ultima_lluvia": { state: "x", attributes: { timestamp: (Date.now() - 864e5) / 1000 } } };
  const out = state({ species: "generic", outdoor: true, rain_entity: "input_datetime.ultima_lluvia" }, states);
  assert.equal(out.r.daysLeft, 6);
  assert.ok(out.r.rained);
  assert.match(out.el.badges.innerHTML, /It has rained since the last watering/);
  const inside = state({ species: "generic", rain_entity: "input_datetime.ultima_lluvia" }, states);
  assert.equal(inside.r.daysLeft, 2, "indoors rain doesn't count");
  assert.ok(!inside.r.rained);
});

test("rain in the future and rain before the watering are ignored", () => {
  const rain = "sensor.next_rain";
  const r1 = state({ species: "generic", outdoor: true, rain_entity: rain }, { [E]: ago(5), [rain]: new Date(Date.now() + 864e5).toISOString() }).r;
  assert.equal(r1.daysLeft, 2);
  const r2 = state({ species: "generic", outdoor: true, rain_entity: rain }, { [E]: ago(2), [rain]: ago(4) }).r;
  assert.equal(r2.daysLeft, 5);
  assert.ok(!r2.rained);
});

test("a rain binary_sensor that is on counts as watering now", () => {
  const { r } = state({ species: "generic", outdoor: true, rain_entity: "binary_sensor.lluvia" }, { [E]: ago(6), "binary_sensor.lluvia": "on" });
  assert.equal(r.daysLeft, 7);
});

test("while it rains outdoors: no need to water", () => {
  const states = { [E]: ago(9), "weather.casa": { state: "rainy", attributes: { temperature: 15 } } };
  const out = state({ species: "generic", outdoor: true, weather_entity: "weather.casa" }, states);
  assert.equal(out.r.status, "rain");
  assert.equal(out.r.mood, "rain");
  assert.equal(out.el.sub.textContent, "It's raining: no need to water");
  assert.equal(out.el.chip.className, "chip rain");
  assert.doesNotMatch(out.el.badges.innerHTML, /<title>It's raining/, "no rain badge on top of the drops");
  assert.match(out.el.art.innerHTML, /class="drop"/);
  const inside = state({ species: "generic", weather_entity: "weather.casa" }, states);
  assert.equal(inside.r.status, "water");
});

test("heat shortens the interval, cold lengthens it", () => {
  const w = (t) => ({ [E]: ago(1), "weather.casa": { state: "sunny", attributes: { temperature: t } } });
  const at = (t, extra = {}) => state({ species: "generic", weather_entity: "weather.casa", ...extra }, w(t)).r;
  assert.equal(at(20).interval, 7);
  assert.equal(at(28).interval, 5.25);
  assert.equal(at(33).interval, 4.2);
  assert.equal(at(12).interval, 9.1);
  assert.equal(at(25, { hot_temperature: 24 }).interval, 5.25, "threshold is configurable");
  const { el } = state({ species: "generic", weather_entity: "weather.casa" }, w(30));
  assert.match(el.badges.innerHTML, /Hot weather/);
});

test("a temperature sensor wins over the weather entity", () => {
  const states = { [E]: ago(1), "weather.casa": { state: "sunny", attributes: { temperature: 35 } }, "sensor.salon": 21 };
  const { r } = state({ species: "generic", weather_entity: "weather.casa", temperature_entity: "sensor.salon" }, states);
  assert.equal(r.temp, 21);
  assert.equal(r.factor, 1);
});

test("hot and thirsty: scorched mood", () => {
  const states = (t) => ({ [E]: ago(10), "weather.casa": { state: "sunny", attributes: { temperature: t } } });
  const hot = state({ species: "generic", weather_entity: "weather.casa" }, states(31));
  assert.equal(hot.r.mood, "heat");
  assert.equal(hot.el.sub.textContent, "Scorching hot and thirsty: water it now!");
  assert.match(hot.el.art.innerHTML, /class="spin"/);
  assert.equal(state({ species: "generic", weather_entity: "weather.casa" }, states(20)).r.mood, "sad");
  const notYet = mount(api, { entity: E, species: "generic", weather_entity: "weather.casa" }, makeHass({ [E]: ago(1), "weather.casa": { state: "sunny", attributes: { temperature: 31 } } }));
  assert.notEqual(notYet._compute().mood, "heat", "only when it needs water");
});

test("a days-left sensor is used as is", () => {
  const { r } = state({ species: "generic", days_entity: "sensor.balcon_riego" }, { [E]: ago(6), "sensor.balcon_riego": 3 });
  assert.equal(r.daysLeft, 3);
  assert.equal(r.mood, "ok");
});

test("the plant type is guessed from names in English and Spanish", () => {
  const k = (...names) => api.resolveKind("auto", names);
  assert.equal(k("Monstera Salón"), "monstera");
  assert.equal(k("Palmera Dormitorio"), "palm");
  assert.equal(k("Plantas Cocina"), "herb");
  assert.equal(k("Albahaca"), "herb");
  assert.equal(k("Echeveria"), "succulent");
  assert.equal(k("Geranio"), "flower");
  assert.equal(k("Helecho"), "fern");
  assert.equal(k("Potus"), "pothos");
  assert.equal(k("Lengua de suegra"), "snake");
  assert.equal(k("Opuntia"), "cactus");
  assert.equal(k("Plantas balcón"), "generic");
  assert.equal(k(undefined, "Regar Monstera"), "monstera", "falls back to later names");
  assert.equal(api.resolveKind("cactus", ["Monstera"]), "cactus", "an explicit type wins");
  assert.equal(api.resolveKind("bogus", ["Monstera"]), "monstera");
});

test("texts follow the Home Assistant language", () => {
  const es = mount(api, { entity: E, species: "generic" }, makeHass({ [E]: ago(9) }, { language: "es" }));
  assert.equal(es._el.sub.textContent, "¡Toca regar! (2 días de retraso)");
  assert.equal(es._el.q.textContent, "¿La has regado?");
  const one = mount(api, { entity: E, species: "generic" }, makeHass({ [E]: ago(6) }, { language: "es-ES" }));
  assert.equal(one._el.sub.textContent, "Regar en 1 día");
});

test("the name comes from config, then the entity, then the plant type", () => {
  assert.equal(state({ name: "Mi monstera" }, { [E]: ago(1) }).el.name.textContent, "Mi monstera");
  assert.equal(state({}, { [E]: { state: ago(1), attributes: { friendly_name: "Regar palmera" } } }).el.name.textContent, "Regar palmera");
  assert.equal(state({ species: "fern" }, { [E]: ago(1) }).el.name.textContent, "Fern");
  assert.ok(state({ name: "X", show_name: false }, { [E]: ago(1) }).el.name.hidden);
});

test("the tooltip sums everything up", () => {
  const { el } = state({ name: "Monstera", species: "monstera" }, { [E]: ago(2) });
  assert.match(el.card.title, /^Monstera\nWater in 5 days\nLast watered: .+\nEvery 7 days\nLight: Part shade$/);
});

test("the light badge follows the plant type and can be hidden", () => {
  assert.match(state({ species: "cactus" }, { [E]: ago(1) }).el.badges.innerHTML, /Light: Full sun/);
  assert.doesNotMatch(state({ species: "cactus", show_light: false }, { [E]: ago(1) }).el.badges.innerHTML, /Light/);
});

test("the art is only redrawn when something changes", () => {
  const hass = makeHass({ [E]: ago(1) });
  const card = mount(api, { entity: E }, hass);
  card._el.art.innerHTML = "untouched";
  card.hass = { ...hass, states: { ...hass.states, "light.other": { state: "on", attributes: {} } } };
  assert.equal(card._el.art.innerHTML, "untouched");
  card.hass = makeHass({ [E]: ago(6.5) });
  assert.notEqual(card._el.art.innerHTML, "untouched");
});
