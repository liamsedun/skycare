// Build the SkyCare favicon set from the logo PNG:
//  - public/favicon.ico            (16/32/48 PNG-encoded ICO container)
//  - public/favicon.svg            (rounded dark tile, base64-embedded 192px logo)
//  - public/favicon-16/32.png
//  - public/icons/icon-192.png, icon-512.png, apple-touch-icon.png (180)
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SRC = "public/images/skyhouse-tech-logo.png";

(async () => {
  fs.mkdirSync("public/icons", { recursive: true });

  const jobs = [
    [16, "public/favicon-16.png"],
    [32, "public/favicon-32.png"],
    [180, "public/icons/apple-touch-icon.png"],
    [192, "public/icons/icon-192.png"],
    [512, "public/icons/icon-512.png"],
  ];
  for (const [size, out] of jobs) {
    await sharp(SRC).resize(size, size).png().toFile(out);
    console.log("wrote", out, size + "x" + size);
  }

  // --- favicon.ico: ICO header + PNG-encoded entries (modern ICOs embed PNG) ---
  const pngs = [];
  for (const s of [16, 32, 48]) {
    pngs.push(await sharp(SRC).resize(s, s).png().toBuffer());
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  pngs.forEach((buf, i) => {
    const s = [16, 32, 48][i];
    const e = Buffer.alloc(16);
    e.writeUInt8(s, 0);
    e.writeUInt8(s, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  });
  fs.writeFileSync("public/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));
  console.log("wrote public/favicon.ico");

  // --- favicon.svg: rounded #0b0b0f tile with the base64 192px logo ---
  const b64 = (await sharp(SRC).resize(192, 192).png().toBuffer()).toString("base64");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<defs><clipPath id="c"><rect width="64" height="64" rx="14"/></clipPath></defs>' +
    '<g clip-path="url(#c)">' +
    '<rect width="64" height="64" fill="#0b0b0f"/>' +
    '<image href="data:image/png;base64,' + b64 + '" width="64" height="64" preserveAspectRatio="xMidYMid slice"/>' +
    "</g></svg>";
  fs.writeFileSync("public/favicon.svg", svg);
  console.log("wrote public/favicon.svg", Math.round(svg.length / 1024) + "KB");
})();
