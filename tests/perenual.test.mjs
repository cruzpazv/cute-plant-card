import { test } from "node:test";
import assert from "node:assert/strict";
import { load, makeHass, mount, ago, flush } from "./helpers.mjs";

const E = "input_button.regar";
const DETAILS = {
  common_name: "Swiss cheese plant", scientific_name: ["Monstera deliciosa"], watering: "Average",
  watering_general_benchmark: { value: '"5-7"', unit: "days" }, sunlight: ["part shade", "full shade"],
};

function fakeFetch(handler) {
  const urls = [];
  const fn = async (url) => {
    urls.push(url);
    const [status, body] = handler(url);
    return { ok: status === 200, status, json: async () => body };
  };
  fn.urls = urls;
  return fn;
}

test("watering interval from the benchmark, or from the watering level", () => {
  const { perenualInterval: i } = load();
  assert.equal(i({ watering_general_benchmark: { value: "7-10", unit: "days" } }), 9);
  assert.equal(i({ watering_general_benchmark: { value: '"5-7"', unit: "days" } }), 6);
  assert.equal(i({ watering_general_benchmark: { value: '"2"', unit: "week" } }), 14);
  assert.equal(i({ watering_general_benchmark: { value: "Upgrade Plans To Premium" }, watering: "Frequent" }), 3);
  assert.equal(i({ watering: "Minimum" }), 14);
  assert.equal(i({}), null);
});

test("light needs from the sunlight list", () => {
  const { perenualLight: l } = load();
  assert.deepEqual(l(["full sun"]), { min: 3, max: 3 });
  assert.deepEqual(l(["part shade", "full shade"]), { min: 1, max: 2 });
  assert.deepEqual(l(["Full sun", "part sun/part shade"]), { min: 2, max: 3 });
  assert.equal(l(["Upgrade Plans To Premium"]), null);
  assert.equal(l([]), null);
});

test("search, details, then the species drives interval, light and drawing", async () => {
  const fetch = fakeFetch((url) => (url.includes("species-list") ? [200, { data: [{ id: 1234 }] }] : [200, DETAILS]));
  const api = load({ fetch });
  const card = mount(api, { entity: E, name: "Salón", perenual_api_key: "k&y", perenual_query: "costilla" }, makeHass({ [E]: ago(1) }));
  await flush();
  assert.equal(fetch.urls.length, 2);
  assert.match(fetch.urls[0], /\/api\/v2\/species-list\?key=k%26y&q=costilla$/);
  assert.match(fetch.urls[1], /\/api\/v2\/species\/details\/1234\?key=k%26y$/);
  const r = card._compute();
  assert.equal(r.kind, "monstera", "guessed from the Perenual name");
  assert.equal(r.interval, 6);
  assert.deepEqual(r.light, { min: 1, max: 2 });
  assert.match(card._el.card.title, /Perenual: Swiss cheese plant · Monstera deliciosa/);
});

test("a species id skips the search", async () => {
  const fetch = fakeFetch(() => [200, DETAILS]);
  mount(load({ fetch }), { entity: E, perenual_api_key: "k", perenual_id: 1234 }, makeHass({ [E]: ago(1) }));
  await flush();
  assert.equal(fetch.urls.length, 1);
  assert.match(fetch.urls[0], /details\/1234/);
});

test("results are cached for 30 days, so a dashboard full of plants saves quota", async () => {
  const fetch = fakeFetch((url) => (url.includes("species-list") ? [200, { data: [{ id: 1 }] }] : [200, DETAILS]));
  const storage = new Map();
  mount(load({ fetch, storage }), { entity: E, perenual_api_key: "k", perenual_query: "Monstera " }, makeHass({ [E]: ago(1) }));
  await flush();
  const card = mount(load({ fetch, storage }), { entity: E, perenual_api_key: "k", perenual_query: "monstera" }, makeHass({ [E]: ago(1) }));
  await flush();
  assert.equal(fetch.urls.length, 2, "second card read the cache");
  assert.equal(card._compute().interval, 6);
  const [key, raw] = [...storage][0];
  assert.equal(key, "cute-plant-card:perenual:monstera");
  storage.set(key, JSON.stringify({ ...JSON.parse(raw), at: Date.now() - 31 * 864e5 }));
  mount(load({ fetch, storage }), { entity: E, perenual_api_key: "k", perenual_query: "monstera" }, makeHass({ [E]: ago(1) }));
  await flush();
  assert.equal(fetch.urls.length, 4, "stale cache is refreshed");
});

test("errors fall back to the plant type and are retried the next day", async () => {
  const fetch = fakeFetch(() => [404, { message: "Missing/Issue with API Key" }]);
  const storage = new Map();
  const card = mount(load({ fetch, storage }), { entity: E, species: "cactus", perenual_api_key: "bad", perenual_query: "x" }, makeHass({ [E]: ago(1) }));
  await flush();
  assert.equal(card._compute().interval, 21);
  assert.match(card._el.card.title, /Perenual: no data \(Missing\/Issue with API Key\)/);
  const { at } = JSON.parse(storage.get("cute-plant-card:perenual:x"));
  const left = 30 * 864e5 - (Date.now() - at);
  assert.ok(left > 0 && left <= 864e5, "expires within a day");
});

test("species not found is an error too", async () => {
  const fetch = fakeFetch(() => [200, { data: [] }]);
  const card = mount(load({ fetch }), { entity: E, perenual_api_key: "k", perenual_query: "zzz" }, makeHass({ [E]: ago(1) }));
  await flush();
  assert.equal(card._pe.error, "species not found");
});

test("no key, no request", async () => {
  const fetch = fakeFetch(() => [200, DETAILS]);
  mount(load({ fetch }), { entity: E, perenual_query: "monstera" }, makeHass({ [E]: ago(1) }));
  await flush();
  assert.equal(fetch.urls.length, 0);
});
