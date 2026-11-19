import { test } from "node:test";
import assert from "node:assert/strict";
import { load, makeHass, mount, ago } from "./helpers.mjs";

const api = load();
const E = "input_button.regar";
const S = (state, attributes = {}) => ({ state, attributes });
const FLORA = {
  "sensor.flora_moisture": S(12, { device_class: "moisture", unit_of_measurement: "%" }),
  "sensor.flora_temperature": S(24.36, { device_class: "temperature", unit_of_measurement: "°C" }),
  "sensor.flora_conductivity": S(850, { device_class: "conductivity", unit_of_measurement: "µS/cm" }),
  "sensor.flora_illuminance": S(12500, { device_class: "illuminance", unit_of_measurement: "lx" }),
  "sensor.flora_battery": S(80, { device_class: "battery", unit_of_measurement: "%" }),
  "sensor.flora_rssi": S(-70, { unit_of_measurement: "dBm" }),
  "sensor.flora_hidden": S(5, { unit_of_measurement: "x" }),
  "sensor.flora_offline": S("unavailable", { device_class: "humidity" }),
};
const REG = {
  "sensor.flora_moisture": { device_id: "flora" },
  "sensor.flora_temperature": { device_id: "flora" },
  "sensor.flora_conductivity": { device_id: "flora" },
  "sensor.flora_illuminance": { device_id: "flora" },
  "sensor.flora_battery": { device_id: "flora", entity_category: "diagnostic" },
  "sensor.flora_rssi": { device_id: "flora", entity_category: "diagnostic" },
  "sensor.flora_hidden": { device_id: "flora", hidden: true },
  "sensor.flora_offline": { device_id: "flora" },
  "plant.monstera": { device_id: "flora" },
};
for (const [id, e] of Object.entries(REG)) e.entity_id = id;
const hass = (extra = {}, language = "en") => makeHass({ [E]: ago(1), ...FLORA, ...extra }, { entities: REG, language });
const ids = (card) => card._compute().sensors.map((b) => b.id);

test("sensor types come from device class, unit or name", () => {
  const t = (id, attributes = {}) => api.sensorType(id, { attributes });
  assert.equal(t("sensor.a", { device_class: "moisture" }), "moisture");
  assert.equal(t("sensor.soil"), "moisture");
  assert.equal(t("sensor.humedad_del_suelo"), "moisture");
  assert.equal(t("sensor.a", { unit_of_measurement: "°F" }), "temperature");
  assert.equal(t("sensor.a", { unit_of_measurement: "lx" }), "illuminance");
  assert.equal(t("sensor.a", { unit_of_measurement: "µS/cm" }), "conductivity");
  assert.equal(t("sensor.plant_fertility"), "conductivity");
  assert.equal(t("sensor.bateria"), "battery");
  assert.equal(t("sensor.a", { device_class: "humidity" }), "humidity");
  assert.equal(t("sensor.ph", { unit_of_measurement: "pH" }), "other");
});

test("bubble values are short and localised", () => {
  const f = (type, v, lang = "en", unit = "") => api.fmtBubble({ type, v, unit }, lang);
  assert.equal(f("temperature", 24.36), "24.4°");
  assert.equal(f("temperature", 24.36, "es"), "24,4°");
  assert.equal(f("moisture", 12.6), "13%");
  assert.equal(f("illuminance", 12500), "13k");
  assert.equal(f("illuminance", 1500), "1.5k");
  assert.equal(f("conductivity", 850), "850");
  assert.equal(f("other", 6.54, "en", "pH"), "6.5pH");
  assert.equal(f("other", 6.54, "en", "units"), "6.5");
});

test("a device's sensors become bubbles, in a fixed order", () => {
  const card = mount(api, { entity: E, device_id: "flora", max_bubbles: 8 }, hass());
  assert.deepEqual(ids(card), ["sensor.flora_moisture", "sensor.flora_temperature", "sensor.flora_illuminance", "sensor.flora_conductivity", "sensor.flora_battery"]);
});

test("diagnostic sensors are skipped except battery, unless listed explicitly", () => {
  const card = mount(api, { entity: E, device_id: "flora", sensors: ["sensor.flora_rssi"], max_bubbles: 8 }, hass());
  assert.ok(ids(card).includes("sensor.flora_rssi"));
  assert.ok(ids(card).includes("sensor.flora_battery"));
  assert.ok(!ids(card).includes("sensor.flora_hidden"));
  assert.ok(!ids(card).includes("sensor.flora_offline"), "non-numeric states are skipped");
});

test("bubbles are capped, and can be turned off", () => {
  assert.equal(ids(mount(api, { entity: E, device_id: "flora" }, hass())).length, 4);
  assert.equal(ids(mount(api, { entity: E, device_id: "flora", max_bubbles: 2 }, hass())).length, 2);
  assert.equal(ids(mount(api, { entity: E, device_id: "flora", show_bubbles: false }, hass())).length, 0);
});

test("a plant entity brings its device's sensors", () => {
  const card = mount(api, { entity: E, plant_entity: "plant.monstera" }, hass({ "plant.monstera": S("ok") }));
  assert.equal(ids(card)[0], "sensor.flora_moisture");
});

test("the attributes of a core plant entity become bubbles", () => {
  const plant = S("problem", { moisture: 40, temperature: 21, brightness: 800, battery: 90, conductivity: "unknown" });
  const card = mount(api, { entity: E, plant_entity: "plant.ficus", max_bubbles: 8 }, makeHass({ [E]: ago(1), "plant.ficus": plant }));
  assert.deepEqual(card._compute().sensors.map((b) => b.type), ["moisture", "temperature", "illuminance", "battery"]);
});

test("sensor chips sit in the top row in order, out-of-range ones in red", () => {
  const card = mount(api, { entity: E, device_id: "flora" }, hass());
  const html = card._el.bubbles.innerHTML;
  const order = [...html.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["sensor.flora_moisture", "sensor.flora_temperature", "sensor.flora_illuminance", "sensor.flora_conductivity"]);
  assert.match(html, /class="bubble warn" style="--c:var\(--error-color[^"]*" data-id="sensor\.flora_moisture"/, "12 % soil moisture is too dry");
  assert.equal((html.match(/warn/g) || []).length, 1);
  assert.match(html, /<span>24.4°<\/span>/);
  assert.ok(card._el.card.classList.contains("has-sensors"), "the plant moves down to make room");
  assert.match(card._el.card.title, /sensor\.flora_moisture: 12%\n/, "every reading in the tooltip, even chips that don't fit");
  const none = mount(api, { entity: E }, hass());
  assert.ok(!none._el.card.classList.contains("has-sensors"));
});

test("Fahrenheit temperatures aren't judged against Celsius limits", () => {
  const card = mount(api, { entity: E, sensors: ["sensor.f"] }, makeHass({ [E]: ago(1), "sensor.f": S(95, { device_class: "temperature", unit_of_measurement: "°F" }) }));
  assert.doesNotMatch(card._el.bubbles.innerHTML, /warn/);
});

test("tapping a bubble opens that sensor", () => {
  const local = load();
  const card = mount(local, { entity: E, device_id: "flora" }, hass());
  const bubbles = card.shadowRoot.querySelector(".bubbles");
  bubbles.fire("click", { target: { closest: () => ({ dataset: { id: "sensor.flora_moisture" } }) } });
  const ev = local.events.at(-1);
  assert.equal(ev.type, "hass-more-info");
  assert.equal(ev.detail.entityId, "sensor.flora_moisture");
  assert.ok(card._el.confirm.hidden !== false, "doesn't trigger the watering question");
});

test("a plant temperature sensor drives the heat adjustment when there's no weather", () => {
  const hot = { "sensor.flora_temperature": S(31, { device_class: "temperature", unit_of_measurement: "°C" }) };
  const card = mount(api, { entity: E, species: "generic", device_id: "flora" }, hass(hot));
  assert.equal(card._compute().temp, 31);
  assert.equal(card._compute().interval, 5.25);
});
