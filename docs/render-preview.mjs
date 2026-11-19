#!/usr/bin/env node
/**
 * Draws every plant type in every state into images/preview-{light,dark}.svg,
 * then rasterises them with rsvg-convert when it is installed.
 *
 *   node docs/render-preview.mjs
 *
 * Only the pure drawing half of the card is evaluated (everything above the
 * "card element" marker), so no browser is needed.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "dist/cute-plant-card.js"), "utf8");
const pure = src.slice(0, src.indexOf("/* ── card element ──"));
const { plantSVG, palette, SPECIES } = new Function(`${pure}; return { plantSVG, palette, SPECIES };`)();

const STATES = [
  { label: "just watered", d: 0, mood: "happy", wet: true },
  { label: "2 days on", d: 0.25, mood: "happy" },
  { label: "halfway", d: 0.5, mood: "ok" },
  { label: "1 day left", d: 0.75, mood: "tired" },
  { label: "water me!", d: 1, mood: "sad" },
  { label: "raining", d: 0, mood: "rain", rain: true },
  { label: "no data", d: 0.2, mood: "sleep" },
  { label: "scorched", d: 1, mood: "heat" },
];
const only = process.argv.slice(2);
const KINDS = Object.keys(SPECIES).filter((k) => !only.length || only.includes(k));
const CELL = 112, PAD = 8, HEAD = 22, SIDE = 80;

for (const theme of ["light", "dark"]) {
  const bg = theme === "light" ? "#f2f2f4" : "#111317";
  const card = theme === "light" ? "#ffffff" : "#1c1d21";
  const ink = theme === "light" ? "#333" : "#ddd";
  const W = SIDE + STATES.length * (CELL + PAD), H = HEAD + KINDS.length * (CELL + PAD);
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">
<style>.cut{stroke:${card};stroke-width:1.7;stroke-linecap:round}</style>
<rect width="${W}" height="${H}" fill="${bg}"/>`;
  STATES.forEach((s, i) => {
    out += `<text x="${SIDE + i * (CELL + PAD) + CELL / 2}" y="15" font-size="12" text-anchor="middle" fill="${ink}">${s.label}</text>`;
  });
  KINDS.forEach((kind, j) => {
    const y = HEAD + j * (CELL + PAD);
    out += `<text x="6" y="${y + CELL / 2 + 4}" font-size="12" fill="${ink}">${kind}</text>`;
    STATES.forEach((s, i) => {
      const x = SIDE + i * (CELL + PAD);
      out += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="12" fill="${card}"/>`;
      out += `<svg x="${x + 6}" y="${y + 6}" width="${CELL - 12}" height="${CELL - 12}" viewBox="0 0 100 100" overflow="visible">${plantSVG({ kind, ...s, col: palette(kind, s.d) })}</svg>`;
    });
  });
  out += "</svg>";
  mkdirSync(join(root, "images"), { recursive: true });
  const svgPath = join(root, `images/preview-${theme}.svg`);
  writeFileSync(svgPath, out);
  try {
    execFileSync("rsvg-convert", ["-z", "1.5", "-o", svgPath.replace(/\.svg$/, ".png"), svgPath]);
    console.log("wrote", svgPath.replace(/\.svg$/, ".png"));
  } catch {
    console.log("wrote", svgPath, "(install rsvg-convert for PNG)");
  }
}
