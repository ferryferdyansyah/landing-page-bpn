// slides.js - (1) membaca template (PDF/PPTX) -> teks sampul, (2) menyusun 20 slide dari data (DJPA + HAT + TS).
// Model slide: {bg:'cover'|'outline'|'content', els:[ {t:'text'|'table'|'bar'|'pie'|'img', x,y,w,h, ...} ]}  (kanvas 1280x720)

const NAVY = '#06416b', YEL = '#fdbf2d', ORG = '#e8650a';

// ---------- Baca template ----------
async function parseTemplate(name, buf) {
  const ext = name.split('.').pop().toLowerCase(), pages = [];
  if (ext === 'pdf') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent(), L = [];
      for (const it of tc.items) { if (!it.str.trim()) continue; const y = it.transform[5]; let l = L.find(a => Math.abs(a.y - y) < 4); if (!l) L.push(l = { y, p: [] }); l.p.push([it.transform[4], it.str]) }
      pages.push(L.sort((a, b) => b.y - a.y).map(l => l.p.sort((a, b) => a[0] - b[0]).map(p => p[1]).join(' ').replace(/\s+/g, ' ').trim()));
    }
  } else if (ext === 'pptx') {
    const z = await JSZip.loadAsync(buf.slice(0)), names = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    for (const n of names) {
      const xml = await z.file(n).async('string');
      pages.push([...xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map(m => [...m[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(t => t[1]).join('').replace(/&amp;/g, '&').trim()).filter(Boolean));
    }
  } else throw new Error('Format template harus .pdf atau .pptx');
  if (!pages.length) throw new Error('Template tidak berisi halaman.');
  return pages;
}

// ---------- Pengaturan yang mudah diubah ----------
// Kata kunci arahan (V_ARAHAN) yang dianggap Potensi Pertanian Pangan; selain itu masuk Potensi Sektor Lainnya.
const POTENSI_PANGAN = /pangan|sawah|ladang|tegalan|hortikultura|holtikultura|pertanian|peternakan/i;
// TIPEHAK (HAT) yang dianggap BELUM ada hak atas tanah.
const HAT_BELUM = /kosong|belum|tidak/i;
// Daftar isi (outline) mengikuti 20 slide di bawah.
const OUTLINE = ['1. PENGUMPULAN DATA', '2. SURVEI LAPANGAN', '3. PENGGUNAAN TANAH LAMA DAN BARU', '4. ANALISIS PERUBAHAN PENGGUNAAN TANAH', '5. ANALISIS KESESUAIAN TERHADAP RTRW',
  '6. GAMBARAN UMUM PENGUASAAN TANAH', '7. KETERSEDIAAN DAN ARAHAN TANAH', '8. POTENSI PANGAN, SEKTOR LAIN, KARBON & SOSIAL EKONOMI', '9. KESIMPULAN'];

const NF0 = n => Math.round(+n || 0).toLocaleString('id-ID');
const parsePop = v => { const s = String(v ?? '').replace(/[^\d,.]/g, ''); if (!s) return 0; const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); return isFinite(n) ? n : 0 };
const SGN = n => (n >= 0 ? '+' : '') + NF(n);
const shortN = (s, n = 48) => s.length > n ? s.slice(0, n - 1) + '…' : s;
// "Tersedia untuk Kawasan X sesuai tata ruang" -> kawasan X
const cleanArahan = k => String(k || '').replace(/^Tersedia untuk\s+/i, '').replace(/\s+(sesuai tata ruang|dalam rangka (optimalisasi|penyesuaian) penggunaan tanah|dalam rangka optimalisasi pengunaan tanah)\s*$/i, '').replace(/^penyesuaian penggunaan tanah di\s+/i, '').trim().replace(/^./, c => c.toUpperCase());
const arahanSesuai = k => /sesuai tata ruang/i.test(k || '');

// Slide Sosial Ekonomi: kepadatan penduduk diisi manual per kecamatan; total (rata-rata tertimbang luas) dan teks analisis dihitung otomatis.
function sosekRecalc(s) {
  const m = s.meta; if (!m || m.kind !== 'sosek') return { cells: [] };
  const el = s.els.find(e => e.fx === 'sosek'); if (!el) return { cells: [] };
  const cells = [], n = m.rows.length, den = []; let all = true, A = 0, PP = 0;
  const set = (r, c, v) => { if (el.rows[r][c] !== v) { el.rows[r][c] = v; cells.push([r, c, v]) } };
  m.rows.forEach((k, i) => { const d = parsePop(el.rows[i][m.denCol]); den[i] = d > 0 ? d : null; if (d > 0) { A += k.km2; PP += d * k.km2 } else all = false });
  set(n, m.denCol, all && A ? NF0(PP / A) : '-');
  const t = s.els.find(e => e.fx === 'sosekText'); let text = null;
  if (t && m.best >= 0) { const k = m.rows[m.best];
    text = `Potensi sosial ekonomi paling tinggi: Kecamatan ${k.k}\n○  Lahan "Tersedia" mencapai ${NF(k.ter)} Ha (${PC(k.terP)})\n○  ` + (den[m.best] ? `Kepadatan penduduk ${NF0(den[m.best])} jiwa/km²` : '[Isi kepadatan penduduk pada tabel]') +
      (k.hat != null ? `\n○  Lahan ${NF(k.hat)} Ha yang "Ada HAT" (Hak Atas Tanah) (${PC(k.hatP)})` : '');
    t.text = text }
  return { cells, text };
}

// ---------- Susun slide ----------
// R: baris DJPA. ctx: { hat: baris HAT | null, ts: titik survei | null }
function buildSlides(R, pages, nama, ctx = {}) {
  const NAMA = nama.toUpperCase(), all = pages.flat(), find = re => all.find(l => re.test(l));
  const tgl = find(/Surabaya,.*20\d\d/) || 'Surabaya, 22 - 23 Oktober 2026';
  const bid = ['Bidang Penataan dan Pemberdayaan', 'Kantor Wilayah Badan Pertanahan Nasional', 'Provinsi Jawa Timur'].map((d, i) => find(new RegExp(['^Bidang Penataan', '^Kantor Wilayah', '^Provinsi'][i])) || d);
  const tahun = (all.join(' ').match(/20\d\d/) || ['2026'])[0];
  const { hat, ts } = ctx;

  // ---- helper elemen ----
  const tx = (x, y, w, h, text, o = {}) => ({ t: 'text', x, y, w, h, text, sz: 16, c: '#10243a', al: 'left', v: 'top', ...o });
  const sub = (x, y, w, s) => tx(x, y, w, 28, s, { sz: 14, b: 1, c: '#fff', fill: ORG, v: 'middle' });
  const content = (title) => ({ bg: 'content', els: [tx(84, 23, 820, 41, title, { sz: 17, b: 1, c: '#fff', v: 'middle' }), tx(44, 678, 800, 28, `INTEGRASI DATA NERACA PENATAGUNAAN TANAH REGIONAL ${tahun}`, { sz: 12, b: 1, c: '#fff', v: 'middle' }), tx(880, 678, 300, 28, NAMA, { sz: 12, b: 1, c: '#fff', v: 'middle', al: 'center' }), tx(1200, 678, 56, 28, '', { sz: 13, b: 1, c: '#fff', v: 'middle', al: 'center', auto: 'pg' })] });
  const mapEl = src => ({ t: 'img', x: 590, y: 84, w: 650, h: 575, src });
  const S = [], skip = [], TOT = sumBy(R, 'LUASHA');
  const colset = R.cols || new Set(Object.keys(R[0])), has = (...f) => f.every(x => colset.has(x));
  // Slide tetap dibuat (agar urutan 20 slide terjaga) walau kolom tidak ada.
  const guard = (title, name, cols, fn) => {
    if (has(...cols)) return fn();
    const miss = cols.filter(x => !colset.has(x)); skip.push(`${name} (kolom ${miss.join(', ')} tidak ada)`);
    const s = content(title); s.els.push(tx(60, 300, 1160, 80, `[Slide "${name}" tidak dapat dibuat otomatis: kolom ${miss.join(', ')} tidak ditemukan di shapefile]`, { sz: 20, al: 'center' })); return s;
  };
  // Tabel otomatis: huruf & tinggi baris dikecilkan (memperhitungkan teks yang membungkus), lalu bila perlu dipecah jadi 2-3 tabel berdampingan.
  function fitTable(x, y, w, H, head, rows, o = {}) {
    const tot = o.tot ? rows[rows.length - 1] : null, data = o.tot ? rows.slice(0, -1) : rows, cw = o.cw || head.map(() => 1 / head.length), rh0 = o.rh || 24, maxP = o.maxP || (w >= 900 ? 3 : 2), gap = 14, sz0 = o.sz || 12;
    const hOf = (r, pw, sz, rh) => Math.max(rh, Math.max(...r.map((v, c) => Math.ceil(String(v ?? '').length * sz * .56 / Math.max(20, pw * cw[c] - 14)))) * sz * 1.25 + 7);
    const plan = (p, sz) => { const rh = Math.min(rh0, Math.max(13, Math.round(sz * 2.1))), per = Math.ceil(data.length / p), pw = (w - gap * (p - 1)) / p; let hh = 0;
      for (let k = 0; k < p; k++) { const ch = data.slice(k * per, (k + 1) * per); if (!ch.length) continue; const rr = [head, ...ch, ...(k === p - 1 && tot ? [tot] : [])]; hh = Math.max(hh, rr.reduce((s, r) => s + hOf(r, pw, sz, rh), 0)) }
      return { p, sz, rh, per, pw, hh } };
    let best = null;
    search: for (let p = 1; p <= maxP; p++) for (let sz = sz0; sz >= (p < maxP ? 10 : 8); sz--) { const c = plan(p, sz); best = c; if (c.hh <= H) break search }
    const { p, sz, rh, per, pw, hh } = best, els = [];
    for (let k = 0; k < p; k++) { const ch = data.slice(k * per, (k + 1) * per), last = k === p - 1; if (!ch.length) continue;
      els.push({ t: 'table', x: Math.round(x + k * (pw + gap)), y, w: Math.round(pw), head, rows: last && tot ? [...ch, tot] : ch, cw: o.cw, num: o.num, sz, rh, tot: !!(last && tot), ...(p === 1 && o.bold ? { bold: o.bold } : {}), ...(o.fx ? { fx: o.fx } : {}) }) }
    return { els, bottom: Math.round(y + hh + 4) };
  }
  const top = (a, n) => a.slice(0, n), berubah = r => r.GQREKLAS === 'Berubah', tersedia = r => r.VNAME === 'Tersedia', tsr = r => r.KSPOLA === 'Tidak Sesuai';
  const pctOf = (v, t) => t ? v / t * 100 : 0;
  // Kunci = nama simbol di simbologi.stylx (peta memakai simbolnya; pie memakai warna wakil simbol, cadangan bila simbol hanya garis tepi).
  const CB = { 'Berubah': symRep('Berubah', '#e53e3e'), 'Tidak Berubah': symRep('Tidak Berubah', '#b7e0a5') }, CK = { 'Sesuai': symRep('Sesuai', '#38a169'), 'Mendukung': symRep('Mendukung', '#ecc94b'), 'Tidak Sesuai': symRep('Tidak Sesuai', '#e53e3e') }, CT = { 'Tersedia': symRep('Tersedia', '#2f9e44'), 'Tidak Tersedia': symRep('Tidak Tersedia', '#d9d9d9') };
  const mapOpt = { w: 1000, h: 885 };
  // Blok kiri: sub-judul + pie + tabel ringkas (dengan baris Jumlah). Mengembalikan y paling bawah.
  function pieBlock(s, y, subt, items, colors, headLabel) {
    s.els.push(sub(40, y, 540, subt), { t: 'pie', x: 40, y: y + 34, w: 540, h: 150, items: items.map(i => ({ ...i, c: colors && colors[i.k] })) });
    const rows = items.map((i, n) => [String(n + 1), i.k, NF(i.v), PC(i.p)]); rows.push(['', 'Jumlah', NF(items.reduce((a, i) => a + i.v, 0)), '100,00%']);
    const ft = fitTable(40, y + 190, 540, 150, ['No', headLabel, 'Luas (Ha)', '%'], rows, { cw: [.08, .5, .24, .18], num: [2, 3], sz: 12, rh: 26, tot: 1, maxP: 1 });
    s.els.push(...ft.els); return ft.bottom;
  }
  const simpleTable = (x, y, w, H, head, items, rowf, o = {}) => { const rows = items.map((i, n) => [String(n + 1), ...rowf(i, n)]); if (o.tot) rows.push(o.tot); return fitTable(x, y, w, H, ['No', ...head], rows, { cw: o.cw, num: o.num, sz: o.sz || 12, rh: o.rh || 26, tot: !!o.tot, maxP: o.maxP || 1, bold: o.bold }) };

  // ===== 1. Sampul =====
  S.push({ bg: 'cover', els: [
    tx(100, 150, 700, 70, 'INTEGRASI DATA', { sz: 56, b: 1, c: YEL }), tx(100, 220, 760, 140, 'NERACA PENATAGUNAAN\nTANAH REGIONAL', { sz: 44, b: 1, c: '#fff' }),
    tx(144, 349, 475, 58, NAMA, { sz: 26, b: 1, c: '#fff', v: 'middle', al: 'center' }),
    tx(100, 420, 580, 34, tgl, { sz: 20, c: '#fff', al: 'center' }), tx(70, 495, 640, 110, bid.join('\n'), { sz: 20, b: 1, c: '#fff', al: 'center' })] });
  // ===== 2. Outline =====
  S.push({ bg: 'outline', els: [tx(118, 30, 500, 56, 'OUTLINE', { sz: 38, b: 1, c: NAVY, v: 'middle' }), ...OUTLINE.map((l, i) => tx(209, 98 + i * 60.5, 820, 40, l, { sz: 15, b: 1, c: '#fff', v: 'middle' })),
    tx(44, 678, 800, 28, 'BIDANG PENATAAN DAN PEMBERDAYAAN - KANTOR WILAYAH PROVINSI JAWA TIMUR', { sz: 12, b: 1, c: '#fff', v: 'middle' }), tx(880, 678, 300, 28, `INTEGRASI NPGT REGIONAL ${tahun}`, { sz: 12, b: 1, c: '#fff', v: 'middle', al: 'center' }), tx(1200, 678, 56, 28, '', { sz: 13, b: 1, c: '#fff', v: 'middle', al: 'center', auto: 'pg' })] });

  // ===== 3. Pengumpulan Data (diisi manual; sengaja dikosongkan) =====
  S.push(content('PENGUMPULAN DATA'));

  // ===== 4. Survei Lapangan (TS.zip) =====
  { const s = content('SURVEI LAPANGAN');
    if (!ts) { skip.push('Survei Lapangan (TS.zip belum diunggah)'); s.els.push(tx(60, 300, 1160, 80, '[Unggah TS.zip (titik survei) untuk mengisi slide ini, atau isi manual]', { sz: 20, al: 'center' })) }
    else {
      const cnt = new Map(); ts.forEach(p => cnt.set(p.WADMKC, (cnt.get(p.WADMKC) || 0) + 1));
      const it = [...cnt].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v), N = ts.length, ch = Math.min(250, it.length * 28 + 14), fd = d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
      s.els.push(sub(40, 84, 540, `Titik Survei Lapangan: ${NF0(N)} Lokasi`), { t: 'bar', x: 40, y: 118, w: 540, h: ch, items: top(it, 10), fmt: 'int' });
      const ft = simpleTable(40, 118 + ch + 10, 540, 665 - (118 + ch + 10), ['Kecamatan', 'Jumlah Titik', '%'], it, i => [i.k, NF0(i.v), PC(pctOf(i.v, N))], { cw: [.08, .5, .24, .18], num: [2, 3], tot: ['', 'Jumlah', NF0(N), '100,00%'] });
      s.els.push(...ft.els, sub(590, 84, 650, ts.dates ? `Pelaksanaan Survei: ${fd(ts.dates[0])}${ts.dates[0].getTime() !== ts.dates[1].getTime() ? ' - ' + fd(ts.dates[1]) : ''}` : 'Peta Sebaran Titik Survei'),
        { t: 'img', x: 590, y: 118, w: 650, h: 541, src: renderMap(R, () => '#e8edf3', [{ k: 'Titik Survei', c: '#e53e3e' }], { w: 1000, h: 832, lw: 260, pts: ts, pr: 7, parcels: false }) });
    }
    S.push(s) }

  // ===== 5 & 6. Penggunaan Tanah Lama / Baru =====
  const useSlide = (title, fld, label, hint) => guard(title, label, [fld], () => {
    const g = group(R, r => r[fld]), items = top(g, 14), rest = g.slice(14), s = content(title);
    if (rest.length) items.push({ k: `Lainnya (${rest.length} jenis)`, v: total(rest), p: pctOf(total(rest), total(g)) });
    const rows = items.map((i, n) => [String(n + 1), i.k, NF(i.v), PC(i.p)]); rows.push(['', 'Jumlah', NF(total(g)), '100,00%']);
    const ft = fitTable(40, 118, 540, 470, ['No', 'Penggunaan Tanah', 'Luas (Ha)', '%'], rows, { cw: [.08, .52, .22, .18], num: [2, 3], sz: 12, rh: 28, tot: 1, maxP: 1 });
    s.els.push(sub(40, 84, 540, `Luas ${label} (Ha)`), ...ft.els, tx(40, Math.min(ft.bottom + 10, 625), 540, 45, g[0] ? `${hint} terluas adalah ${g[0].k} seluas ${NF(g[0].v)} Ha (${PC(g[0].p)}).` : '', { sz: 12 }), mapEl(catMap(R, r => r[fld], 14, mapOpt)));
    return s });
  S.push(useSlide('PENGGUNAAN TANAH LAMA', 'GNAME25', 'Penggunaan Tanah Lama', 'Penggunaan tanah lama'));
  S.push(useSlide('PENGGUNAAN TANAH BARU', 'QNAME25', 'Penggunaan Tanah Baru', 'Penggunaan tanah baru'));

  // ===== 7 & 8. Analisis Perubahan =====
  const chg = group(R, r => r.GQREKLAS), vChg = chg.find(x => x.k === 'Berubah')?.v || 0, chgT = group(R, r => r.GQNAME, berubah);
  const mapBerubah = () => fixedMap(R, r => r.GQREKLAS, CB, mapOpt);
  S.push(guard('ANALISIS PERUBAHAN PENGGUNAAN TANAH', 'Analisis Perubahan (1)', ['GQREKLAS'], () => {
    const s = content('ANALISIS PERUBAHAN PENGGUNAAN TANAH');
    const y = pieBlock(s, 84, 'A. Luas dan Persentase Perubahan Penggunaan Tanah', chg, CB, 'Keterangan Perubahan');
    if (has('GREKLAS', 'QREKLAS')) { const cl = new Map(); R.forEach(r => { if (!berubah(r)) return; const a = cl.get(r.GREKLAS) || [0, 0], b = cl.get(r.QREKLAS) || [0, 0]; a[0] += r.LUASHA; b[1] += r.LUASHA; cl.set(r.GREKLAS, a); cl.set(r.QREKLAS, b) });
      const it = [...cl].filter(([k]) => k).map(([k, [l, b]]) => ({ k, l, b, d: b - l })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      s.els.push(sub(40, y + 10, 540, 'Laju Perubahan Penggunaan Tanah Reklasifikasi (Ha)'));
      const ft = simpleTable(40, y + 44, 540, 660 - (y + 44), ['Reklasifikasi', 'Lama (Ha)', 'Baru (Ha)', 'Selisih (Ha)'], it, i => [i.k, NF(i.l), NF(i.b), SGN(i.d)], { cw: [.07, .35, .19, .19, .2], num: [2, 3, 4], sz: 11, rh: 24 }); s.els.push(...ft.els) }
    else s.els.push(tx(40, y + 14, 540, 40, `Tanah yang berubah penggunaannya seluas ${NF(vChg)} Ha (${PC(pctOf(vChg, TOT))}) dari total ${NF(TOT)} Ha.`, { sz: 13 }));
    s.els.push(mapEl(mapBerubah())); return s }));
  S.push(guard('ANALISIS PERUBAHAN PENGGUNAAN TANAH', 'Analisis Perubahan (2)', ['GQREKLAS', 'GQNAME', 'QNAME25', 'GNAME25'], () => {
    const s = content('ANALISIS PERUBAHAN PENGGUNAAN TANAH'), t10 = top(chgT, 10);
    s.els.push(sub(40, 84, 760, 'D. Presentase Tertinggi Perubahan Penggunaan Tanah (% dari Total Perubahan)'), { t: 'bar', x: 40, y: 118, w: 760, h: Math.max(60, t10.length * 30), items: t10.map(i => ({ k: i.k, v: +i.p.toFixed(2) })), fmt: 'pct', lwf: .56, trunc: 62 });
    // selisih bersih per penggunaan tanah (hanya poligon yang berubah)
    const net = new Map(); R.forEach(r => { if (!berubah(r)) return; net.set(r.QNAME25, (net.get(r.QNAME25) || 0) + r.LUASHA); net.set(r.GNAME25, (net.get(r.GNAME25) || 0) - r.LUASHA) });
    const arr = [...net].map(([k, v]) => ({ k, v })).filter(x => x.k), up = arr.filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3), dn = arr.filter(x => x.v < 0).sort((a, b) => a.v - b.v).slice(0, 3);
    s.els.push(sub(820, 84, 420, 'Dominasi Jenis Perubahan'));
    const t1 = simpleTable(820, 118 + 24, 420, 130, ['Bertambah', 'Luas (Ha)'], up, i => [i.k, SGN(i.v)], { cw: [.1, .6, .3], num: [2], sz: 11, rh: 26 }), t2 = simpleTable(820, 320 + 24, 420, 130, ['Berkurang', 'Luas (Ha)'], dn, i => [i.k, SGN(i.v)], { cw: [.1, .6, .3], num: [2], sz: 11, rh: 26 });
    s.els.push(tx(820, 118, 420, 24, 'Penggunaan tanah yang bertambah (bersih)', { sz: 12, b: 1 }), ...t1.els, tx(820, 320, 420, 24, 'Penggunaan tanah yang berkurang (bersih)', { sz: 12, b: 1 }), ...t2.els);
    const by = Math.max(118 + t10.length * 30 + 14, 440);
    const tm = top(chgT, 3).map((c, i) => { const kc = group(R, r => r.WADMKC, r => berubah(r) && r.GQNAME === c.k)[0]; return `${i + 1}.  ${kc && kc.k !== '-' ? 'Kec. ' + kc.k + ': ' : ''}${c.k} (${NF(c.v)} Ha)` });
    s.els.push(sub(40, by, 760, 'E. Hasil Temuan Analisis Perubahan Penggunaan Tanah'), tx(40, by + 34, 760, 665 - by - 34, vChg ? `Dominasi perubahan guna tanah yang terjadi, antara lain:\n${tm.join('\n')}` : 'Tidak terdapat perubahan penggunaan tanah.', { sz: 13 }));
    return s }));

  // ===== 9. Kesesuaian RTRW =====
  const ks = ['Sesuai', 'Mendukung', 'Tidak Sesuai'].map(k => ({ k, v: sumBy(R, 'LUASHA', r => r.KSPOLA === k) })).map(x => ({ ...x, p: pctOf(x.v, TOT) })), vTS = ks[2].v;
  const mapKs = () => fixedMap(R, r => r.KSPOLA, CK, mapOpt);
  S.push(guard('ANALISIS KESESUAIAN TERHADAP RTRW', 'Analisis Kesesuaian RTRW', ['KSPOLA'], () => {
    const s = content('ANALISIS KESESUAIAN TERHADAP RTRW'), y = pieBlock(s, 84, 'A. Kesesuaian Penggunaan Tanah terhadap RTRW', ks, CK, 'Kesesuaian');
    if (has('WADMKC')) { const c = top(group(R, r => r.WADMKC, tsr), 5);
      s.els.push(sub(40, y + 10, 540, 'B. Ketidaksesuaian Tertinggi Berdasarkan Kecamatan (Top 5)'));
      const ft = simpleTable(40, y + 44, 540, 660 - (y + 44), ['Kecamatan', 'Tidak Sesuai (Ha)', '% Total Tidak Sesuai'], c, i => [i.k, NF(i.v), PC(i.p)], { cw: [.07, .4, .27, .26], num: [2, 3], sz: 12 }); s.els.push(...ft.els) }
    s.els.push(mapEl(mapKs())); return s }));

  // ===== 10. Dominasi ketidaksesuaian (KSPOLA) =====
  S.push(guard('DOMINASI KETIDAKSESUAIAN PENGGUNAAN TANAH BARU DENGAN RTRW', 'Dominasi Ketidaksesuaian', ['KSPOLA', 'QNAME25', 'NAMOBJ'], () => {
    const s = content('DOMINASI KETIDAKSESUAIAN PENGGUNAAN TANAH BARU DENGAN RTRW'), par = top(group(R, r => r.QNAME25, tsr), 8);
    const mk = ps => { const rows = [], bold = []; ps.forEach(p => { bold.push(rows.length); rows.push([p.k, NF(p.v), PC(pctOf(p.v, vTS))]);
      group(R, r => r.NAMOBJ, r => tsr(r) && r.QNAME25 === p.k).slice(0, 3).forEach(c => rows.push(['   ' + c.k, NF(c.v), PC(pctOf(c.v, vTS))])) }); return { rows, bold } };
    s.els.push(sub(40, 84, 1200, `Dominasi Ketidaksesuaian Jenis Guna Tanah Baru terhadap RTRW - Total Tidak Sesuai ${NF(vTS)} Ha (${PC(pctOf(vTS, TOT))} dari luas wilayah)`));
    if (!par.length) s.els.push(tx(60, 300, 1160, 60, 'Tidak terdapat penggunaan tanah yang tidak sesuai dengan RTRW.', { sz: 20, al: 'center' }));
    [par.slice(0, 4), par.slice(4, 8)].forEach((ps, k) => { if (!ps.length) return; const { rows, bold } = mk(ps);
      const ft = fitTable(40 + k * 610, 120, 590, 520, ['Penggunaan Tanah Baru / Jenis RTRW', 'Tidak Sesuai (Ha)', '% Total'], rows, { cw: [.58, .22, .2], num: [1, 2], sz: 12, rh: 28, maxP: 1, bold }); s.els.push(...ft.els) });
    return s }));

  // ===== 11. GUPT =====
  const gu = group(R, r => r.ONAME25);
  S.push(guard('GAMBARAN UMUM PENGUASAAN TANAH (GUPT)', 'GUPT', ['ONAME25'], () => {
    const s = content('GAMBARAN UMUM PENGUASAAN TANAH (GUPT)'), it = top(gu, 8); if (gu.length > 8) it.push({ k: `Lainnya (${gu.length - 8} jenis)`, v: total(gu.slice(8)), p: pctOf(total(gu.slice(8)), total(gu)) });
    s.els.push(sub(40, 84, 540, 'Urutan GUPT Tertinggi'), { t: 'pie', x: 40, y: 118, w: 540, h: 175, items: it });
    const rows = it.map((i, n) => [String(n + 1), i.k, NF(i.v), PC(i.p)]); rows.push(['', 'Jumlah', NF(total(gu)), '100,00%']);
    const ft = fitTable(40, 301, 540, 235, ['No', 'Penguasaan Tanah', 'Luas (Ha)', '%'], rows, { cw: [.07, .57, .21, .15], num: [2, 3], sz: 11, rh: 24, tot: 1, maxP: 1 }); s.els.push(...ft.els);
    const ob = top(gu, 3).map(g => { const q = top(group(R, r => r.QNAME25, r => r.ONAME25 === g.k), 2).map(x => x.k).join(', '); return `${shortN(g.k, 60)}\n   • ${q}` });
    const oy = ft.bottom + 8; s.els.push(sub(40, oy, 540, 'Hasil Observasi (penggunaan tanah dominan)'), tx(40, oy + 32, 540, Math.max(30, 665 - oy - 32), ob.join('\n'), { sz: 11 }));
    s.els.push(mapEl(catMap(R, r => r.ONAME25, 8, { ...mapOpt, lw: 380 }))); return s }));

  // ===== 12 & 13. Ketersediaan =====
  const vt = group(R, r => r.VNAME), vTer = vt.find(x => x.k === 'Tersedia')?.v || 0, mapTer = () => fixedMap(R, r => r.VNAME, CT, mapOpt);
  S.push(guard('KETERSEDIAAN TANAH', 'Ketersediaan Tanah (1)', ['VNAME'], () => {
    const s = content('KETERSEDIAAN TANAH'), y = pieBlock(s, 84, 'A. Luas dan Persentase Ketersediaan Tanah', vt, CT, 'Ketersediaan');
    if (has('WADMKC')) { const kc = top(group(R, r => r.WADMKC, tersedia), 5), kt = group(R, r => r.WADMKC); const kl = Object.fromEntries(kt.map(x => [x.k, x.v]));
      s.els.push(sub(40, y + 10, 540, 'B. Ketersediaan Tanah Tertinggi per Kecamatan (Top 5)'));
      const ft = simpleTable(40, y + 44, 540, 660 - (y + 44), ['Kecamatan', 'Tersedia (Ha)', '% dari Luas Kec.'], kc, i => [i.k, NF(i.v), PC(pctOf(i.v, kl[i.k]))], { cw: [.07, .4, .27, .26], num: [2, 3], sz: 12 }); s.els.push(...ft.els) }
    s.els.push(mapEl(mapTer())); return s }));
  S.push(guard('KETERSEDIAAN TANAH', 'Ketersediaan Tanah (2)', ['VNAME', 'QNAME25', 'NAMOBJ'], () => {
    const s = content('KETERSEDIAAN TANAH'), pr = top(group(R, r => r.NAMOBJ, tersedia), 10), qn = top(group(R, r => r.QNAME25, tersedia), 5);
    s.els.push(sub(40, 84, 740, 'Presentase Ketersediaan Tanah pada Rencana Pola Ruang (% dari Tanah Tersedia)'), { t: 'bar', x: 40, y: 118, w: 740, h: Math.max(60, pr.length * 32), items: pr.map(i => ({ k: i.k, v: +i.p.toFixed(2) })), fmt: 'pct', lwf: .5, trunc: 48 });
    s.els.push(sub(800, 84, 440, 'Ketersediaan Terbesar Berdasarkan Penggunaan Tanah (Top 5)'));
    const ft = simpleTable(800, 118, 440, 270, ['Penggunaan Tanah', 'Luas (Ha)', '%'], qn, i => [i.k, NF(i.v), PC(pctOf(i.v, vTer))], { cw: [.1, .5, .22, .18], num: [2, 3], sz: 11, rh: 28 }); s.els.push(...ft.els);
    const by = Math.max(118 + pr.length * 32 + 14, 450), kc3 = top(group(R, r => r.WADMKC, tersedia), 3).map(x => x.k);
    const L = [`1.  Mayoritas tersedia pada penggunaan tanah ${qn.slice(0, 3).map(x => x.k).join(', ') || '-'}.`, `2.  Dominasi tersedia pada Rencana Pola Ruang ${pr.slice(0, 3).map(x => x.k).join(', ') || '-'}.`, ...(kc3.length && kc3[0] !== '-' ? [`3.  Mayoritas tersedia di kecamatan: ${kc3.join(', ')}.`] : [])];
    s.els.push(sub(40, by, 1200, 'Hasil Observasi Ketersediaan Tanah'), tx(40, by + 34, 1200, 665 - by - 34, `Ketersediaan tanah seluas ${NF(vTer)} Ha (${PC(pctOf(vTer, TOT))} dari luas wilayah).\n${L.join('\n')}`, { sz: 17 }));
    return s }));

  // ===== 14. Arahan ketersediaan (V_ARAHAN) =====
  const potOK = r => r.V_ARAHAN && !/^tidak tersedia$/i.test(r.V_ARAHAN), isPangan = r => potOK(r) && POTENSI_PANGAN.test(r.V_ARAHAN), isLain = r => potOK(r) && !POTENSI_PANGAN.test(r.V_ARAHAN);
  const vPangan = sumBy(R, 'LUASHA', isPangan), vLain = sumBy(R, 'LUASHA', isLain), arah = group(R, r => r.V_ARAHAN);
  S.push(guard('ARAHAN KETERSEDIAAN TANAH', 'Arahan Ketersediaan Tanah', ['V_ARAHAN'], () => {
    const s = content('ARAHAN KETERSEDIAAN TANAH'), a10 = top(arah, 10);
    s.els.push(sub(40, 84, 1200, 'Presentase Tertinggi Arahan Ketersediaan Tanah (% dari Luas Wilayah)'), { t: 'bar', x: 40, y: 118, w: 1200, h: Math.max(60, a10.length * 28), items: a10.map(i => ({ k: i.k, v: +pctOf(i.v, TOT).toFixed(2) })), fmt: 'pct', lwf: .56, trunc: 100 });
    const by = Math.max(118 + a10.length * 28 + 12, 420);
    s.els.push(sub(40, by, 560, 'Potensi Sektoral (Ha)'), { t: 'bar', x: 40, y: by + 34, w: 560, h: 90, items: [{ k: 'Potensi Pertanian Pangan', v: +vPangan.toFixed(2) }, { k: 'Potensi Sektor Lainnya', v: +vLain.toFixed(2) }] });
    if (has('WADMKC')) { const kk = group(R, r => r.WADMKC), rows = kk.map(x => ({ k: x.k, a: sumBy(R, 'LUASHA', r => r.WADMKC === x.k && isPangan(r)), b: sumBy(R, 'LUASHA', r => r.WADMKC === x.k && isLain(r)) })).sort((p, q) => (q.a + q.b) - (p.a + p.b)).slice(0, 5);
      s.els.push(sub(640, by, 600, 'Luasan Potensi Sektoral Tiap Kecamatan (Top 5, Ha)'));
      const ft = simpleTable(640, by + 34, 600, 665 - by - 34, ['Kecamatan', 'Pangan', 'Sektor Lain', 'Jumlah'], rows, i => [i.k, NF(i.a), NF(i.b), NF(i.a + i.b)], { cw: [.07, .33, .2, .2, .2], num: [2, 3, 4], sz: 12, rh: 26 }); s.els.push(...ft.els) }
    return s }));

  // ===== 15 & 16. Potensi pangan / sektor lain =====
  const POT_NOTE = 'Sesuai tata ruang = tanah tersedia; dalam rangka optimalisasi/penyesuaian = tanah belum tersedia (arahan).';
  S.push(guard('POTENSI PERTANIAN PANGAN', 'Potensi Pertanian Pangan', ['V_ARAHAN'], () => {
    const s = content('POTENSI PERTANIAN PANGAN'), kk = has('WADMKC') ? group(R, r => r.WADMKC, isPangan) : [];
    const rows = kk.map(x => [x.k, NF(sumBy(R, 'LUASHA', r => r.WADMKC === x.k && isPangan(r) && arahanSesuai(r.V_ARAHAN))), NF(sumBy(R, 'LUASHA', r => r.WADMKC === x.k && isPangan(r) && !arahanSesuai(r.V_ARAHAN))), NF(x.v)]);
    const sS = sumBy(R, 'LUASHA', r => isPangan(r) && arahanSesuai(r.V_ARAHAN));
    s.els.push(sub(40, 84, 540, 'A. Potensi Pertanian Pangan per Kecamatan (Ha)'));
    const ft = simpleTable(40, 118, 540, 250, ['Kecamatan', 'Sesuai Tata Ruang', 'Optimalisasi / Penyesuaian', 'Jumlah (Ha)'], kk, (x, n) => rows[n], { cw: [.07, .31, .21, .23, .18], num: [2, 3, 4], sz: 11, rh: 26, tot: ['', 'Jumlah', NF(sS), NF(vPangan - sS), NF(vPangan)] }); s.els.push(...ft.els);
    const ar = top(group(R, r => cleanArahan(r.V_ARAHAN), isPangan), 6), y2 = ft.bottom + 10;
    s.els.push(sub(40, y2, 540, 'B. Arahan Pertanian Pangan Terbesar'));
    const f2 = simpleTable(40, y2 + 34, 540, 640 - (y2 + 34), ['Arahan', 'Luas (Ha)', '%'], ar, i => [i.k, NF(i.v), PC(i.p)], { cw: [.07, .55, .22, .16], num: [2, 3], sz: 11, rh: 24 }); s.els.push(...f2.els, tx(40, Math.min(f2.bottom + 6, 640), 540, 32, `Total ${NF(vPangan)} Ha (${PC(pctOf(vPangan, TOT))} dari luas wilayah). ${POT_NOTE}`, { sz: 10 }));
    s.els.push(mapEl(fixedMap(R, r => isPangan(r) ? (arahanSesuai(r.V_ARAHAN) ? 'Pangan - sesuai tata ruang' : 'Pangan - optimalisasi/penyesuaian') : null, { 'Pangan - sesuai tata ruang': '#2f9e44', 'Pangan - optimalisasi/penyesuaian': '#c6e48b' }, mapOpt))); return s }));
  S.push(guard('POTENSI SEKTOR LAINNYA', 'Potensi Sektor Lainnya', ['V_ARAHAN'], () => {
    const s = content('POTENSI SEKTOR LAINNYA'), m = new Map(); R.forEach(r => { if (!isLain(r)) return; const k = cleanArahan(r.V_ARAHAN), a = m.get(k) || [0, 0]; a[arahanSesuai(r.V_ARAHAN) ? 0 : 1] += r.LUASHA; m.set(k, a) });
    const it = [...m].map(([k, [a, b]]) => ({ k, a, b, v: a + b })).sort((p, q) => q.v - p.v), sS = sumBy(R, 'LUASHA', r => isLain(r) && arahanSesuai(r.V_ARAHAN)), tp = top(it, 12);
    if (it.length > 12) { const r_ = it.slice(12); tp.push({ k: `Lainnya (${r_.length} arahan)`, a: r_.reduce((x, y) => x + y.a, 0), b: r_.reduce((x, y) => x + y.b, 0), v: r_.reduce((x, y) => x + y.v, 0) }) }
    s.els.push(sub(40, 84, 540, 'Potensi Sektor Lainnya per Arahan (Ha)'));
    const ft = simpleTable(40, 118, 540, 470, ['Arahan Kawasan', 'Sesuai Tata Ruang', 'Optimalisasi / Penyesuaian', 'Jumlah (Ha)'], tp, i => [i.k, NF(i.a), NF(i.b), NF(i.v)], { cw: [.06, .36, .17, .22, .19], num: [2, 3, 4], sz: 11, rh: 26, tot: ['', 'Jumlah', NF(sS), NF(vLain - sS), NF(vLain)] });
    s.els.push(...ft.els, tx(40, Math.min(ft.bottom + 6, 630), 540, 40, `Total ${NF(vLain)} Ha (${PC(pctOf(vLain, TOT))} dari luas wilayah). ${POT_NOTE}`, { sz: 10 }));
    s.els.push(mapEl(catMap(R, r => isLain(r) ? cleanArahan(r.V_ARAHAN) : null, 10, { ...mapOpt, lw: 380 }))); return s }));

  // ===== 17. Cadangan karbon =====
  const cL = sumBy(R, 'TON_C_G'), cB = sumBy(R, 'TON_C_Q'), cD = cB - cL;
  S.push(guard('POTENSI CADANGAN KARBON', 'Potensi Cadangan Karbon', ['TON_C_G', 'TON_C_Q'], () => {
    const s = content('POTENSI CADANGAN KARBON'), cls = {}; R.forEach(r => { const a = r.STD_C_G || '-', b = r.STD_C_Q || '-'; (cls[a] ??= [0, 0])[0] += +r.TON_C_G || 0; (cls[b] ??= [0, 0])[1] += +r.TON_C_Q || 0 });
    const ket = d => Math.abs(d) < .005 ? 'Tetap' : d > 0 ? 'Bertambah' : 'Berkurang';
    const rows = Object.entries(cls).sort((a, b) => b[1][1] - a[1][1]).map(([k, [l, b]], i) => [String(i + 1), k, NF(l), NF(b), SGN(b - l), ket(b - l)]); rows.push(['', 'Jumlah', NF(cL), NF(cB), SGN(cD), ket(cD)]);
    s.els.push(sub(40, 84, 540, 'Perubahan Potensi Cadangan Karbon'), tx(40, 120, 540, 76, `Total cadangan karbon terkini: ${NF(cB)} Ton\nCadangan karbon lama: ${NF(cL)} Ton\nPerubahan: ${SGN(cD)} Ton (${cD < 0 ? 'defisit' : cD > 0 ? 'surplus' : 'tetap'})`, { sz: 16, b: 1, c: NAVY }));
    const ft = fitTable(40, 205, 540, 440, ['No', 'Kelas Tutupan', 'Lama (Ton)', 'Baru (Ton)', 'Perubahan (Ton)', 'Ket.'], rows, { cw: [.06, .22, .18, .18, .19, .17], num: [2, 3, 4], sz: 11, rh: 26, tot: 1, maxP: 1 }); s.els.push(...ft.els);
    const bins = [[0, 0, '0', '#f7fbff'], [0, 4, '> 0 – 4 Ton/Ha', '#c6dbef'], [4, 10, '> 4 – 10 Ton/Ha', '#9ecae1'], [10, 30, '> 10 – 30 Ton/Ha', '#4292c6'], [30, 60, '> 30 – 60 Ton/Ha', '#2171b5'], [60, 1e9, '> 60 Ton/Ha', '#08306b']];
    const bin = (r, f, t) => { const d = +r[f] || (r.LUASHA ? (+r[t] || 0) / r.LUASHA : 0); return bins.find(b => d === 0 ? b[1] === 0 : d > b[0] && d <= b[1] && b[1] > 0) || bins[0] }, leg = bins.map(b => ({ k: b[2], c: b[3] }));
    const mo = { w: 1000, h: 412, lw: 230 };
    s.els.push(sub(590, 84, 650, 'Peta Cadangan Karbon Lama (kiri atas) dan Terkini (kiri bawah)'), { t: 'img', x: 590, y: 118, w: 650, h: 268, src: renderMap(R, r => bin(r, 'KDGN_C_G', 'TON_C_G')[3], leg, mo) }, { t: 'img', x: 590, y: 392, w: 650, h: 268, src: renderMap(R, r => bin(r, 'KDGN_C_Q', 'TON_C_Q')[3], leg, mo) });
    return s }));

  // ===== 18. Sosial ekonomi =====
  { const s = content('POTENSI SOSIAL EKONOMI');
    if (!has('WADMKC', 'VNAME')) { skip.push('Sosial Ekonomi (kolom WADMKC/VNAME tidak ada)'); s.els.push(tx(60, 300, 1160, 80, '[Kolom kecamatan/ketersediaan tidak ditemukan]', { sz: 20, al: 'center' })) }
    else {
      if (!hat) skip.push('Sosial Ekonomi: HAT.zip belum diunggah (kolom HAT dikosongkan)');
      const hk = new Map(); (hat || []).forEach(r => { const k = nk(r.WADMKC), a = hk.get(k) || [0, 0]; a[HAT_BELUM.test(r.TIPEHAK || '') ? 1 : 0] += r.LUASHA; hk.set(k, a) });
      const kecs = group(R, r => r.WADMKC).map(x => x.k).sort((a, b) => a.localeCompare(b, 'id')), mrows = [];
      const calc = k => { const f = r => !k || r.WADMKC === k, L = sumBy(R, 'LUASHA', f), Te = sumBy(R, 'LUASHA', r => f(r) && tersedia(r)); let a = 0, b = 0, hv = false;
        if (hat) { hv = true; if (k) { const q = hk.get(nk(k)); if (q) { a = q[0]; b = q[1] } } else hk.forEach(q => { a += q[0]; b += q[1] }) }
        return { k: k || 'Jumlah', L, km2: L / 100, ter: Te, terP: pctOf(Te, L), tt: L - Te, ttP: pctOf(L - Te, L), hat: hv ? a : null, hatP: hv ? pctOf(a, a + b) : 0, bel: hv ? b : null, belP: hv ? pctOf(b, a + b) : 0 } };
      const row = o => [o.k, NF(o.ter), PC(o.terP), NF(o.tt), PC(o.ttP), o.hat == null ? '-' : NF(o.hat), o.hat == null ? '-' : PC(o.hatP), o.bel == null ? '-' : NF(o.bel), o.bel == null ? '-' : PC(o.belP), ''];
      const data = kecs.map(calc); data.forEach(o => mrows.push(o)); const tt = calc(null);
      const rows = data.map((o, i) => [String(i + 1), ...row(o)]); rows.push(['', ...row(tt)]); rows[rows.length - 1][10] = '-';
      const head = ['No', 'Kecamatan', 'Tersedia (Ha)', 'Tersedia (%)', 'Tidak Tersedia (Ha)', 'Tidak Tersedia (%)', 'Ada HAT (Ha)', 'Ada HAT (%)', 'Belum Ada HAT (Ha)', 'Belum Ada HAT (%)', 'Kepadatan Penduduk (jiwa/km²) - isi manual'];
      const ft = fitTable(40, 120, 1200, 330, head, rows, { cw: [.04, .13, .09, .08, .1, .09, .09, .08, .1, .09, .11], num: [2, 3, 4, 5, 6, 7, 8, 9, 10], sz: 12, rh: 28, tot: 1, maxP: 1, fx: 'sosek' });
      const by = Math.min(Math.max(ft.bottom + 16, 230), 600), best = mrows.reduce((b, o, i) => o.ter > (mrows[b]?.ter ?? -1) ? i : b, -1);
      s.meta = { kind: 'sosek', denCol: 10, rows: mrows.map(o => ({ k: o.k, km2: o.km2, ter: o.ter, terP: o.terP, hat: o.hat, hatP: o.hatP })), best };
      s.els.push(sub(40, 84, 1200, 'Tabel Analisis Sosial Ekonomi (ketersediaan tanah, penguasaan tanah/HAT, kepadatan penduduk - isi kolom terakhir)'), ...ft.els, sub(40, by, 1200, 'Analisis Deskriptif Sosial Ekonomi'), tx(40, by + 36, 1200, Math.max(40, 668 - by - 36), '', { sz: 16, fx: 'sosekText' }));
      sosekRecalc(s);
    }
    S.push(s) }

  // ===== 19. Kesimpulan =====
  { const s = content('KESIMPULAN'), L = [], q3 = top(group(R, r => r.QNAME25), 3), g1 = gu[0], ar1 = arah[0], kb = has('WADMKC') ? group(R, r => r.WADMKC, tersedia)[0] : null;
    L.push(`Perubahan penggunaan tanah sebanyak ${NF(vChg)} Ha (${PC(pctOf(vChg, TOT))}).`);
    if (q3.length) L.push('Tiga penggunaan tanah eksisting dengan proporsi luas terbesar:\n' + q3.map((x, i) => `     ${'abc'[i]}. ${x.k} (${PC(x.p)});`).join('\n'));
    if (g1) L.push(`Gambaran umum penguasaan tanah terbesar adalah ${g1.k} dengan luas ${NF(g1.v)} Ha (${PC(g1.p)}).`);
    L.push(`Kesesuaian penggunaan tanah terhadap RTRW:\n     a. ${PC(ks[0].p)} (Sesuai);\n     b. ${PC(ks[1].p)} (Mendukung);\n     c. ${PC(ks[2].p)} (Tidak Sesuai).`);
    L.push(`Ketersediaan tanah seluas ${NF(vTer)} Ha${ar1 ? ' dengan arahan ketersediaan dominan ' + cleanArahan(ar1.k) : ''}.`);
    L.push(`Potensi pertanian pangan sebesar ${NF(vPangan)} Ha dan sektor lainnya sebesar ${NF(vLain)} Ha.`);
    if (has('TON_C_Q')) L.push(`Potensi cadangan karbon sebesar ${NF(cB)} Ton (perubahan ${SGN(cD)} Ton).`);
    if (kb && kb.k !== '-') L.push(`Potensi sosial ekonomi paling potensial di Kecamatan ${kb.k} (tanah tersedia ${NF(kb.v)} Ha).`);
    s.els.push(tx(60, 92, 1160, 570, L.map((l, i) => `${i + 1}.  ${l}`).join('\n'), { sz: 17 })); S.push(s) }

  // ===== 20. Terima kasih =====
  S.push({ bg: 'cover', els: [tx(100, 215, 760, 90, 'TERIMA KASIH', { sz: 60, b: 1, c: YEL }), tx(144, 349, 475, 58, NAMA, { sz: 26, b: 1, c: '#fff', v: 'middle', al: 'center' })] });
  return { slides: S, info: { nama, tahun, skipped: skip } };
}
