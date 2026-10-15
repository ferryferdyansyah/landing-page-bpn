// data.js - membaca ZIP shapefile (DJPA), agregasi tabel, dan menggambar peta ke gambar PNG.
const NF = n => (+n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PC = n => NF(n) + '%';
const PAL = ['#2b6cb0', '#ed8936', '#38a169', '#d69e2e', '#805ad5', '#e53e3e', '#319795', '#b83280', '#718096', '#a0522d', '#4fd1c5', '#9ae6b4', '#f6ad55', '#667eea', '#fc8181', '#68d391', '#b794f4', '#63b3ed', '#d6bcfa', '#c05621'];

// Baca ZIP shapefile -> baris atribut (huruf besar) + geometri (WGS84). Memanggil prog(persen, teks).
// opt.noGeom: hanya atribut (.dbf) - dipakai untuk HAT yang tidak perlu digambar.
async function readZip(buf, prog, opt = {}) {
  prog(30, 'Membaca geometri & atribut shapefile…');
  const z = await JSZip.loadAsync(buf.slice(0)), names = Object.keys(z.files).filter(n => !z.files[n].dir && !/^__MACOSX/.test(n));
  const find = ext => names.find(n => n.toLowerCase().endsWith(ext));
  const fs_ = find('.shp'), fd = find('.dbf'), fp = find('.prj'), fc_ = find('.cpg');
  if (!fd || (!fs_ && !opt.noGeom)) throw new Error('ZIP harus berisi file .shp dan .dbf');
  const prj = fp ? await z.file(fp).async('string') : '';
  const db = await z.file(fd).async('arraybuffer');
  const cp = fc_ ? (await z.file(fc_).async('string')).trim() : undefined;
  let features;
  if (opt.noGeom) features = shp.parseDbf(db, cp).map(properties => ({ properties, geometry: null }));
  else {
    const sb = await z.file(fs_).async('arraybuffer');
    const CEA = '+proj=cea +lon_0=0 +lat_ts=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';
    const trans = /cylindrical_equal_area/i.test(prj) ? CEA : (/WGS_1984/i.test(prj) && !/PROJCS/i.test(prj)) ? undefined : (prj || undefined);
    let geoms; try { geoms = shp.parseShp(sb, trans) } catch (e) { console.warn('Proyeksi gagal, dianggap WGS84:', e); geoms = shp.parseShp(sb) }
    const sm = geoms.find(g => g && g.coordinates), c0 = JSON.stringify(sm && sm.coordinates).match(/-?\d+\.?\d*/);
    if (c0 && Math.abs(+c0[0]) > 360) throw new Error('Koordinat bukan lon/lat. Reproyeksi dulu ke WGS84 (EPSG:4326).');
    features = shp.combine([geoms, shp.parseDbf(db, cp)]).features;
  }
  prog(70, 'Menyusun tabel atribut…');
  const keys = Object.keys(features[0]?.properties || {}), map = mapCols(keys);
  const NUM = ['LUASHA', 'TON_C_G', 'TON_C_Q', 'TON_C_GQ', 'KDGN_C_G', 'KDGN_C_Q'];
  const rows = features.map(f => {
    const o = {}; for (const k in f.properties) { let v = f.properties[k]; const c = map[k] || k.toUpperCase();
      if (NUM.includes(c)) v = toNum(v); else if (typeof v === 'string') v = v.trim();
      if (CATV[c]) v = canonVal(v, CATV[c]);
      o[c] = v }
    o._g = f.geometry; return o;
  });
  if (!rows.length) throw new Error('Shapefile kosong.');
  rows.cols = new Set(Object.keys(rows[0]).filter(k => k !== '_g'));
  rows.renamed = keys.filter(k => map[k] && map[k] !== k.toUpperCase()).map(k => k + ' → ' + map[k]);
  return rows;
}
// DJPA (poligon hasil integrasi): luas wajib ada.
async function readShapefile(buf, prog) {
  const rows = await readZip(buf, prog);
  if (!rows.cols.has('LUASHA')) throw new Error('Kolom luas tidak ditemukan (dicari: LUASHA / LUAS_HA / LUAS). Kolom yang ada: ' + [...rows.cols].join(', '));
  if (!rows.cols.has('WADMKC')) { rows.forEach(r => r.WADMKC = '-'); rows.cols.add('WADMKC') }
  return rows;
}
// HAT (hak atas tanah): hanya atribut. Kolom dicari longgar: TIPEHAK/TIPE_HAK/HAK..., luas LUAS_HA.
async function readHat(buf, prog) {
  const rows = await readZip(buf, prog, { noGeom: true });
  if (!rows.cols.has('TIPEHAK')) throw new Error('HAT: kolom TIPEHAK tidak ditemukan. Kolom yang ada: ' + [...rows.cols].join(', '));
  if (!rows.cols.has('LUASHA')) throw new Error('HAT: kolom luas (LUAS_HA) tidak ditemukan.');
  if (!rows.cols.has('WADMKC')) rows.forEach(r => r.WADMKC = '-');
  return rows;
}
// TS (titik survei): geometri titik. Jika tidak punya kolom kecamatan, kecamatan ditentukan lewat poligon DJPA (point-in-polygon).
async function readPoints(buf, prog, R) {
  const rows = await readZip(buf, prog);
  const pts = [];
  for (const r of rows) { const g = r._g; if (!g) continue;
    const cs = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : [];
    cs.forEach(c => pts.push({ ...r, _lon: c[0], _lat: c[1] })) }
  if (!pts.length) throw new Error('TS: tidak ada geometri titik di shapefile.');
  const hasKec = rows.cols.has('WADMKC') && pts.some(p => p.WADMKC);
  if (!hasKec) pts.forEach(p => { p.WADMKC = kecOfPoint(R, p._lon, p._lat) || 'Di luar wilayah' });
  // tanggal survei (opsional, kolom apa pun yang namanya mengandung TGL/TANGGAL/DATE/WAKTU)
  const dk = [...rows.cols].find(c => /TGL|TANGGAL|DATE|WAKTU|SURVEY/i.test(c));
  let d0 = null, d1 = null;
  if (dk) pts.forEach(p => { const d = p[dk] instanceof Date ? p[dk] : new Date(p[dk]); if (!isNaN(d) && d.getFullYear() > 2000) { if (!d0 || d < d0) d0 = d; if (!d1 || d > d1) d1 = d } });
  pts.dates = d0 ? [d0, d1] : null; pts.cols = rows.cols; pts.renamed = rows.renamed;
  return pts;
}
// ---------- Geometri bantu ----------
function bboxOf(r) {
  if (r._bb) return r._bb;
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  eachRing(r._g, p => p[0].forEach(([lo, la]) => { a = Math.min(a, lo); b = Math.max(b, lo); c = Math.min(c, la); d = Math.max(d, la) }));
  return r._bb = [a, b, c, d];
}
function eachRing(g, fn) { if (!g) return; const P = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; P.forEach(p => fn(p)) }
function inRings(rings, x, y) { let ins = false; for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins } return ins }
function kecOfPoint(R, lon, lat) {
  for (const r of R) { const b = bboxOf(r); if (lon < b[0] || lon > b[1] || lat < b[2] || lat > b[3]) continue; let hit = false; eachRing(r._g, rings => { if (!hit && inRings(rings, lon, lat)) hit = true }); if (hit) return r.WADMKC }
  return null;
}

// ---------- Pembacaan kolom yang longgar ----------
// Nama kolom dinormalisasi (huruf besar, tanpa spasi/_/-/titik): LUAS_HA = LUASHA, KS_POLA = KSPOLA, Luas Ha = LUASHA.
const CANON = ['TIPEHAK', 'GREKLAS', 'QREKLAS', 'LUASHA', 'WADMKC', 'WADMKK', 'GNAME25', 'QNAME25', 'ONAME25', 'NAMOBJ', 'GQREKLAS', 'GQNAME', 'KSPOLA', 'VNAME', 'V_ARAHAN', 'STD_C_G', 'STD_C_Q', 'TON_C_G', 'TON_C_Q', 'TON_C_GQ', 'KDGN_C_G', 'KDGN_C_Q'];
const ALIAS = { LUAS: 'LUASHA', LUASHEKTAR: 'LUASHA', LUASHA: 'LUASHA', LUASHAREA: 'LUASHA', HA: 'LUASHA', KECAMATAN: 'WADMKC', NAMAKECAMATAN: 'WADMKC', KEC: 'WADMKC', NAMAKEC: 'WADMKC', KABUPATEN: 'WADMKK', KABKOTA: 'WADMKK', KABKOT: 'WADMKK', NAMAKABKOTA: 'WADMKK', KESESUAIAN: 'KSPOLA', KESESUAIANPOLARUANG: 'KSPOLA', KETERSEDIAAN: 'VNAME', ARAHAN: 'V_ARAHAN', POLARUANG: 'NAMOBJ', PENGGUNAANLAMA: 'GNAME25', PENGGUNAANBARU: 'QNAME25', PENGUASAAN: 'ONAME25', ONAME: 'ONAME25', GNAME: 'GNAME25', QNAME: 'QNAME25', QNAME26: 'QNAME25', QNAME24: 'QNAME25', TIPE: 'TIPEHAK', JENISHAK: 'TIPEHAK', HAK: 'TIPEHAK', KSPOLARUANG: 'KSPOLA', VARAHAN: 'V_ARAHAN' };
const nk = x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, '');
function mapCols(keys) {
  const want = {}; CANON.forEach(c => want[nk(c)] = c); Object.entries(ALIAS).forEach(([a, c]) => want[a] = c);
  const map = {}, used = new Set();
  // 1) cocok persis setelah normalisasi, 2) nama terpotong (batas 10 huruf DBF) bila hanya satu kandidat
  keys.forEach(k => { const t = want[nk(k)]; if (t && !used.has(t)) { map[k] = t; used.add(t) } });
  keys.forEach(k => { if (map[k]) return; const n = nk(k); if (n.length < 6) return; const cand = CANON.filter(c => !used.has(c) && nk(c).startsWith(n)); if (cand.length === 1) { map[k] = cand[0]; used.add(cand[0]) } });
  return map;
}
function toNum(v) { if (typeof v === 'number') return isFinite(v) ? v : 0; let s = String(v ?? '').replace(/\s/g, ''); const c = s.lastIndexOf(','), d = s.lastIndexOf('.'); s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); const n = parseFloat(s); return isFinite(n) ? n : 0 }
// Nilai kategori dicocokkan tanpa peduli huruf besar/kecil & spasi (mis. "TIDAK SESUAI", "tersedia ").
const CATV = { GQREKLAS: ['Berubah', 'Tidak Berubah'], VNAME: ['Tersedia', 'Tidak Tersedia'], KSPOLA: ['Sesuai', 'Mendukung', 'Tidak Sesuai'] };
function canonVal(v, opts) { const n = String(v ?? '').toLowerCase().replace(/[^a-z]/g, ''); return opts.find(o => o.toLowerCase().replace(/[^a-z]/g, '') === n) || (typeof v === 'string' ? v.trim() : v) }

// Jumlahkan LUASHA per kunci. keyf(r) -> string|null. Hasil: [{k,v,p}] urut besar -> kecil.
function group(rows, keyf, filt) {
  const m = new Map(); let T = 0;
  for (const r of rows) {
    if (filt && !filt(r)) continue;
    const k = keyf(r); if (k === null || k === undefined || k === '') continue;
    m.set(k, (m.get(k) || 0) + r.LUASHA); T += r.LUASHA;
  }
  return [...m].map(([k, v]) => ({ k, v, p: T ? v / T * 100 : 0 })).sort((a, b) => b.v - a.v);
}
const total = a => a.reduce((s, x) => s + x.v, 0);
const sumBy = (rows, f, filt) => rows.reduce((s, r) => s + ((!filt || filt(r)) ? (+r[f] || 0) : 0), 0);

// ---------- Peta ----------
// Gambar semua poligon ke canvas; warna per kategori. Legenda ikut digambar di dalam gambar.
// ============ Simbologi (dari frontend/assets/simbologi.stylx -> simbologi.js) ============
const SYMDEF = window.SIMBOLOGI || {};
const symKey = t => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ''), SYMIDX = {};
Object.keys(SYMDEF).forEach(n => SYMIDX[symKey(n)] = n);
// Cari simbol berdasarkan nama (toleran huruf besar/kecil & tanda baca; nama panjang boleh memuat nama simbol).
function symFind(name) { const k = symKey(name); if (!k) return null; if (SYMIDX[k]) return SYMIDX[k]; if (k.length >= 10) for (const kk in SYMIDX) if (kk.length >= 10 && (k.endsWith(kk) || kk.endsWith(k))) return SYMIDX[kk]; return null }
// Warna wakil simbol untuk grafik (pie/bar). Simbol yang hanya garis tepi memakai warna cadangan.
function symRep(name, fb) { const n = symFind(name); if (!n) return fb; const d = SYMDEF[n]; return (d.fill || d.hatch.length || d.pic || d.mk) ? d.rep : fb }
const SYMPAT = new Map(), SYMPIC = new Map();
const mkTile = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h)); return c };
function hatchPattern(h) {
  let a = ((h.a % 180) + 180) % 180; a = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 45 : a < 112.5 ? 90 : 135;
  const d = Math.max(3, h.s * 1.4), lw = Math.max(.9, h.w * .9); let t, g;
  if (a === 0) { t = mkTile(d, d); g = t.getContext('2d'); g.fillStyle = h.c; g.fillRect(0, 0, t.width, lw) }
  else if (a === 90) { t = mkTile(d, d); g = t.getContext('2d'); g.fillStyle = h.c; g.fillRect(0, 0, lw, t.height) }
  else { const T = Math.round(d * 1.4142); t = mkTile(T, T); g = t.getContext('2d'); g.strokeStyle = h.c; g.lineWidth = lw; g.beginPath();
    for (const o of [-T, 0, T]) { if (a === 45) { g.moveTo(o, T); g.lineTo(o + T, 0) } else { g.moveTo(o, 0); g.lineTo(o + T, T) } } g.stroke() }
  return t.getContext('2d').createPattern(t, 'repeat');
}
function dotPattern(m) {
  const st = Math.max(6, m.step * 1.3), t = mkTile(st, st), g = t.getContext('2d'); g.fillStyle = m.c; g.beginPath(); g.arc(t.width / 2, t.height / 2, Math.max(1.2, m.size * .28), 0, 7); g.fill();
  return g.createPattern(t, 'repeat');
}
// Pola gambar (BMP -> PNG) perlu dimuat dulu; panggil sekali sebelum menggambar peta.
async function symLoad() {
  await Promise.all(Object.entries(SYMDEF).filter(([, d]) => d.pic).map(([n, d]) => new Promise(ok => {
    const im = new Image(); im.onload = () => { const sz = Math.max(16, (d.pic.step || d.pic.h || im.width) * 1.0), t = mkTile(sz, sz); t.getContext('2d').drawImage(im, 0, 0, t.width, t.height); SYMPIC.set(n, t.getContext('2d').createPattern(t, 'repeat')); ok() };
    im.onerror = ok; im.src = d.pic.src })));
}
// Cat/pola yang dipakai saat menggambar poligon: { fills:[...], stroke:{c,w}|null }
function symPaints(name) {
  if (SYMPAT.has(name)) return SYMPAT.get(name);
  const d = SYMDEF[name], fills = [];
  if (d.fill) fills.push(d.fill);
  d.hatch.forEach(h => fills.push(hatchPattern(h)));
  if (d.pic && SYMPIC.get(name)) fills.push(SYMPIC.get(name));
  if (d.mk) fills.push(dotPattern(d.mk));
  const p = { fills, stroke: d.stroke, sym: true }; SYMPAT.set(name, p); return p;
}

// ============ Muat simbologi langsung dari frontend/assets/simbologi.stylx ============
const STYLX_URL = '../frontend/assets/simbologi.stylx';
const _hx = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
function stylxCol(c) {
  if (!c || !Array.isArray(c.values) || c.values.length < 3) return null;
  const v = c.values; let r, g, b;
  if (/HSV/.test(c.type || '')) {
    const hh = v[0] / 60, s = v[1] / 100, w = v[2] / 100, i = Math.floor(hh) % 6, f = hh - Math.floor(hh), p = w * (1 - s), q = w * (1 - f * s), t = w * (1 - (1 - f) * s);
    [r, g, b] = [[w, t, p], [q, w, p], [p, w, t], [p, q, w], [t, p, w], [w, p, q]][i].map(x => x * 255);
  } else if (/CMYK/.test(c.type || '')) { const k = v[3] / 100;[r, g, b] = [0, 1, 2].map(j => 255 * (1 - v[j] / 100) * (1 - k)); }
  else if (/HSL/.test(c.type || '')) return null;
  else[r, g, b] = v;
  return '#' + _hx(r) + _hx(g) + _hx(b);
}
const stylxImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('gambar simbol tidak terbaca')); im.src = src; });
// BMP 1-bit -> PNG: hitam diganti warna baru, putih jadi transparan (basemap tetap terlihat)
async function stylxBmpToPng(url, subst) {
  const im = await stylxImg(url), w = im.naturalWidth, h = im.naturalHeight; let nb = [0, 0, 0];
  for (const s of subst || []) if ((s.oldColor.values || []).slice(0, 3).every(x => x === 0)) nb = s.newColor.values.slice(0, 3).map(Math.round);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) { if (p[i] + p[i + 1] + p[i + 2] < 384) { p[i] = nb[0]; p[i + 1] = nb[1]; p[i + 2] = nb[2]; p[i + 3] = 255 } else p[i + 3] = 0 }
  g.putImageData(d, 0, 0); return { src: c.toDataURL('image/png'), size: [w, h] };
}
// Satu item ITEMS.CONTENT (JSON CIM) -> spesifikasi simbol (bentuk sama dengan simbologi.js lama)
function stylxSpec(j) {
  const lineOf = sym => { for (const l of (sym || {}).symbolLayers || []) if (l.type === 'CIMSolidStroke') return [stylxCol(l.color), l.width ?? 1]; return [null, 1] };
  const mkColor = l => { for (const a of ((l.symbol || {}).symbolLayers || [])) if (a.type === 'CIMSolidFill' || a.type === 'CIMSolidStroke') return stylxCol(a.color); return '#444444' };
  const spec = { fill: null, stroke: null, hatch: [], pic: null, mk: null, _pic: null };
  for (const l of j.symbolLayers || []) {
    if (l.enable === false) continue; const t = l.type;
    if (t === 'CIMSolidFill' && !spec.fill) spec.fill = stylxCol(l.color);
    else if (t === 'CIMSolidStroke' && !spec.stroke) spec.stroke = { c: stylxCol(l.color), w: l.width ?? 1 };
    else if (t === 'CIMHatchFill') { const [c, w] = lineOf(l.lineSymbol); spec.hatch.push({ a: l.rotation ?? 0, s: l.separation ?? 5, w, c }) }
    else if ((t === 'CIMPictureFill' || t === 'CIMPictureMarker') && !spec._pic && l.url) spec._pic = { url: l.url, subst: l.colorSubstitutions, h: l.height || l.size, step: (l.markerPlacement || {}).stepX };
    else if (t === 'CIMCharacterMarker' && !spec.mk) { const mp = l.markerPlacement || {}; spec.mk = { c: mkColor(l), size: l.size ?? 5, step: mp.stepX ?? 6, ch: l.characterIndex, font: l.fontFamilyName } }
  }
  return spec;
}
let _stylxP = null;
// Panggil sekali sebelum buildSlides(); aman dipanggil berulang (di-cache). Mengisi SYMDEF/SYMIDX yang dipakai peta & legenda.
function loadSimbologi() {
  if (_stylxP) return _stylxP;
  return _stylxP = (async () => {
    const SQL = await initSqlJs({ locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/' + f });
    const r = await fetch(STYLX_URL); if (!r.ok) throw new Error('simbologi.stylx tidak ditemukan (HTTP ' + r.status + ')');
    const db = new SQL.Database(new Uint8Array(await r.arrayBuffer())), res = db.exec('SELECT NAME, CONTENT FROM ITEMS'); db.close();
    const out = {};
    for (const [name, c] of (res[0] ? res[0].values : [])) {
      let spec; try { spec = stylxSpec(JSON.parse((typeof c === 'string' ? c : new TextDecoder().decode(c)).replace(/\0+$/, ''))) } catch (e) { continue }
      if (spec._pic) { try { const p = await stylxBmpToPng(spec._pic.url, spec._pic.subst); spec.pic = { src: p.src, px: p.size[0], h: spec._pic.h || p.size[1], step: spec._pic.step } } catch (e) { console.warn('Simbol gambar dilewati:', name, e) } }
      delete spec._pic;
      spec.rep = (spec.hatch[0] && spec.hatch[0].c) || spec.fill || (spec.stroke && spec.stroke.c) || (spec.mk && spec.mk.c) || (spec.pic ? '#666666' : '#999999');
      out[name] = spec;
    }
    Object.keys(SYMDEF).forEach(k => delete SYMDEF[k]); Object.assign(SYMDEF, out);
    Object.keys(SYMIDX).forEach(k => delete SYMIDX[k]); Object.keys(SYMDEF).forEach(n => SYMIDX[symKey(n)] = n);
    SYMPAT.clear(); SYMPIC.clear();
    return Object.keys(SYMDEF).length;
  })().catch(e => { _stylxP = null; throw e });
}

// ============ Basemap (tile satelit) ============
const BASEMAPS = {
  google: { name: 'Google Satelit', url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', sub: '0123', attr: 'Imagery © Google', maxZ: 20 },
  esri: { name: 'Esri World Imagery', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', sub: '', attr: 'Imagery © Esri, Maxar, Earthstar Geographics', maxZ: 19 }
};
const BASEMAP = { ready: null };
const mercU = lo => (lo + 180) / 360, mercV = la => { const r = la * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 };
function bboxAll(rows) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const r of rows) { const b = bboxOf(r); if (b[0] > b[1]) continue; x0 = Math.min(x0, b[0]); x1 = Math.max(x1, b[1]); y0 = Math.min(y0, b[2]); y1 = Math.max(y1, b[3]) } return [x0, x1, y0, y1] }
const loadTile = (url, ms) => new Promise(ok => { const im = new Image(); im.crossOrigin = 'anonymous'; const t = setTimeout(() => { im.src = ''; ok(null) }, ms); im.onload = () => { clearTimeout(t); ok(im) }; im.onerror = () => { clearTimeout(t); ok(null) }; im.src = url });
// Satu mosaik tile yang menutupi seluruh wilayah (+ margin) pada satu level zoom; semua peta memakai mosaik ini.
async function buildMosaic(rows, id, prog) {
  const P = BASEMAPS[id], [x0, x1, y0, y1] = bboxAll(rows), u0 = mercU(x0), u1 = mercU(x1), v0 = mercV(y1), v1 = mercV(y1 === y0 ? y1 : y0);
  const span = Math.max(u1 - u0, v1 - v0, 1e-6), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, half = span * 1.3;
  const z = Math.max(5, Math.min(P.maxZ, Math.floor(Math.log2(4096 / (2.6 * span * 256))))), n = 2 ** z;
  const tx0 = Math.max(0, Math.floor((cu - half) * n)), tx1 = Math.min(n - 1, Math.floor((cu + half) * n)), ty0 = Math.max(0, Math.floor((cv - half) * n)), ty1 = Math.min(n - 1, Math.floor((cv + half) * n));
  const cnv = document.createElement('canvas'); cnv.width = (tx1 - tx0 + 1) * 256; cnv.height = (ty1 - ty0 + 1) * 256; const g = cnv.getContext('2d');
  const urlOf = (x, y, i) => P.url.replace('{s}', P.sub ? P.sub[i % P.sub.length] : '').replace('{x}', x).replace('{y}', y).replace('{z}', z);
  // uji satu tile dulu: kalau ditolak (CORS/blokir) langsung dianggap gagal agar cepat pindah ke penyedia lain
  const tc = await loadTile(urlOf(Math.floor(cu * n), Math.floor(cv * n), 0), 9000); if (!tc) return null;
  const jobs = []; for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) jobs.push([x, y]);
  let done = 0, ok = 0, k = 0;
  const worker = async () => { while (k < jobs.length) { const [x, y] = jobs[k], i = k++; const im = await loadTile(urlOf(x, y, i), 12000); if (im) { try { g.drawImage(im, (x - tx0) * 256, (y - ty0) * 256, 256, 256); ok++ } catch (e) { } } done++; if (prog) prog(done, jobs.length) } };
  await Promise.all(Array.from({ length: 10 }, worker));
  if (ok < jobs.length * .5) return null;
  try { g.getImageData(0, 0, 1, 1) } catch (e) { return null }
  return { canvas: cnv, u0: tx0 / n, v0: ty0 / n, S: 256 * n, w: cnv.width, h: cnv.height, id, z, attr: P.attr, tiles: ok + '/' + jobs.length };
}
// provider: 'google' | 'esri' | 'none'. Google gagal (mis. diblokir) -> otomatis coba Esri.
async function prepareBasemap(rows, provider, prog) {
  BASEMAP.ready = null; await symLoad();
  if (provider === 'none') return { used: 'none' };
  for (const id of provider === 'esri' ? ['esri'] : ['google', 'esri']) { let m = null; try { m = await buildMosaic(rows, id, prog) } catch (e) { console.warn('Basemap', id, e) } if (m) { BASEMAP.ready = m; return { used: id, fallback: id !== provider, tiles: m.tiles, z: m.z } } }
  return { used: null };
}

// ============ Gambar peta ============
function renderMap(rows, colorOf, legend, opt = {}) {
  const W = opt.w || 1000, H = opt.h || 800, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), B = opt.nobase ? null : BASEMAP.ready;
  x.fillStyle = '#eaf4fb'; x.fillRect(0, 0, W, H);
  const [x0, x1, y0, y1] = bboxAll(rows), u0 = mercU(x0), u1 = mercU(x1), v0 = mercV(y1), v1 = mercV(y0);
  const pad = 24, withAdmin = opt.admin !== false, lw = legend && legend.length ? (opt.lw || 300) : 0, mc = Math.floor((lw - 50) / 7.2);
  const aw = W - pad * 2 - lw, ah = H - pad * 2, s = Math.min(aw / (u1 - u0), ah / (v1 - v0));
  const ox = pad + (aw - (u1 - u0) * s) / 2, oy = pad + (ah - (v1 - v0) * s) / 2;
  const P = ([lo, la]) => [ox + (mercU(lo) - u0) * s, oy + (mercV(la) - v0) * s];
  if (B) { // basemap: ambil bagian mosaik yang sesuai dengan area kanvas
    const wu = u0 - ox / s, wv = v0 - oy / s, sx = (wu - B.u0) * B.S, sy = (wv - B.v0) * B.S, sw = W / s * B.S, sh = H / s * B.S, kk = W / sw;
    const ix0 = Math.max(sx, 0), iy0 = Math.max(sy, 0), ix1 = Math.min(sx + sw, B.w), iy1 = Math.min(sy + sh, B.h);
    if (ix1 > ix0 && iy1 > iy0) x.drawImage(B.canvas, ix0, iy0, ix1 - ix0, iy1 - iy0, (ix0 - sx) * kk, (iy0 - sy) * kk, (ix1 - ix0) * kk, (iy1 - iy0) * kk);
  }
  const cache = new Map(), paintFor = v => { let p = cache.get(v); if (!p) { p = typeof v === 'string' && v.startsWith('sym:') ? symPaints(v.slice(4)) : { fills: [v], stroke: null, plain: true }; cache.set(v, p) } return p };
  if (opt.parcels !== false) for (const r of rows) {
    const p = paintFor(colorOf(r));
    eachRing(r._g, rings => {
      x.beginPath(); rings.forEach(ring => ring.forEach((pt, i) => { const [px, py] = P(pt); i ? x.lineTo(px, py) : x.moveTo(px, py) }));
      if (p.fills.length) { x.globalAlpha = p.plain && B ? .72 : 1; p.fills.forEach(f => { x.fillStyle = f; x.fill('evenodd') }); x.globalAlpha = 1 }
      if (p.stroke) { x.strokeStyle = p.stroke.c; x.lineWidth = Math.max(.3, p.stroke.w * .8); x.stroke() } else if (p.plain) { x.strokeStyle = B ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.25)'; x.lineWidth = .4; x.stroke() }
    });
  }
  // batas administrasi: kabupaten/kota (tebal) dan kecamatan (tipis) dengan teknik "halo" di luar poligon
  const kecs = new Map(); rows.forEach(r => { const k = r.WADMKC; if (k && k !== '-') (kecs.get(k) || kecs.set(k, []).get(k)).push(r) });
  const cKab = B ? '#ffd400' : '#0f172a', cKec = B ? '#ffffff' : '#475569';
  if (withAdmin) {
    // Cincin di luar tiap grup: mask (setengah resolusi) digeser ke segala arah lalu dikurangi mask asli. Jauh lebih cepat daripada stroke ratusan ribu simpul.
    const hw = Math.ceil(W / 2), hh = Math.ceil(H / 2), mkc = document.createElement('canvas'), rgc = document.createElement('canvas'); mkc.width = rgc.width = hw; mkc.height = rgc.height = hh;
    const mg = mkc.getContext('2d'), rg = rgc.getContext('2d');
    const halo = (rs, color, out) => {
      mg.clearRect(0, 0, hw, hh); mg.fillStyle = '#000';
      for (const r of rs) eachRing(r._g, rings => { mg.beginPath(); rings.forEach(ring => { ring.forEach((pt, i) => { const [px, py] = P(pt); i ? mg.lineTo(px / 2, py / 2) : mg.moveTo(px / 2, py / 2) }); mg.closePath() }); mg.fill('evenodd') });
      for (let i = 0; i < 3; i++) mg.drawImage(mkc, 0, 0); // pertegas tepi agar celah antar-persil tertutup
      rg.globalCompositeOperation = 'source-over'; rg.clearRect(0, 0, hw, hh); const R = out / 2;
      for (const [r, n] of [[R, 12], [R * .5, 8]]) for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; rg.drawImage(mkc, r * Math.cos(t), r * Math.sin(t)) }
      rg.globalCompositeOperation = 'destination-out'; rg.drawImage(mkc, 0, 0); for (let i = 0; i < 8; i++) { const t = i / 8 * Math.PI * 2; rg.drawImage(mkc, .5 * Math.cos(t), .5 * Math.sin(t)) }
      rg.globalCompositeOperation = 'source-in'; rg.fillStyle = color; rg.fillRect(0, 0, hw, hh); rg.globalCompositeOperation = 'source-over';
      x.drawImage(rgc, 0, 0, hw, hh, 0, 0, W, H);
    };
    if (kecs.size > 1) kecs.forEach(rs => halo(rs, cKec, 3.5));
    halo(rows, cKab, 6);
    if (kecs.size > 1 && kecs.size <= 40 && opt.labels !== false) { x.font = 'bold 13px sans-serif'; x.textAlign = 'center'; x.lineJoin = 'round';
      kecs.forEach((rs, k) => { const b = bboxAll(rs), [lx, ly] = P([(b[0] + b[1]) / 2, (b[2] + b[3]) / 2]); x.strokeStyle = B ? 'rgba(0,0,0,.8)' : 'rgba(255,255,255,.9)'; x.lineWidth = 3.5; x.strokeText(k, lx, ly); x.fillStyle = B ? '#fff' : '#10243a'; x.fillText(k, lx, ly) }) }
  }
  if (opt.pts) opt.pts.forEach(q => { const [px, py] = P([q._lon, q._lat]); x.beginPath(); x.arc(px, py, opt.pr || 6, 0, 7); x.fillStyle = opt.pc || '#e53e3e'; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke() });
  // utara
  x.fillStyle = B ? '#fff' : '#10243a'; x.strokeStyle = B ? '#000' : '#fff'; x.lineWidth = 3; x.font = 'bold 22px sans-serif'; x.textAlign = 'center'; x.strokeText('U', 40, 40); x.fillText('U', 40, 40);
  x.beginPath(); x.moveTo(40, 48); x.lineTo(30, 78); x.lineTo(40, 70); x.lineTo(50, 78); x.closePath(); x.stroke(); x.fill();
  if (B) { x.font = '11px sans-serif'; x.textAlign = 'left'; const tw = x.measureText(B.attr).width + 10; x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, H - 18, tw, 18); x.fillStyle = '#fff'; x.fillText(B.attr, 5, H - 5) }
  if (lw) {
    const items = [...legend]; if (withAdmin) { items.push({ k: 'Batas Kabupaten/Kota', line: cKab, lw: 4 }); if (kecs.size > 1) items.push({ k: 'Batas Kecamatan', line: B ? '#fff' : cKec, lw: 2 }) }
    const lx = W - lw - 4, rowH = 24, hh = Math.min(H - 20, items.length * rowH + 40);
    x.fillStyle = '#fff'; x.strokeStyle = '#9fb2c4'; x.lineWidth = 1; x.fillRect(lx, 10, lw, hh); x.strokeRect(lx, 10, lw, hh);
    x.textAlign = 'left'; x.font = 'bold 15px sans-serif'; x.fillStyle = '#10243a'; x.fillText('KETERANGAN', lx + 10, 32); x.font = '14px sans-serif';
    items.forEach((l, i) => { const y = 44 + i * rowH;
      if (l.line) { x.fillStyle = B ? '#444' : '#fff'; x.fillRect(lx + 10, y + 4, 22, 6); x.fillStyle = l.line; x.fillRect(lx + 10, y + 7 - l.lw / 2, 22, l.lw) }
      else { const p = paintFor(l.c); x.fillStyle = '#fff'; x.fillRect(lx + 10, y, 22, 14); p.fills.forEach(f => { x.fillStyle = f; x.fillRect(lx + 10, y, 22, 14) });
        if (!p.fills.length && p.stroke) { x.strokeStyle = p.stroke.c; x.lineWidth = 1.5; x.strokeRect(lx + 11, y + 1, 20, 12) } else { x.strokeStyle = '#555'; x.lineWidth = 1; x.strokeRect(lx + 10, y, 22, 14) } }
      x.fillStyle = '#10243a'; x.fillText(l.k.length > mc ? l.k.slice(0, mc - 1) + '…' : l.k, lx + 40, y + 12) });
  }
  return c.toDataURL('image/jpeg', 0.9);
}
// Peta berwarna per kategori; kategori terbesar memakai simbol stylx bila namanya cocok, sisanya palet.
function catMap(rows, keyf, maxCat = 11, opt) {
  const g = group(rows, keyf), col = new Map(); g.slice(0, maxCat).forEach((x, i) => col.set(x.k, symFind(x.k) ? 'sym:' + symFind(x.k) : PAL[i % PAL.length]));
  const leg = g.slice(0, maxCat).map(x => ({ k: x.k, c: col.get(x.k) })); if (g.length > maxCat) leg.push({ k: 'Lainnya', c: '#cbd5e0' });
  return renderMap(rows, r => col.get(keyf(r)) || '#cbd5e0', leg, opt);
}
// Peta dengan warna/simbol tetap per nilai (mis. Sesuai/Tidak Sesuai).
function fixedMap(rows, keyf, colors, opt) {
  const cv = k => symFind(k) ? 'sym:' + symFind(k) : colors[k];
  return renderMap(rows, r => { const k = keyf(r); return k in colors ? cv(k) : '#cbd5e0' }, Object.keys(colors).map(k => ({ k, c: cv(k) })), opt);
}
