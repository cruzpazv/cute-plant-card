/**
 * Loads dist/cute-plant-card.js into a sandbox with just enough of a
 * browser (HTMLElement, shadow root, localStorage, fetch) to drive the card
 * from node:test, and hands back its internals.
 */
import { readFileSync } from "node:fs";

export const ROOT = new URL("../", import.meta.url);
export const SRC = readFileSync(new URL("dist/cute-plant-card.js", ROOT), "utf8");
export const DAY = 864e5;
export const ago = (days) => new Date(Date.now() - days * DAY).toISOString();
export const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

const EXPOSE = [
  "plantSVG", "palette", "resolveKind", "perenualInterval", "perenualLight", "sensorType", "fmtBubble",
  "toHex", "T", "SPECIES", "BUBBLE", "ICON", "CAN", "SCHEMA", "DEFAULTS", "VERSION", "TAG", "CutePlantCard", "CutePlantCardEditor",
];

export class FakeEl {
  constructor() {
    Object.assign(this, { innerHTML: "", textContent: "", hidden: undefined, className: "", title: "", attrs: {}, listeners: {}, dataset: {}, offsetWidth: 1 });
    const set = new Set();
    this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)) };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  appendChild(child) { (this.children ||= []).push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, ev = {}) {
    for (const fn of this.listeners[type] || []) fn({ button: 0, stopPropagation() {}, preventDefault() {}, ...ev });
  }
}

/** A fresh copy of the card module. */
export function load({ fetch, storage = new Map(), language = "en" } = {}) {
  const events = [];
  class HTMLElement {
    attachShadow() {
      const els = {}, cols = [new FakeEl(), new FakeEl()];
      this.shadowRoot = { innerHTML: "", querySelector: (s) => (els[s] ||= new FakeEl()), querySelectorAll: () => cols };
      return this.shadowRoot;
    }
    dispatchEvent(e) { events.push(e); return true; }
    appendChild(child) { (this.children ||= []).push(child); return child; }
  }
  const defined = {};
  const env = {
    HTMLElement,
    customElements: { get: (t) => defined[t], define: (t, c) => { defined[t] = c; } },
    window: { customCards: [] },
    document: { querySelector: () => null, createElement: (tag) => Object.assign(new FakeEl(), { tagName: tag }) },
    navigator: { language },
    CustomEvent: class { constructor(type, o = {}) { this.type = type; this.detail = o.detail; } },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
    fetch: fetch || (async () => { throw new Error("no network in tests"); }),
    setTimeout: (f, ms) => { const t = setTimeout(f, ms); t?.unref?.(); return t; },
    setInterval: (f, ms) => { const t = setInterval(f, ms); t?.unref?.(); return t; },
    console: { info() {}, log: console.log, warn: console.warn, error: console.error },
  };
  const api = new Function(...Object.keys(env), `${SRC}\nreturn { ${EXPOSE.join(", ")} };`)(...Object.values(env));
  return { ...api, events, storage, defined, window: env.window };
}

/** A hass object. States may be given as plain values or as {state, attributes}. */
export function makeHass(states = {}, { entities = {}, language = "en" } = {}) {
  const calls = [];
  const norm = (v) => (v && typeof v === "object" && "state" in v
    ? { attributes: {}, last_changed: new Date().toISOString(), ...v, state: String(v.state) }
    : { state: String(v), attributes: {}, last_changed: new Date().toISOString() });
  return {
    states: Object.fromEntries(Object.entries(states).map(([id, v]) => [id, norm(v)])),
    entities, locale: { language }, calls,
    callService: async (...args) => { calls.push(args); },
  };
}

export function mount(api, config, hass) {
  const card = new api.CutePlantCard();
  card.setConfig(config);
  card.hass = hass;
  return card;
}

/** null when the markup is well-formed XML with no repeated attributes, else what's wrong. */
export function xmlProblem(markup) {
  const stack = [], re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let m, last = 0;
  while ((m = re.exec(markup))) {
    if (markup.slice(last, m.index).includes("<")) return `unparsable tag near "${markup.slice(last, last + 60)}"`;
    last = re.lastIndex;
    const [, close, tag, attrs, self] = m;
    const names = [...attrs.matchAll(/([\w:-]+)="/g)].map((a) => a[1]);
    if (new Set(names).size !== names.length) return `repeated attribute in <${tag}${attrs}>`;
    if (close) { if (stack.pop() !== tag) return `mismatched </${tag}>`; }
    else if (!self) stack.push(tag);
  }
  if (markup.slice(last).includes("<")) return "unparsable tail";
  return stack.length ? `unclosed <${stack.join("> <")}>` : null;
}
