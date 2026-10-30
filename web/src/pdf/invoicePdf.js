// A4 invoice PDF in the same layout as the myBillBook-style sample: boxed header, bill-to / ship-to,
// item grid that fills the page, totals, HSN-wise tax summary, amount in words and terms.
import { PDFDocument, rgb } from 'pdf-lib';
import { PdfFont } from './ttf.js';
import { regularFont, boldFont } from './fonts.js';

const W = 595.28;
const H = 841.89;
const L = 30;
const R = W - 30;
const TW = R - L;
const LINE = 0.6;

const hexRgb = (hex) => {
  const h = hex.replace('#', '');
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
};

function dataUrlBytes(url) {
  const m = /^data:([^;]+);base64,(.*)$/.exec(url || '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

export async function renderInvoicePdf(model) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${model.title} ${model.meta[0]?.value || ''}`.trim());
  doc.setAuthor(model.business.name);
  doc.setCreator('Hisaab Billing');
  doc.setProducer('Hisaab Billing');
  const reg = new PdfFont(doc, regularFont, 'Carlito');
  const bold = new PdfFont(doc, boldFont, 'Carlito-Bold');
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.42, 0.42, 0.42);
  const border = rgb(0.15, 0.15, 0.15);
  const fill = hexRgb(model.theme.fill);
  const accent = hexRgb(model.theme.accent);

  let logo = null;
  const logoData = dataUrlBytes(model.business.logo);
  if (logoData) {
    try {
      logo = /png/i.test(logoData.mime) ? await doc.embedPng(logoData.bytes) : await doc.embedJpg(logoData.bytes);
    } catch {
      logo = null;
    }
  }

  // Drawing helpers in top-down coordinates.
  let page;
  const text = (font, str, x, y, size, color = ink, align = 'left') => {
    const s = String(str ?? '');
    if (!s) return;
    let tx = x;
    if (align === 'right') tx = x - font.width(s, size);
    else if (align === 'center') tx = x - font.width(s, size) / 2;
    font.draw(page, s, tx, H - y, size, color);
  };
  const hline = (x1, x2, y, color = border, t = LINE) => page.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness: t, color });
  const vline = (x, y1, y2, color = border, t = LINE) => page.drawLine({ start: { x, y: H - y1 }, end: { x, y: H - y2 }, thickness: t, color });
  const box = (x, y, w, h, opts = {}) => page.drawRectangle({
    x, y: H - y - h, width: w, height: h,
    color: opts.fill, borderColor: opts.noBorder ? undefined : (opts.border || border), borderWidth: opts.noBorder ? 0 : LINE,
  });

  // ---- Columns of the item grid
  const colDefs = [
    { key: 'sno', label: 'S.NO.', w: 52, align: 'center' },
    { key: 'name', label: 'ITEMS', w: 141, align: 'left' },
    { key: 'hsn', label: 'HSN', w: 48, align: 'right' },
    { key: 'qty', label: 'QTY.', w: 52, align: 'right' },
    { key: 'rate', label: 'RATE', w: 76, align: 'right' },
    ...(model.hasDisc ? [{ key: 'disc', label: 'DISC.', w: 44, align: 'right' }] : []),
    { key: 'tax', label: 'TAX', w: 91, align: 'right' },
    { key: 'amount', label: 'AMOUNT', w: 75, align: 'right' },
  ];
  const sumW = colDefs.reduce((s, c) => s + c.w, 0);
  let cx = L;
  const cols = colDefs.map((c) => {
    const w = (c.w / sumW) * TW;
    const col = { ...c, x: cx, w };
    cx += w;
    return col;
  });
  const colByKey = Object.fromEntries(cols.map((c) => [c.key, c]));
  const nameCol = colByKey.name;

  // ---- Measure rows
  const FS = 8.6;
  const LH = 11;
  const rows = model.rows.map((r) => {
    const nameLines = reg.wrap(r.name, FS, nameCol.w - 10);
    const descLines = r.desc ? reg.wrap(r.desc, FS - 1, nameCol.w - 10) : [];
    const qtyLines = reg.wrap(r.qty, FS, colByKey.qty.w - 8);
    const lines = Math.max(nameLines.length + descLines.length, qtyLines.length, 2);
    return { ...r, nameLines, descLines, qtyLines, h: lines * LH + 12 };
  });

  // ---- Header (repeated on every page); returns y where the item rows start.
  const drawHeader = () => {
    let y = 26;
    text(bold, model.title, L, y, 10.5);
    if (model.copyLabel) {
      const tw = bold.width(model.title, 10.5);
      const lw = reg.width(model.copyLabel, 8.6) + 10;
      box(L + tw + 8, y - 10.5, lw, 14, { border: rgb(0.62, 0.62, 0.62) });
      text(reg, model.copyLabel, L + tw + 13, y, 8.6, muted);
    }
    const top = 37;
    const leftW = TW * 0.501;
    // Business block
    const tx = logo ? L + 64 : L + 10;
    const tWidth = L + leftW - tx - 8;
    const nameLines = bold.wrap(model.business.name, 12, tWidth);
    const addrLines = reg.wrap(model.business.address, FS, tWidth);
    let by = top + 16;
    nameLines.forEach((ln) => {
      text(bold, ln, tx, by, 12, accent);
      by += 13;
    });
    addrLines.forEach((ln) => {
      text(reg, ln, tx, by, FS);
      by += LH;
    });
    const b = model.business;
    if (b.gstin || b.phone) {
      const half = tx + Math.min(tWidth / 2 + 10, 110);
      if (b.gstin) text(bold, 'GSTIN:', tx, by, FS);
      if (b.phone) text(bold, 'Mobile:', b.gstin ? half : tx, by, FS);
      by += LH;
      if (b.gstin) text(reg, b.gstin, tx, by, FS);
      if (b.phone) text(reg, b.phone, b.gstin ? half : tx, by, FS);
      by += LH;
    }
    if (b.pan) {
      text(bold, 'PAN Number:', tx, by, FS);
      text(reg, b.pan, tx + bold.width('PAN Number: ', FS), by, FS);
      by += LH;
    }
    if (b.email) {
      text(reg, b.email, tx, by, FS);
      by += LH;
    }
    const headH = Math.max(by - top + 2, 64);
    if (logo) {
      const s = Math.min(48 / logo.width, 48 / logo.height);
      const lw = logo.width * s;
      const lh = logo.height * s;
      page.drawImage(logo, { x: L + 8 + (48 - lw) / 2, y: H - (top + (headH - lh) / 2) - lh, width: lw, height: lh });
    }
    // Meta block
    const metaX = L + leftW;
    const metaW = TW - leftW;
    const n = model.meta.length;
    const perRow = n > 3 ? 2 : n;
    const cellW = metaW / perRow;
    const rowsN = Math.ceil(n / perRow);
    model.meta.forEach((m, i) => {
      const r = Math.floor(i / perRow);
      const c = i % perRow;
      const cxm = metaX + cellW * c + cellW / 2;
      const cy = top + (headH / (rowsN + 1)) * (r + 1) - 4;
      text(bold, m.label, cxm, cy, FS + 0.4, ink, 'center');
      text(reg, m.value, cxm, cy + 12, FS + 0.4, ink, 'center');
    });
    box(L, top, TW, headH);
    vline(metaX, top, top + headH);

    // Bill to / Ship to
    const pTop = top + headH;
    const colW = model.shipTo ? leftW : TW;
    const party = (p, x, w) => {
      let py = pTop + 14;
      text(reg, p.heading, x + 8, py, FS);
      py += 13;
      bold.wrap(p.name, FS + 0.6, w - 16).forEach((ln) => {
        text(bold, ln, x + 8, py, FS + 0.6);
        py += LH + 1;
      });
      if (p.address) {
        const lab = 'Address: ';
        const lw = reg.width(lab, FS);
        text(reg, lab, x + 8, py, FS);
        reg.wrap(p.address, FS, w - 16 - lw).forEach((ln) => {
          text(reg, ln, x + 8 + lw, py, FS);
          py += LH;
        });
      }
      const parts = [];
      if (p.gstin) parts.push(['GSTIN: ', p.gstin]);
      if (p.pos) parts.push(['Place of Supply: ', p.pos]);
      if (parts.length) {
        let px = x + 8;
        parts.forEach(([lab, val]) => {
          text(reg, lab + val, px, py, FS);
          px += reg.width(lab + val, FS) + 12;
        });
        py += LH;
      }
      if (p.pan) {
        text(reg, 'PAN Number:  ' + p.pan, x + 8, py, FS);
        py += LH;
      }
      if (p.phone) {
        text(reg, 'Mobile:  ' + p.phone, x + 8, py, FS);
        py += LH;
      }
      return py;
    };
    const end1 = party(model.billTo, L, colW);
    const end2 = model.shipTo ? party(model.shipTo, L + leftW, TW - leftW) : 0;
    const partyH = Math.max(end1, end2) - pTop + 4;
    box(L, pTop, TW, partyH);
    if (model.shipTo) vline(L + leftW, pTop, pTop + partyH);

    // Grid header
    const gTop = pTop + partyH;
    box(L, gTop, TW, 22, { fill });
    cols.forEach((c, i) => {
      if (i > 0) vline(c.x, gTop, gTop + 22);
      text(bold, c.label, c.x + c.w / 2, gTop + 14.5, FS, ink, 'center');
    });
    return gTop + 22;
  };

  // ---- Footer height (totals, HSN table, words, bank, notes, terms)
  const hsnRowH = 16;
  const hsnH = model.showHsn ? 30 + model.hsn.rows.length * hsnRowH + (model.hsn.total ? hsnRowH : 0) + 8 : 0;
  const bankLines = model.bank.length;
  const bankH = bankLines || model.signature ? Math.max(18 + bankLines * LH, model.signature ? 62 : 0) + 6 : 0;
  const noteLines = model.notes ? reg.wrap(model.notes, FS, TW - 16) : [];
  const termLines = model.terms.flatMap((t, i) => reg.wrap(`${i + 1}. ${t}`, FS, TW - 16));
  const notesH = noteLines.length ? 18 + noteLines.length * LH + 4 : 0;
  const termsH = termLines.length ? 18 + termLines.length * LH + 4 : 0;
  const totalsH = model.summary.length * 18 + 22 + model.settleRows.length * 21;
  const footerH = totalsH + 8 + hsnH + 36 + bankH + notesH + termsH;
  const PAGE_BOTTOM = H - 26;

  // ---- Paginate rows
  const pages = [];
  let i = 0;
  // Header height is the same on every page; measure once on a scratch page.
  page = doc.addPage([W, H]);
  const itemsTop = drawHeader();
  const firstPage = page;
  const lastLimit = PAGE_BOTTOM - footerH;
  const contLimit = PAGE_BOTTOM - 14;
  while (true) {
    const remaining = rows.slice(i);
    const remainingH = remaining.reduce((s, r) => s + r.h, 0);
    if (itemsTop + remainingH <= lastLimit) {
      pages.push({ rows: remaining, last: true });
      break;
    }
    let y = itemsTop;
    const chunk = [];
    while (i < rows.length && y + rows[i].h <= contLimit) {
      y += rows[i].h;
      chunk.push(rows[i]);
      i++;
    }
    if (!chunk.length && i < rows.length) {
      chunk.push(rows[i]);
      i++;
    }
    pages.push({ rows: chunk, last: false });
    if (i >= rows.length) {
      pages.push({ rows: [], last: true });
      break;
    }
  }

  pages.forEach((pg, pi) => {
    if (pi > 0) {
      page = doc.addPage([W, H]);
      drawHeader();
    } else {
      page = firstPage;
    }
    const gridBottom = pg.last ? lastLimit : contLimit;
    let y = itemsTop;
    for (const r of pg.rows) {
      const base = y + 13;
      const cell = (key, str, font = reg, dy = 0, size = FS, color = ink) => {
        const c = colByKey[key];
        if (!c) return;
        const x = c.align === 'right' ? c.x + c.w - 8 : c.align === 'center' ? c.x + c.w / 2 : c.x + 8;
        text(font, str, x, base + dy, size, color, c.align);
      };
      cell('sno', r.sno);
      r.nameLines.forEach((ln, li) => cell('name', ln, reg, li * LH));
      r.descLines.forEach((ln, li) => cell('name', ln, reg, (r.nameLines.length + li) * LH, FS - 1, muted));
      cell('hsn', r.hsn);
      r.qtyLines.forEach((ln, li) => cell('qty', ln, reg, li * LH));
      cell('rate', r.rate);
      if (model.hasDisc) cell('disc', r.disc);
      cell('tax', r.tax);
      cell('tax', r.taxPct, reg, LH - 1, FS - 1.4, muted);
      cell('amount', r.amount);
      y += r.h;
    }
    // Grid body borders, stretched to fill the page like the sample.
    vline(L, itemsTop, gridBottom);
    vline(R, itemsTop, gridBottom);
    cols.forEach((c, ci) => {
      if (ci > 0) vline(c.x, itemsTop, gridBottom);
    });
    if (!pg.last) {
      hline(L, R, gridBottom);
      text(reg, `Continued on page ${pi + 2}`, R, gridBottom + 11, FS - 0.5, muted, 'right');
      return;
    }

    // Totals
    let ty = gridBottom;
    for (const sRow of model.summary) {
      box(L, ty, TW, 18);
      text(bold, sRow.label, colByKey.name.x + colByKey.name.w - 8, ty + 12, FS, ink, 'right');
      text(reg, sRow.value, R - 8, ty + 12, FS, ink, 'right');
      ty += 18;
    }
    box(L, ty, TW, 22, { fill });
    cols.forEach((c, ci) => {
      if (ci > 0) vline(c.x, ty, ty + 22);
    });
    text(bold, 'TOTAL', colByKey.name.x + colByKey.name.w - 8, ty + 14.5, FS, ink, 'right');
    text(bold, model.totals.qty, colByKey.qty.x + colByKey.qty.w - 8, ty + 14.5, FS, ink, 'right');
    text(bold, model.totals.tax, colByKey.tax.x + colByKey.tax.w - 8, ty + 14.5, FS, ink, 'right');
    text(bold, model.totals.amount, R - 8, ty + 14.5, FS, ink, 'right');
    ty += 22;
    for (const sRow of model.settleRows) {
      box(L, ty, TW, 21);
      cols.forEach((c, ci) => {
        if (ci > 0) vline(c.x, ty, ty + 21);
      });
      text(bold, sRow.label, colByKey.name.x + colByKey.name.w - 8, ty + 14, FS, ink, 'right');
      text(bold, sRow.value, R - 8, ty + 14, FS, ink, 'right');
      ty += 21;
    }
    ty += 8;

    // HSN summary
    if (model.showHsn) {
      const inter = model.hsn.inter;
      const defs = inter
        ? [['HSN/SAC', 120], ['Taxable Value', 171], ['Rate', 60], ['Amount', 150], ['Total Tax Amount', 211]]
        : [['HSN/SAC', 120], ['Taxable Value', 171], ['Rate', 49], ['Amount', 114], ['Rate', 50], ['Amount', 115], ['Total Tax Amount', 211]];
      const tot = defs.reduce((s, d) => s + d[1], 0);
      let hx = L;
      const hc = defs.map(([label, w]) => {
        const c = { label, x: hx, w: (w / tot) * TW };
        hx += c.w;
        return c;
      });
      const top = ty;
      const bodyTop = top + 30;
      box(L, top, TW, 30, { fill });
      // Two-row header: tax names span their Rate and Amount columns.
      const groups = inter ? [['IGST', 2, 3]] : [['CGST', 2, 3], ['SGST', 4, 5]];
      for (const [name, a, b2] of groups) {
        const gx = hc[a].x;
        const gw = hc[b2].x + hc[b2].w - gx;
        text(bold, name, gx + gw / 2, top + 11, FS, ink, 'center');
        hline(gx, gx + gw, top + 15);
        text(bold, hc[a].label, hc[a].x + hc[a].w / 2, top + 26, FS, ink, 'center');
        text(bold, hc[b2].label, hc[b2].x + hc[b2].w / 2, top + 26, FS, ink, 'center');
        vline(hc[b2].x, top + 15, top + 30);
      }
      const spanning = inter ? [0, 1, 4] : [0, 1, 6];
      spanning.forEach((ci) => text(bold, hc[ci].label, hc[ci].x + hc[ci].w / 2, top + 19, FS, ink, 'center'));
      const startsWithLine = inter ? [1, 2, 4] : [1, 2, 4, 6];
      startsWithLine.forEach((ci) => vline(hc[ci].x, top, top + 30));
      let ry = bodyTop;
      const bodyRows = [...model.hsn.rows.map((r) => ({ ...r, isTotal: false }))];
      if (model.hsn.total) bodyRows.push({ hsn: 'Total', rate: '', ...model.hsn.total, isTotal: true });
      for (const r of bodyRows) {
        const f = r.isTotal ? bold : reg;
        const vals = inter ? [r.hsn, r.taxable, r.rate, r.igst, r.tax] : [r.hsn, r.taxable, r.rate, r.cgst, r.rate, r.sgst, r.tax];
        vals.forEach((val, ci) => text(f, val, hc[ci].x + hc[ci].w - 6, ry + 11.5, FS, ink, 'right'));
        ry += hsnRowH;
      }
      box(L, bodyTop, TW, ry - bodyTop);
      hc.forEach((c, ci) => {
        if (ci > 0) vline(c.x, bodyTop, ry);
      });
      ty = ry + 8;
    }

    // Amount in words
    box(L, ty, TW, 36);
    text(reg, 'Total Amount (in words)', L + 8, ty + 13, FS + 0.6);
    hline(L, R, ty + 18);
    text(reg, model.words, L + 8, ty + 30, FS);
    ty += 36;

    // Bank details and signature
    if (bankH) {
      const half = model.signature ? TW * 0.6 : TW;
      box(L, ty, TW, bankH);
      if (bankLines) {
        text(bold, 'Bank Details', L + 8, ty + 13, FS + 0.4);
        model.bank.forEach(([k2, val], bi) => {
          text(reg, k2 + ':', L + 8, ty + 26 + bi * LH, FS, muted);
          text(reg, val, L + 64, ty + 26 + bi * LH, FS);
        });
      }
      if (model.signature) {
        if (bankLines) vline(L + half, ty, ty + bankH);
        const sx = L + half + (TW - half) / 2;
        text(bold, 'For ' + model.signature, sx, ty + 14, FS, ink, 'center');
        text(reg, 'Authorised Signatory', sx, ty + bankH - 8, FS, muted, 'center');
      }
      ty += bankH;
    }
    if (notesH) {
      box(L, ty, TW, notesH);
      text(reg, 'Notes', L + 8, ty + 13, FS + 0.6);
      noteLines.forEach((ln, ni) => text(reg, ln, L + 8, ty + 26 + ni * LH, FS));
      ty += notesH;
    }
    if (termsH) {
      box(L, ty, TW, termsH);
      text(reg, 'Terms and Conditions', L + 8, ty + 13, FS + 0.6);
      termLines.forEach((ln, ti) => text(reg, ln, L + 8, ty + 26 + ti * LH, FS));
      ty += termsH;
    }
  });

  if (pages.length > 1) {
    doc.getPages().forEach((p, pi, all) => {
      page = p;
      text(reg, `Page ${pi + 1} of ${all.length}`, R, H - 12, 7.5, muted, 'right');
    });
  }
  return doc.save();
}
