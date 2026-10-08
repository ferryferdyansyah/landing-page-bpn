// excel.js
// Membuat file Excel 31 sheet (urutan mengikuti SHEETS di sheets.js) memakai ExcelJS (grafik disisipkan sebagai gambar PNG).

const thin = { style: 'thin', color: { argb: 'FF000000' } }, BORD = { top: thin, left: thin, bottom: thin, right: thin };
function hdr(c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = BORD }
function cell(ws, r, c, v, o = {}) { const x = ws.getCell(r, c); x.value = v; x.border = BORD; if (o.num) x.numFmt = '#,##0.00'; if (o.b) x.font = { bold: true }; if (o.ctr) x.alignment = { horizontal: 'center' }; return x }
function chartPNG(def, d) {
    const cv = document.createElement('canvas'); cv.width = def.type === 'pie' ? 760 : 600; cv.height = 340;
    const ch = mkChart(cv, def, d, false), url = cv.toDataURL('image/png'); ch.destroy(); return url;
}
function sheetRaw(wb, name) {
    const s1 = wb.addWorksheet(name);
    if (ROWS.length) {
        s1.addRow(COLS).eachCell(hdr);
        const num = new Set(COLS.filter(c => ROWS[0][c] !== '' && !isNaN(ROWS[0][c]) && /^(KDGN|TON|LUASHA|Shape)/.test(c)));
        ROWS.forEach(r => {
            // angka notasi ilmiah (SCI, ada di render.js) dibulatkan 3 angka di belakang koma
            const row = s1.addRow(COLS.map(c => SCI.test(r[c]) ? +(+r[c]).toFixed(3) : num.has(c) ? (parseFloat(r[c]) || 0) : r[c]));
            COLS.forEach((c, i) => { if (SCI.test(r[c])) row.getCell(i + 1).numFmt = '0.00' });
        });
        s1.views = [{ state: 'frozen', ySplit: 1 }]; s1.columns.forEach(c => c.width = 16);
    } else s1.getCell(1, 1).value = '(Data tidak ditemukan)';
}
function sheetDef(wb, def, d, name) {
    const ws = wb.addWorksheet(name);
    if (!d) { ws.getCell(1, 1).value = '(Data tidak ditemukan)'; return }
    const nk = d.kecs.length, cJ = nk + 3, cP = nk + 4;
    [[1, 1, 'No'], [1, 2, def.h], [1, 3, 'Luas di Tiap Kecamatan (Ha)'], [1, cJ, 'Jumlah (Ha)'], [1, cP, 'Persentase (%)']].forEach(([r, c, v]) => hdr(cell(ws, r, c, v)));
    d.kecs.forEach((k, j) => hdr(cell(ws, 2, 3 + j, k)));
    ws.mergeCells(1, 1, 2, 1); ws.mergeCells(1, 2, 2, 2); ws.mergeCells(1, 3, 1, 2 + nk); ws.mergeCells(1, cJ, 2, cJ); ws.mergeCells(1, cP, 2, cP);
    for (let c = 1; c <= cP; c++)for (let r = 1; r <= 2; r++)hdr(ws.getCell(r, c));
    d.body.forEach((b, i) => { const r = 3 + i; cell(ws, r, 1, i + 1, { ctr: 1 }); cell(ws, r, 2, b.c); b.v.forEach((v, j) => cell(ws, r, 3 + j, v, { num: 1 })); cell(ws, r, cJ, b.t, { num: 1, b: 1 }); cell(ws, r, cP, b.p, { num: 1, b: 1 }) });
    const tr = 3 + d.body.length; cell(ws, tr, 1, 'Jumlah (Ha)', { b: 1, ctr: 1 }); cell(ws, tr, 2, null); ws.mergeCells(tr, 1, tr, 2);
    d.kt.forEach((v, j) => cell(ws, tr, 3 + j, v, { num: 1, b: 1 })); cell(ws, tr, cJ, d.T, { num: 1, b: 1 }); cell(ws, tr, cP, 100, { num: 1, b: 1 });
    ws.getColumn(1).width = 6; ws.getColumn(2).width = 48; for (let c = 3; c <= cP; c++)ws.getColumn(c).width = 16;
    const img = wb.addImage({ base64: chartPNG(def, d), extension: 'png' });
    if (def.type === 'bar') {
        const c0 = cP + 2;
        [['No', 0], [def.t5, 1], ['Jumlah (Ha)', 2]].forEach(([v, o]) => { hdr(cell(ws, 1, c0 + o, v)); ws.mergeCells(1, c0 + o, 2, c0 + o); hdr(ws.getCell(2, c0 + o)) });
        d.top.forEach((b, i) => { cell(ws, 3 + i, c0, i + 1, { ctr: 1 }); cell(ws, 3 + i, c0 + 1, b.c); cell(ws, 3 + i, c0 + 2, b.t, { num: 1 }) });
        ws.getColumn(c0).width = 6; ws.getColumn(c0 + 1).width = 44; ws.getColumn(c0 + 2).width = 16;
        ws.addImage(img, { tl: { col: c0 - 1, row: 9 }, ext: { width: 600, height: 340 } });
    } else ws.addImage(img, { tl: { col: 0, row: tr + 1 }, ext: { width: 760, height: 340 } });
}
function sheetExtra(wb, ex, d, name) {
    const ws = wb.addWorksheet(name);
    if (!d) { ws.getCell(1, 1).value = '(Data tidak ditemukan)'; return }
    ex.excel(wb, ws, d, ex);
}
function sheetNew(wb, name) {
    const ws = wb.addWorksheet(name);
    ws.getCell(1, 1).value = NEW_TEXT; ws.getColumn(1).width = 28;
}
async function downloadXLSX() {
    const wb = new ExcelJS.Workbook();
    // urutan sheet mengikuti SHEETS (sheets.js)
    SHEETS.forEach(s => {
        const name = sheetName(s);
        if (s.kind === 'raw') sheetRaw(wb, name);
        else if (s.kind === 'def') sheetDef(wb, DEFS[s.i], MODELS[s.i], name);
        else if (s.kind === 'extra') sheetExtra(wb, EXTRA[s.i], EXTRA_MODELS[s.i], name);
        else sheetNew(wb, name);
    });
    const buf = await wb.xlsx.writeBuffer(), a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'Rekap_DJPA.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
