#!/usr/bin/env node
/**
 * Draws the brand assets with the card's own plant renderer:
 *   brand/icon.svg (+ .png)        square icon
 *   brand/logo.svg                 icon + name
 *   images/logo-{light,dark}.png   README header
 *   images/social.png              GitHub social preview, 1280 × 640
 *
 *   node docs/render-brand.mjs      (PNGs need rsvg-convert and the Comfortaa font)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "dist/cute-plant-card.js"), "utf8");
const pure = src.slice(0, src.indexOf("/* ── card element ──"));
const { plantSVG, palette } = new Function(`${pure}; return { plantSVG, palette };`)();

const MINT = "#e3f4e6", INK = "#2f4a36", FONT = `font-family="Comfortaa, 'Varela Round', Nunito, system-ui, sans-serif"`;
const plant = (kind, d, mood, x, y, size) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 100 100" overflow="visible">${plantSVG({ kind, d, mood, col: palette(kind, d) })}</svg>`;
const doc = (w, h, body, bg = MINT) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Cute Plant Card">\n<style>.cut{stroke:${bg};stroke-width:1.7;stroke-linecap:round}</style>\n${body}\n</svg>\n`;

const iconBody = `<rect width="240" height="240" rx="52" fill="${MINT}"/>${plant("monstera", 0, "happy", 18, 14, 204)}`;
const logo = (text) => doc(860, 240, `${iconBody}<text x="272" y="142" ${FONT} font-size="66" font-weight="700" fill="${text}">Cute Plant Card</text>`);

const social = doc(1280, 640, `<rect width="1280" height="640" fill="${MINT}"/>
<text x="640" y="130" text-anchor="middle" ${FONT} font-size="86" font-weight="700" fill="${INK}">Cute Plant Card</text>
<text x="640" y="196" text-anchor="middle" ${FONT} font-size="30" fill="#557a5e">A plant with feelings for your Home Assistant dashboard</text>
${[["happy", 0, 340], ["tired", 0.75, 640], ["sad", 1, 940]].map(([mood, d, cx]) =>
  `<rect x="${cx - 135}" y="262" width="270" height="290" rx="34" fill="#fff"/>${plant("monstera", d, mood, cx - 120, 280, 240)}`).join("\n")}
<text x="340" y="600" text-anchor="middle" ${FONT} font-size="24" fill="#557a5e">just watered</text>
<text x="640" y="600" text-anchor="middle" ${FONT} font-size="24" fill="#557a5e">getting thirsty</text>
<text x="940" y="600" text-anchor="middle" ${FONT} font-size="24" fill="#557a5e">water me!</text>`, "#ffffff");

const out = {
  "brand/icon.svg": doc(240, 240, iconBody),
  "brand/logo.svg": logo(INK),
  "images/.logo-light.svg": logo(INK),
  "images/.logo-dark.svg": logo("#e8f2ea"),
  "images/.social.svg": social,
};
for (const [p, svg] of Object.entries(out)) {
  mkdirSync(dirname(join(root, p)), { recursive: true });
  writeFileSync(join(root, p), svg);
}
const png = (from, to, width) => {
  try {
    execFileSync("rsvg-convert", ["-w", String(width), "-o", join(root, to), join(root, from)]);
    console.log("wrote", to);
  } catch {
    console.log("skipped", to, "(rsvg-convert missing)");
  }
};
png("brand/icon.svg", "brand/icon.png", 256);
png("images/.logo-light.svg", "images/logo-light.png", 860);
png("images/.logo-dark.svg", "images/logo-dark.png", 860);
png("images/.social.svg", "images/social.png", 1280);
