// Minimal TrueType embedding for pdf-lib (Type0 / Identity-H), so invoices can print the ₹ sign
// without the fontkit dependency. Fonts are pre-subset at build time to Latin + ₹.
import {
  PDFHexString, PDFString, beginText, endText, setFontAndSize, setTextMatrix, showText,
  pushGraphicsState, popGraphicsState, setFillingColor,
} from 'pdf-lib';

function parseTTF(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = dv.getUint16(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const o = 12 + 16 * i;
    const tag = String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
    tables[tag] = { offset: dv.getUint32(o + 8), length: dv.getUint32(o + 12) };
  }
  const head = tables.head.offset;
  const unitsPerEm = dv.getUint16(head + 18);
  const bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];
  const hhea = tables.hhea.offset;
  const ascent = dv.getInt16(hhea + 4);
  const descent = dv.getInt16(hhea + 6);
  const numberOfHMetrics = dv.getUint16(hhea + 34);
  const numGlyphs = dv.getUint16(tables.maxp.offset + 4);
  let capHeight = ascent;
  if (tables['OS/2']) {
    const os2 = tables['OS/2'].offset;
    if (dv.getUint16(os2) >= 2) capHeight = dv.getInt16(os2 + 88);
  }
  const hmtx = tables.hmtx.offset;
  const advances = new Array(numGlyphs);
  let last = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numberOfHMetrics) last = dv.getUint16(hmtx + 4 * g);
    advances[g] = last;
  }
  // cmap format 4 (Unicode BMP)
  const cmap = tables.cmap.offset;
  const nSub = dv.getUint16(cmap + 2);
  let sub = -1;
  for (let i = 0; i < nSub; i++) {
    const pid = dv.getUint16(cmap + 4 + 8 * i);
    const eid = dv.getUint16(cmap + 6 + 8 * i);
    const off = dv.getUint32(cmap + 8 + 8 * i);
    if (dv.getUint16(cmap + off) === 4 && ((pid === 3 && eid === 1) || pid === 0)) {
      sub = cmap + off;
      if (pid === 3) break;
    }
  }
  if (sub < 0) throw new Error('Font has no Unicode cmap');
  const map = new Map();
  const segX2 = dv.getUint16(sub + 6);
  const endOff = sub + 14;
  const startOff = endOff + segX2 + 2;
  const deltaOff = startOff + segX2;
  const rangeOff = deltaOff + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = dv.getUint16(endOff + 2 * s);
    const start = dv.getUint16(startOff + 2 * s);
    const delta = dv.getInt16(deltaOff + 2 * s);
    const ro = dv.getUint16(rangeOff + 2 * s);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g;
      if (ro === 0) g = (c + delta) & 0xffff;
      else {
        g = dv.getUint16(rangeOff + 2 * s + ro + 2 * (c - start));
        if (g !== 0) g = (g + delta) & 0xffff;
      }
      if (g) map.set(c, g);
    }
  }
  return { unitsPerEm, bbox, ascent, descent, capHeight, numGlyphs, advances, map };
}

const hex4 = (n) => n.toString(16).padStart(4, '0').toUpperCase();

export class PdfFont {
  constructor(doc, bytes, name) {
    this.doc = doc;
    this.name = name;
    this.f = parseTTF(bytes);
    this.pageKeys = new WeakMap();
    const f = this.f;
    const ctx = doc.context;
    const scale = 1000 / f.unitsPerEm;
    this.fallback = f.map.get(0x3f) || 0;
    const fontFile = ctx.register(ctx.flateStream(bytes, { Length1: bytes.length }));
    const descriptor = ctx.register(ctx.obj({
      Type: 'FontDescriptor', FontName: name, Flags: 32,
      FontBBox: f.bbox.map((v) => Math.round(v * scale)), ItalicAngle: 0,
      Ascent: Math.round(f.ascent * scale), Descent: Math.round(f.descent * scale),
      CapHeight: Math.round(f.capHeight * scale), StemV: 80, FontFile2: fontFile,
    }));
    const widths = f.advances.map((a) => Math.round(a * scale));
    const cidFont = ctx.register(ctx.obj({
      Type: 'Font', Subtype: 'CIDFontType2', BaseFont: name,
      CIDSystemInfo: { Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 },
      FontDescriptor: descriptor, W: [0, widths], CIDToGIDMap: 'Identity',
    }));
    const pairs = [...f.map.entries()].map(([cp, g]) => `<${hex4(g)}> <${hex4(cp)}>`);
    const chunks = [];
    for (let i = 0; i < pairs.length; i += 100) {
      const part = pairs.slice(i, i + 100);
      chunks.push(`${part.length} beginbfchar\n${part.join('\n')}\nendbfchar`);
    }
    const cmapText = [
      '/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
      '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
      '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def',
      '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange',
      ...chunks, 'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end',
    ].join('\n');
    const toUnicode = ctx.register(ctx.flateStream(new TextEncoder().encode(cmapText)));
    this.ref = ctx.register(ctx.obj({
      Type: 'Font', Subtype: 'Type0', BaseFont: name, Encoding: 'Identity-H',
      DescendantFonts: [cidFont], ToUnicode: toUnicode,
    }));
  }

  glyphs(text) {
    const out = [];
    for (const ch of String(text ?? '')) {
      const cp = ch.codePointAt(0);
      if (cp === 0x0a || cp === 0x0d) continue;
      out.push(this.f.map.get(cp === 0x09 ? 0x20 : cp) || this.fallback);
    }
    return out;
  }

  width(text, size) {
    const f = this.f;
    let w = 0;
    for (const g of this.glyphs(text)) w += f.advances[g] || 0;
    return (w / f.unitsPerEm) * size;
  }

  key(page) {
    let k = this.pageKeys.get(page);
    if (!k) {
      k = page.node.newFontDictionary(this.name, this.ref);
      this.pageKeys.set(page, k);
    }
    return k;
  }

  // Draw text with its baseline at (x, y) in PDF coordinates.
  draw(page, text, x, y, size, color) {
    const gids = this.glyphs(text);
    if (!gids.length) return;
    const hex = gids.map(hex4).join('');
    page.pushOperators(
      pushGraphicsState(),
      setFillingColor(color),
      beginText(),
      setFontAndSize(this.key(page), size),
      setTextMatrix(1, 0, 0, 1, x, y),
      showText(PDFHexString.of(hex)),
      endText(),
      popGraphicsState(),
    );
  }

  // Greedy word wrap to a maximum width; long words are broken by character.
  wrap(text, size, maxWidth) {
    const lines = [];
    for (const para of String(text ?? '').split(/\r?\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) {
        lines.push('');
        continue;
      }
      let line = '';
      for (let w of words) {
        while (this.width(w, size) > maxWidth && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && this.width(w.slice(0, cut), size) > maxWidth) cut--;
          if (line) {
            lines.push(line);
            line = '';
          }
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const test = line ? line + ' ' + w : w;
        if (this.width(test, size) <= maxWidth) line = test;
        else {
          if (line) lines.push(line);
          line = w;
        }
      }
      if (line) lines.push(line);
    }
    return lines;
  }
}
