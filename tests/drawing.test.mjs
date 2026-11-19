import { test } from "node:test";
import assert from "node:assert/strict";
import { load, xmlProblem } from "./helpers.mjs";

const api = load();
const KINDS = Object.keys(api.SPECIES);
const MOODS = ["happy", "ok", "tired", "sad", "heat", "rain", "sleep"];
const D = [0, 0.2, 0.4, 0.5, 0.6, 0.75, 0.9, 1];
const draw = (kind, d, mood, extra = {}) => api.plantSVG({ kind, d, mood, col: api.palette(kind, d), ...extra });

test("every plant type draws well-formed SVG in every state", () => {
  for (const kind of KINDS)
    for (const d of D)
      for (const mood of MOODS) {
        const svg = draw(kind, d, mood, { wet: d === 0, rain: mood === "rain" });
        assert.equal(xmlProblem(svg), null, `${kind} d=${d} ${mood}`);
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${kind} d=${d} ${mood}`);
      }
});

test("static icons and the watering can are well-formed", () => {
  for (const [name, svg] of Object.entries(api.ICON)) assert.equal(xmlProblem(svg), null, name);
  for (const [name, b] of Object.entries(api.BUBBLE)) assert.equal(xmlProblem(b.icon), null, name);
  assert.equal(xmlProblem(api.CAN), null);
});

test("a wilted plant has lost leaves, and they lie on the ground", () => {
  // count what grows above the soil, not what lies on the ground
  const leaves = (svg) => (svg.slice(svg.indexOf('cy="59.6"')).match(/<g transform="translate\(/g) || []).length;
  for (const kind of ["generic", "monstera", "palm", "herb", "fern"]) {
    const fresh = draw(kind, 0, "happy"), wilted = draw(kind, 1, "sad");
    assert.ok(leaves(wilted) < leaves(fresh), kind);
    assert.ok(!fresh.includes("#c39a5e") && wilted.includes("#c39a5e"), `${kind}: dry leaves on the ground`);
  }
});

test("the flower loses petals as it wilts", () => {
  const petals = (d) => (draw("flower", d, "ok").match(/ry="4.8"/g) || []).length;
  assert.equal(petals(0), 6);
  assert.ok(petals(1) < petals(0.5) && petals(0.5) < petals(0));
});

test("each mood has its own face and extras", () => {
  assert.match(draw("generic", 0, "happy"), /class="twinkle"/, "sparkles right after watering");
  assert.doesNotMatch(draw("generic", 0.5, "happy"), /class="twinkle"/, "no sparkles later on");
  assert.match(draw("generic", 1, "sad"), /class="tear"/);
  assert.match(draw("generic", 0.8, "tired"), /class="sweat"/);
  assert.match(draw("generic", 0.6, "ok"), /class="falling"/, "a leaf falls while it dries out");
  assert.match(draw("generic", 0, "rain", { rain: true }), /class="drop"/);
  assert.match(draw("generic", 0.2, "sleep"), /class="zz"/);
  const heat = draw("generic", 1, "heat");
  assert.match(heat, /class="spin"/, "blazing sun");
  assert.match(heat, /l3.4,3.4/, "✕ ✕ eyes");
  assert.match(heat, /rx="1.9" ry="2.3"/, "O mouth");
  assert.doesNotMatch(heat, /class="tear"/);
});

test("the cactus doesn't drop leaves and keeps its flower only while healthy", () => {
  assert.match(draw("cactus", 0, "happy"), /#ffd25e/);
  assert.doesNotMatch(draw("cactus", 1, "sad"), /#ffd25e/);
  assert.doesNotMatch(draw("cactus", 1, "sad"), /#c39a5e/);
});

test("colours fade from the species green to brown", () => {
  for (const kind of KINDS) {
    assert.equal(api.palette(kind, 0).leaf, api.SPECIES[kind].green, kind);
    assert.equal(api.palette(kind, 1).leaf, "#b48a55", kind);
  }
  const mid = api.palette("generic", 0.6).leaf;
  assert.notEqual(mid, api.SPECIES.generic.green);
  assert.notEqual(mid, "#b48a55");
});

test("leaf, pot and flower colours can be overridden as hex or rgb", () => {
  const p = api.palette("flower", 0, { leaf_color: "#123456", pot_color: [10, 20, 30], flower_color: "abc" });
  assert.equal(p.leaf, "#123456");
  assert.equal(p.pot, "#0a141e");
  assert.equal(p.flower, "#aabbcc");
  assert.equal(api.toHex("nope"), null);
  assert.equal(api.toHex([1, 2]), null);
});
