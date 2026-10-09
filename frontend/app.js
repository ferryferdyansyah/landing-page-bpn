const $ = s => document.querySelector(s);
const root = document.documentElement;
function chartTheme() {
    const d = root.dataset.theme === 'dark';
    Chart.defaults.color = d ? '#8aa09c' : '#5f716e';
    Chart.defaults.borderColor = d ? '#213031' : '#dfe6e4';
}
chartTheme();
$('#theme').onclick = () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.theme = root.dataset.theme } catch (e) { }
    chartTheme();
    if (rows.length) render(true);
};
const ic = p => `<svg class="i" viewBox="0 0 24 24">${p}</svg>`;
const TABS = {
    ring: { t: 'Ringkasan', i: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>', c: r => r.b },
    lama: { t: 'Penggunaan Lama', i: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>', c: r => r.g },
    baru: { t: 'Penggunaan Baru', i: '<path d="m12 2 10 5-10 5L2 7z"/><path d="M2 12l10 5 10-5"/>', c: r => r.q },
    ubah: { t: 'Perubahan', i: '<path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>', c: r => r.g === r.q ? 'Tidak Berubah' : 'Berubah' },
    rtrw: { t: 'Kesesuaian RTRW', i: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', c: r => r.ks },
    gupt: { t: 'GUPT', i: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h6"/>', c: r => r.o },
    ket: { t: 'Ketersediaan Tanah', i: '<path d="M20 6 9 17l-5-5"/>', c: r => r.v },
    pot: { t: 'Potensi Sektoral', i: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>', c: r => sekX(r.a) || 'Tidak ada potensi sektoral' },
    pan: { t: 'Potensi Pangan', i: '<path d="M2 22c1.25-.99 2.5-1.5 4-1.5S8.75 21 10 22"/><path d="M12 2v14"/><path d="M12 6c-2 0-4 1-4 3 2 0 4-1 4-3zM12 6c2 0 4 1 4 3-2 0-4-1-4-3zM12 11c-2 0-4 1-4 3 2 0 4-1 4-3zM12 11c2 0 4 1 4 3-2 0-4-1-4-3z"/>', c: r => sek(r.a) === PANGAN ? PANGAN : 'Bukan pertanian pangan' },
    kar: { t: 'Cadangan Karbon', i: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.4-6"/>', c: r => r.cq < r.cg ? 'Menurun' : r.cq > r.cg ? 'Meningkat' : 'Tetap' }
};
let rows = [], tab = 'ring', kecSel = '', kabSel = '', bb = {}, groups = [], kb = {}, allB = null, charts = [];
const fixed = { 'tidak berubah': '#22c55e', 'berubah': '#ef4444', 'sesuai': '#22c55e', 'tidak sesuai': '#ef4444', 'mendukung': '#eab308', 'tersedia': '#22c55e', 'tidak tersedia': '#ef4444', 'menurun': '#ef4444', 'meningkat': '#22c55e', 'tetap': '#94a3b8', 'pertanian pangan': '#22c55e', 'bukan pertanian pangan': '#94a3b8', 'tidak ada potensi sektoral': '#94a3b8' };
const custom = {}; let op = .6, outline = true, hid = {}, styles = [], lgKeys = [];
const cx = document.createElement('canvas').getContext('2d');
const hex = c => { cx.fillStyle = c; return cx.fillStyle };
function col(s) { if (custom[s] && custom[s].f) return custom[s].f; const k = String(s).toLowerCase(); if (fixed[k]) return fixed[k]; let h = 0; for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360},62%,52%)` }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fm = (n, d = 2) => n.toLocaleString('id-ID', { maximumFractionDigits: d });
const vis = r => (!kabSel || r.b === kabSel) && (!kecSel || r.k === kecSel);
const V = () => kabSel || kecSel ? rows.filter(vis) : rows;

/* Peta */
const map = L.map('map', { preferCanvas: true, zoomControl: true }).setView([-2.5, 118], 5);
const LIVE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const WB = n => `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/${n}/{z}/{y}/{x}`;
const mkBase = n => L.tileLayer(n ? WB(n) : LIVE, { maxZoom: 19, maxNativeZoom: n ? 17 : 19, attribution: 'Imagery &copy; Esri' });
let base = mkBase().addTo(map);

fetch('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json')
    .then(r => r.json())
    .then(cfg => {
        const list = Object.entries(cfg)
            .map(([n, v]) => ({ n, d: (/\d{4}-\d{2}-\d{2}/.exec(v.itemTitle) || [])[0] }))
            .filter(x => x.d).sort((a, b) => b.d.localeCompare(a.d));
        $('#bm').innerHTML = '<option value="">Citra terbaru</option>' + list.map(x => `<option value="${x.n}">${x.d}</option>`).join('');
        $('#bm').disabled = false;
    })
    .catch(() => { $('#bm').title = 'Daftar tahun gagal dimuat'; });

$('#bm').onchange = e => {
    map.removeLayer(base);
    base = mkBase(e.target.value).addTo(map);
    base.bringToBack();
};
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
const cv = L.canvas({ padding: .3 });
const setOp = () => { if (cv._container) cv._container.style.opacity = op };
const isHid = (r, c) => !vis(r) || (hid[tab] && hid[tab].has(c));
function st(f) {
    const r = rows[f.properties.__i], c = TABS[tab].c(r);
    if (isHid(r, c)) return { stroke: false, fillOpacity: 0 };
    const u = custom[c] || {};
    return { stroke: false, fillColor: u.h ? (u.p || (u.p = mkPat(u.h))) : u.pf && u.pf.t ? (u.p || (u.p = mkPic(u.pf))) : col(c), fillOpacity: op }
}
function mkPat(h) {
    const sp = Math.max(3, (h.sp || 3) * 1.33), t = document.createElement('canvas'); t.width = 16; t.height = Math.ceil(sp);
    const g = t.getContext('2d'); g.strokeStyle = h.c; g.lineWidth = Math.max(.8, (h.w || 1) * 1.33); g.beginPath(); g.moveTo(0, sp / 2); g.lineTo(16, sp / 2); g.stroke();
    const p = cx.createPattern(t, 'repeat'); p.setTransform && p.setTransform(new DOMMatrix().rotate(-(h.r || 0))); return p
}
const app = (k, x) => { custom[k] = { f: x.f, s: x.s, w: x.w, h: x.h, pf: x.pf } };
function mkPic(pf) { const p = cx.createPattern(pf.t, 'repeat'); p.setTransform && p.setTransform(new DOMMatrix().rotate(-(pf.r || 0))); return p }
async function prep(x) {
    const p = x.pf, im = new Image(); im.src = p.u; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4)for (const [o, n] of p.sub) if (Math.abs(a[i] - o[0]) + Math.abs(a[i + 1] - o[1]) + Math.abs(a[i + 2] - o[2]) < 90) { a[i] = n[0]; a[i + 1] = n[1]; a[i + 2] = n[2]; a[i + 3] = n[3] * 2.55; break }
    g.putImageData(d, 0, 0);
    const H = (p.mk ? p.size : p.h) * 1.33, W = H * im.width / im.height * (p.sx || 1), S = p.mk ? Math.round(p.step * 1.33) : 0, t = document.createElement('canvas');
    t.width = Math.max(2, Math.round(p.mk ? S : W)); t.height = Math.max(2, Math.round(p.mk ? S : H));
    const k = t.getContext('2d'); k.imageSmoothingEnabled = false;
    if (p.mk) k.drawImage(c, (S - W) / 2, (S - H) / 2, W, H); else k.drawImage(c, 0, 0, t.width, t.height);
    p.t = t
}
const setProg = (t, p) => { $('#lt').textContent = t; $('#lb').style.width = p + '%' };
const tick = () => new Promise(r => setTimeout(r));

/* Baca ZIP: coba cara standar, jika proyeksi .prj tidak dikenali pakai jalur manual */
const CEA = '+proj=cea +lon_0=0 +lat_ts=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';
async function readShp(buf) {
    try { return await shp(buf) } catch (err) { console.warn('shpjs standar gagal, pakai jalur manual:', err) }
    const z = await JSZip.loadAsync(buf), names = Object.keys(z.files);
    const find = ext => names.find(n => n.toLowerCase().endsWith(ext) && !z.files[n].dir);
    const fs_ = find('.shp'), fd = find('.dbf');
    if (!fs_) throw new Error('File .shp tidak ada di dalam ZIP');
    const fp = find('.prj'), fc = find('.cpg');
    const prj = fp ? await z.file(fp).async('string') : '';
    const sb = await z.file(fs_).async('arraybuffer');
    const db = fd ? await z.file(fd).async('arraybuffer') : null;
    const cp = fc ? (await z.file(fc).async('string')).trim() : undefined;
    let trans;
    if (/cylindrical_equal_area/i.test(prj)) trans = CEA;
    else if (/GCS_WGS_1984|WGS_1984/i.test(prj) && !/PROJCS/i.test(prj)) trans = undefined;
    else trans = prj || undefined;
    let geoms;
    try { geoms = shp.parseShp(sb, trans) } catch (e) { console.warn('Proyeksi gagal, dianggap WGS84:', e); geoms = shp.parseShp(sb) }
    const sample = geoms.find(x => x && x.coordinates);
    const c = JSON.stringify(sample && sample.coordinates).match(/-?\d+\.?\d*/);
    if (c && Math.abs(+c[0]) > 360) throw new Error('Koordinat bukan lon/lat. Reproyeksi dulu ke WGS84 (EPSG:4326) di QGIS.');
    return db ? shp.combine([geoms, shp.parseDbf(db, cp)]) : { type: 'FeatureCollection', features: geoms.map(g => ({ type: 'Feature', properties: {}, geometry: g })) };
}

/* Muat file */
async function load(file) {
    if (!file) return;
    $('#empty').style.display = 'none'; $('#load').style.display = 'flex'; setProg('Membaca shapefile...', 5);
    try {
        await tick();
        let g = await readShp(await file.arrayBuffer());
        if (Array.isArray(g)) g = { type: 'FeatureCollection', features: g.flatMap(x => x.features) };
        const fs = g.features.filter(f => f.geometry);
        if (!fs.length) throw new Error('Tidak ada geometri');
        const km = {}; Object.keys(fs[0].properties || {}).forEach(k => km[k.toUpperCase()] = k);
        const need = ['WADMKC', 'GNAME25', 'QNAME25', 'KSPOLA', 'ONAME25', 'VNAME', 'LUASHA'];
        const miss = need.filter(k => !km[k]);
        if (miss.length) alert('Kolom tidak ditemukan: ' + miss.join(', ') + '. Analisis terkait akan kosong.');
        groups.forEach(x => map.removeLayer(x)); groups = []; hid = {}; kb = {}; bb = {}; allB = null; rows = new Array(fs.length);
        const I = new Map(), nm = v => parseFloat(v) || 0, gt = (p, k) => { let v = p[km[k]]; v = v == null || v === '' ? '(kosong)' : String(v).trim(); let x = I.get(v); if (!x) I.set(v, x = v); return x };
        for (let i = 0; i < fs.length; i++) {
            const p = fs[i].properties || {};
            rows[i] = { k: gt(p, 'WADMKC'), g: gt(p, 'GNAME25'), q: gt(p, 'QNAME25'), ks: gt(p, 'KSPOLA'), o: gt(p, 'ONAME25'), v: gt(p, 'VNAME'), b: gt(p, 'WADMKK'), n: gt(p, 'NAMOBJ'), a: gt(p, 'V_ARAHAN'), l: nm(p[km.LUASHA]), cg: nm(p[km.TON_C_G]), cq: nm(p[km.TON_C_Q]) };
            fs[i].properties = { __i: i }
        }
        const N = 4000;
        for (let s = 0; s < fs.length; s += N) {
            const lg = L.geoJSON({ type: 'FeatureCollection', features: fs.slice(s, s + N) }, {
                style: st, renderer: cv, onEachFeature: (f, l) => {
                    const r = rows[f.properties.__i]; const b = l.getBounds();
                    (kb[r.k] = kb[r.k] || L.latLngBounds(b)).extend(b); (bb[r.b] = bb[r.b] || L.latLngBounds(b)).extend(b);
                    l.on('click', e => {
                        if (isHid(r, TABS[tab].c(r))) return;
                        L.popup().setLatLng(e.latlng).setContent(`<b>${esc(r.k)}</b><br>Lama: ${esc(r.g)}<br>Baru: ${esc(r.q)}<br>RTRW: ${esc(r.ks)}<br>GUPT: ${esc(r.o)}<br>Ketersediaan: ${esc(r.v)}<br>Luas: ${fm(r.l, 4)} ha`).openOn(map)
                    })
                }
            }).addTo(map);
            groups.push(lg);
            if (s === 0) { allB = lg.getBounds(); map.fitBounds(allB) } else allB.extend(lg.getBounds());
            setProg(`Menggambar ${Math.min(s + N, fs.length).toLocaleString('id-ID')} / ${fs.length.toLocaleString('id-ID')} fitur`, 10 + 90 * Math.min(s + N, fs.length) / fs.length);
            await tick()
        }
        if (allB) map.fitBounds(allB);
        const bs = [...new Set(rows.map(r => r.b))].sort((a, b) => a.localeCompare(b));
        $('#kab').innerHTML = '<option value="">Semua kabupaten</option>' + bs.map(k => `<option>${esc(k)}</option>`).join('');
        $('#kab').disabled = false; $('#kec').disabled = false; kabSel = kecSel = ''; $('#kab').disabled = false; $('#kec').disabled = false; kabSel = kecSel = '';
        await stylxReady; autoMatch();      // <-- tambahan: cocokkan simbol dengan kategori data yang baru dimuat
        fillKec(); render();
    } catch (e) { console.error(e); alert('Gagal membaca file: ' + e.message); if (!rows.length) $('#empty').style.display = 'flex' }
    $('#load').style.display = 'none';
}

/* Analisis */
const PANGAN = 'Pertanian Pangan';
// Urutan penting: pencocokan berhenti di sektor pertama yang cocok. Tambah kata kunci di sini bila istilah RTRW/RDTR daerah berbeda.
const SEK = [
    ['Pertambangan', /tambang|mineral|batu ?bara|galian|migas|minyak|gas bumi|panas bumi|quarry|\bwi?up\b/i],
    ['Industri', /industri|pergudangan|pabrik|manufaktur|\bkip\b|\bkek\b/i],
    ['Pariwisata', /wisata|rekreasi|resort|daya tarik|taman hiburan/i],
    ['Perkebunan', /kebun|tanaman tahunan|sawit|karet|kopi|kakao|coklat|cokelat|tebu|cengkeh|kelapa|\bteh\b|tembakau/i],
    ['Permukiman/Perumahan', /permukiman|pemukiman|perumahan|hunian|rumah(?! sakit)|rusun|tempat tinggal|kasiba|lisiba/i],
    [PANGAN, /pangan|sawah|padi|palawija|lp2b|kp2b|lahan basah|hortikultura|pertanian|tegalan|ladang|semusim|lumbung/i]
];
const sek = a => { const m = /Tersedia untuk (?:Kawasan |Peruntukan )*(.+?)(?: sesuai| dalam|$)/i.exec(a); if (!m) return null; for (const [n, re] of SEK) if (re.test(m[1])) return n; return 'Lainnya' };
const sekX = a => { const x = sek(a); return x === PANGAN ? null : x }; // sektor selain pangan
const isT = r => /^tersedia$/i.test(r.v), isUn = r => r.ks.toLowerCase() === 'tidak sesuai', isBel = r => /belum terdaftar/i.test(r.o);
const lv = () => new Set(V().map(r => r.b)).size > 1 ? 'b' : 'k', LN = k => k === 'b' ? 'Kabupaten/Kota' : 'Kecamatan';
const pc = (a, b) => fm(b ? a / b * 100 : 0, 1) + '%', add = (rs, f) => rs.reduce((a, r) => a + f(r), 0);
function dom(fn, kf = 'k', rs = V()) {
    const m = new Map();
    for (const r of rs) { let a = m.get(r[kf]); if (!a) m.set(r[kf], a = new Map()); const c = fn(r); a.set(c, (a.get(c) || 0) + r.l) }
    return [...m].map(([k, a]) => { let b, bv = -1, t = 0; for (const [c, v] of a) { t += v; if (v > bv) { bv = v; b = c } } return { k, c: b, v: bv, t } }).sort((x, y) => x.k.localeCompare(y.k))
}
function sum(fn, rs = V(), w = r => r.l) { const m = new Map(); for (const r of rs) { const c = fn(r); if (c == null) continue; m.set(c, (m.get(c) || 0) + w(r)) } return m }
const sorted = m => [...m].sort((a, b) => b[1] - a[1]);
const tbl = (h, b) => `<div class="tw"><table><thead><tr>${h.map(x => `<th class="${x[1] ? 'n' : ''}">${x[0]}</th>`).join('')}</tr></thead><tbody>${b}</tbody></table></div>`;
const sw = s => `<span class="sw" style="background:${col(s)}"></span>${esc(s)}`;
const box = (t, inner) => `<div class="box"><h3>${t}</h3>${inner}</div>`;
const chart = id => `<div class="ch"><canvas id="${id}"></canvas></div>`;
const none = '<p class="mu">Tidak ada data untuk analisis ini.</p>';
function mk(id, type, ent, label = 'Luas (ha)') {
    const horiz = type === 'bar';
    charts.push(new Chart($('#' + id), {
        type: horiz ? 'bar' : 'doughnut', data: { labels: ent.map(e => e[0]), datasets: [{ label, data: ent.map(e => +e[1].toFixed(2)), backgroundColor: ent.map(e => col(e[0])), borderWidth: horiz ? 0 : 1 }] },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: horiz ? 'y' : 'x', plugins: { legend: { display: !horiz, position: 'bottom', labels: { boxWidth: 10 } } }, scales: horiz ? { x: { title: { display: true, text: label } }, y: { ticks: { callback(v) { const l = this.getLabelForValue(v); return l.length > 28 ? l.slice(0, 27) + '…' : l } } } } : {} }
    }))
}
function cross(title, kf, cf, rs = V()) {
    const cats = sorted(sum(cf, rs)).map(x => x[0]), m = new Map();
    for (const r of rs) { const c = cf(r); if (c == null) continue; let a = m.get(r[kf]); if (!a) m.set(r[kf], a = {}); a[c] = (a[c] || 0) + r.l }
    return box(title, tbl([[LN(kf)], ...cats.map(c => [esc(c) + ' (ha, %)', 1])], [...m].sort((x, y) => x[0].localeCompare(y[0])).map(([k, a]) => {
        const t = add(cats, c => a[c] || 0);
        return `<tr><td>${esc(k)}</td>${cats.map(c => `<td class="n">${fm(a[c] || 0)}<br><small class="mu">${pc(a[c] || 0, t)}</small></td>`).join('')}</tr>`
    }).join('')))
}

function dominantView(field, title, fn) {
    const d = dom(fn); if (!d.length) return none;
    const top = d.reduce((a, b) => b.v > a.v ? b : a), kf = lv(), cnt = new Map(); d.forEach(x => cnt.set(x.c, (cnt.get(x.c) || 0) + 1));
    const all = sorted(sum(fn)), T = add(all, x => x[1]), main = sorted(cnt)[0], dk = kf === 'b' ? dom(fn, 'b') : [];
    setTimeout(() => { mk('c1', 'pie', sorted(cnt), 'Jumlah kecamatan'); mk('c2', 'bar', all.slice(0, 10).map(([k, v]) => [k, v / T * 100]), 'Persen luas (%)') });
    const row = x => `<tr><td>${esc(x.k)}</td><td>${sw(x.c)}</td><td class="n">${fm(x.v)}</td><td class="n">${pc(x.v, x.t)}</td></tr>`, hd = [['Wilayah'], ['Penggunaan Tanah'], ['Luas (ha)', 1], ['% Wilayah', 1]];
    return `<div class="desc">Penggunaan tanah ${field} terbesar secara keseluruhan adalah <b>${esc(all[0][0])}</b> (${fm(all[0][1])} ha, ${pc(all[0][1], T)}). Dari <b>${d.length}</b> kecamatan, yang paling sering dominan adalah <b>${esc(main[0])}</b> (${main[1]} kecamatan). Dominan terluas ada di <b>${esc(top.k)}</b>: ${esc(top.c)} seluas ${fm(top.v)} ha.</div>` +
        box('10 penggunaan tanah terbesar (% luas)', chart('c2')) +
        (dk.length ? box('Penggunaan terluas per kabupaten/kota', tbl(hd, dk.map(row).join(''))) : '') +
        box('Sebaran penggunaan dominan per kecamatan', chart('c1')) +
        box(title, tbl(hd, d.map(row).join('')))
}

const VIEWS = {
    ring() {
        const rs = V(); if (!rs.length) return none; const kf = lv(), g = new Map(), T = add(rs, r => r.l);
        let ub = 0, tv = 0, c0 = 0, c1 = 0;
        for (const r of rs) {
            let a = g.get(r[kf]); if (!a) g.set(r[kf], a = { t: 0, u: 0, v: 0, s: 0, c: 0 });
            a.t += r.l; if (r.g !== r.q) { a.u += r.l; ub += r.l } if (isT(r)) { a.v += r.l; tv += r.l } if (r.ks.toLowerCase() === 'sesuai') a.s += r.l;
            a.c += (r.cq - r.cg) * r.l; c0 += r.cg * r.l; c1 += r.cq * r.l
        }
        const tr = sorted(sum(r => r.g !== r.q ? r.g + ' menjadi ' + r.q : null)).slice(0, 3), o = sorted(sum(r => r.o))[0], ks = sorted(sum(r => r.ks)),
            ar = sorted(sum(r => sek(r.a))), pg = (ar.find(x => x[0] === PANGAN) || [0, 0])[1], gt = sorted(g).sort((a, b) => b[1].v - a[1].v)[0];
        const li = [
            `Perubahan penggunaan tanah seluas <b>${fm(ub)} ha (${pc(ub, T)})</b>${tr.length ? `, didominasi ${tr.map(x => `${esc(x[0])} (${pc(x[1], ub)})`).join('; ')}` : ''}.`,
            `Gambaran umum penguasaan tanah terbesar: <b>${esc(o[0])}</b> seluas ${fm(o[1])} ha (${pc(o[1], T)}).`,
            `Kesesuaian penggunaan tanah terhadap RTRW: ${ks.map(x => `${esc(x[0])} <b>${pc(x[1], T)}</b>`).join(', ')}.`,
            `Ketersediaan tanah seluas <b>${fm(tv)} ha (${pc(tv, T)})</b>. Potensi pertanian pangan ${fm(pg)} ha dan sektor lainnya ${fm(add(ar, x => x[1]) - pg)} ha.`,
            `Total cadangan karbon (penggunaan baru) <b>${fm(c1, 0)} ton</b>, perubahan potensi ${fm(c1 - c0, 0)} ton (${c1 < c0 ? 'defisit' : 'surplus'}).`,
            `Ketersediaan tanah terbesar ada di <b>${esc(gt[0])}</b> (${fm(gt[1].v)} ha).`];
        const hd = [[LN(kf)], ['Luas (ha)', 1], ['% Berubah', 1], ['% Sesuai RTRW', 1], ['% Tersedia', 1], ['Perubahan Karbon (ton)', 1]];
        return `<div class="cards" style="grid-template-columns:1fr 1fr">` + [[fm(T, 1), 'Total luas (ha)'], [pc(ub, T), 'Luas berubah'], [pc(tv, T), 'Luas tersedia'], [fm(c1 - c0, 0), 'Perubahan karbon (ton)']].map(x => `<div class="stat"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('') + `</div>` +
            box('Kesimpulan otomatis', `<ol style="margin:0;padding-left:18px">${li.map(x => `<li style="margin-bottom:4px">${x}</li>`).join('')}</ol>`) +
            box('Ringkasan per ' + LN(kf).toLowerCase(), tbl(hd, [...g].sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => `<tr><td>${esc(k)}</td><td class="n">${fm(a.t)}</td><td class="n">${pc(a.u, a.t)}</td><td class="n">${pc(a.s, a.t)}</td><td class="n">${pc(a.v, a.t)}</td><td class="n">${fm(a.c, 0)}</td></tr>`).join('')))
    },
    lama: () => dominantView('lama', 'Penggunaan tanah lama terluas per kecamatan', r => r.g),
    baru: () => dominantView('baru', 'Penggunaan tanah baru terluas per kecamatan', r => r.q),
    ubah() {
        const rs = V(), kf = lv(), s = sum(r => r.g === r.q ? 'Tidak Berubah' : 'Berubah', rs), b = s.get('Berubah') || 0, t = s.get('Tidak Berubah') || 0, tot = b + t, km = new Map(), ch = rs.filter(r => r.g !== r.q);
        for (const r of rs) { let a = km.get(r.k); if (!a) km.set(r.k, a = [0, 0]); a[r.g === r.q ? 1 : 0] += r.l }
        const tr = sorted(sum(r => r.g + ' menjadi ' + r.q, ch)).slice(0, 15), dk = kf === 'b' ? dom(r => r.g + ' menjadi ' + r.q, 'b', ch) : [];
        setTimeout(() => { mk('c1', 'pie', sorted(s)); if (tr.length) mk('c2', 'bar', tr.slice(0, 10).map(([k, v]) => [k, v / b * 100]), '% dari luas berubah') });
        return `<div class="desc">Sebanyak <b>${pc(b, tot)}</b> luasan (${fm(b)} ha) mengalami perubahan penggunaan tanah, sedangkan ${fm(t)} ha (${pc(t, tot)}) tidak berubah.${tr.length ? ` Perubahan terbesar: <b>${esc(tr[0][0])}</b> (${pc(tr[0][1], b)} dari luas berubah).` : ''}</div>` +
            box('Proporsi perubahan (luas)', chart('c1')) +
            box('10 perubahan tertinggi (% dari luas berubah)', tr.length ? chart('c2') : '<span class="mu">Tidak ada perubahan.</span>') +
            (dk.length ? box('Perubahan dominan per kabupaten/kota', tbl([['Kabupaten/Kota'], ['Perubahan Dominan'], ['Luas (ha)', 1], ['% Perubahan', 1]], dk.map(x => `<tr><td>${esc(x.k)}</td><td>${esc(x.c)}</td><td class="n">${fm(x.v)}</td><td class="n">${pc(x.v, x.t)}</td></tr>`).join(''))) : '') +
            box('Status per kecamatan', tbl([['Kecamatan'], ['Berubah (ha)', 1], ['Tidak Berubah (ha)', 1], ['% Berubah', 1]], [...km].sort((a, c) => a[0].localeCompare(c[0])).map(([k, a]) => `<tr><td>${esc(k)}</td><td class="n">${fm(a[0])}</td><td class="n">${fm(a[1])}</td><td class="n">${pc(a[0], a[0] + a[1])}</td></tr>`).join(''))) +
            box('15 perubahan terluas (lama menjadi baru)', tr.length ? tbl([['Perubahan'], ['Luas (ha)', 1], ['% Berubah', 1]], tr.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fm(v)}</td><td class="n">${pc(v, b)}</td></tr>`).join('')) : '')
    },
    rtrw() {
        const rs = V(), kf = lv(), s = sorted(sum(r => r.ks, rs)), tot = add(s, x => x[1]), un = rs.filter(isUn),
            ts = sorted(sum(r => r.q, un)), tv = add(ts, x => x[1]), kc = sorted(sum(r => r.k, un)).slice(0, 10);
        setTimeout(() => mk('c1', 'pie', s));
        return `<div class="desc">${s.map(([k, v]) => `${esc(k)} <b>${pc(v, tot)}</b>`).join(', ')} dari total ${fm(tot)} ha. Total ketidaksesuaian terhadap RTRW <b>${fm(tv)} ha</b>${ts.length ? `, terbesar pada ${esc(ts[0][0])} (${fm(ts[0][1])} ha)` : ''}${kc.length ? `; kecamatan dengan ketidaksesuaian terbesar: ${esc(kc[0][0])} (${fm(kc[0][1])} ha)` : ''}.</div>` +
            box('Grafik KSPOLA (luas)', chart('c1')) + cross('Kesesuaian per ' + LN(kf).toLowerCase(), kf, r => r.ks, rs) +
            box('Penggunaan tanah baru yang tidak sesuai RTRW', ts.length ? tbl([['Penggunaan Tanah Baru'], ['Luas Tidak Sesuai (ha)', 1], ['%', 1]], ts.map(([k, v]) => `<tr><td>${sw(k)}</td><td class="n">${fm(v)}</td><td class="n">${pc(v, tv)}</td></tr>`).join('')) : '<span class="mu">Tidak ada data Tidak Sesuai.</span>') +
            (kc.length ? box('10 kecamatan dengan ketidaksesuaian terbesar', tbl([['Kecamatan'], ['Luas Tidak Sesuai (ha)', 1]], kc.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fm(v)}</td></tr>`).join(''))) : '')
    },
    gupt() {
        const rs = V(), s = sorted(sum(r => r.o, rs)), c = new Map(); rs.forEach(r => c.set(r.o, (c.get(r.o) || 0) + 1));
        const tot = add(s, x => x[1]), bel = add(rs.filter(isBel), r => r.l);
        setTimeout(() => mk('c1', 'bar', s.slice(0, 10).map(([k, v]) => [k, v / tot * 100]), 'Persentase luas (%)'));
        return `<div class="desc">Terdapat <b>${s.length}</b> jenis penguasaan tanah. Yang terluas <b>${esc(s[0][0])}</b> (${fm(s[0][1])} ha, ${pc(s[0][1], tot)}). Tanah belum terdaftar mencapai ${fm(bel)} ha (${pc(bel, tot)}).</div>` +
            box('10 penguasaan tanah terbesar (%)', chart('c1')) +
            box('Rekap penguasaan tanah', tbl([['Penguasaan'], ['Poligon', 1], ['Luas (ha)', 1], ['%', 1]], s.map(([k, v]) => `<tr><td>${sw(k)}</td><td class="n">${c.get(k).toLocaleString('id-ID')}</td><td class="n">${fm(v)}</td><td class="n">${pc(v, tot)}</td></tr>`).join('')))
    },
    ket() {
        const rs = V(), kf = lv(), s = sorted(sum(r => r.v, rs)), tot = add(s, x => x[1]), T = rs.filter(isT), tv = add(T, r => r.l),
            pr = sorted(sum(r => r.n, T)).slice(0, 15), ar = sorted(sum(r => r.a, rs)).slice(0, 10),
            gu = sorted(sum(r => r.g, T)).slice(0, 3).map(x => esc(x[0])).join(', '), kw = pr.slice(0, 3).map(x => esc(x[0])).join(', '), g = new Map();
        for (const r of rs) { let a = g.get(r[kf]); if (!a) g.set(r[kf], a = { t: 0, v: 0, b: 0, h: 0 }); a.t += r.l; if (isT(r)) a.v += r.l; if (isBel(r)) a.b += r.l; else a.h += r.l }
        setTimeout(() => { mk('c1', 'pie', s); if (pr.length) mk('c2', 'bar', pr); mk('c3', 'bar', ar) });
        const cell = (x, t) => `<td class="n">${fm(x)}<br><small class="mu">${pc(x, t)}</small></td>`;
        return `<div class="desc">Tanah tersedia seluas <b>${fm(tv)} ha (${pc(tv, tot)})</b>. Observasi: ketersediaan mayoritas pada penggunaan tanah ${gu || '-'}, dengan dominasi pada kawasan ${kw || '-'}.</div>` +
            box('Proporsi ketersediaan tanah (luas)', chart('c1')) +
            box('Ketersediaan tanah pada rencana pola ruang (ha)', chart('c2')) +
            box('Arahan ketersediaan tanah terbesar (ha)', chart('c3')) +
            // box('Potensi sosial ekonomi per ' + LN(kf).toLowerCase(), tbl([[LN(kf)], ['Tersedia (ha, %)', 1], ['Tidak Tersedia (ha, %)', 1], ['Belum Ada HAT (ha, %)', 1], ['Ada HAT (ha, %)', 1]], [...g].sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => `<tr><td>${esc(k)}</td>${cell(a.v, a.t)}${cell(a.t - a.v, a.t)}${cell(a.b, a.t)}${cell(a.h, a.t)}</tr>`).join(''))) +
            cross('Ketersediaan per ' + LN(kf).toLowerCase(), kf, r => r.v, rs)
    },
    pot() {
        const rs = V().filter(r => sekX(r.a)), kf = lv(); if (!rs.length) return none;
        const s = sorted(sum(r => sekX(r.a), rs)), tot = add(s, x => x[1]), bk = sorted(sum(r => r[kf], rs)).slice(0, 10);
        setTimeout(() => { mk('c1', 'bar', s); mk('c2', 'bar', bk) });
        return `<div class="desc">Total potensi pengembangan lima sektor <b>${fm(tot)} ha</b> (potensi pertanian pangan dibahas terpisah di tab Potensi Pangan). Sektor terbesar <b>${esc(s[0][0])}</b> (${fm(s[0][1])} ha, ${pc(s[0][1], tot)}), wilayah terluas ${esc(bk[0][0])} (${fm(bk[0][1])} ha).</div>` +
            box('Potensi sektoral (ha)', chart('c1')) + box('Luas potensi sektoral per ' + LN(kf).toLowerCase() + ' (10 terbesar)', chart('c2')) +
            cross('Potensi sektoral per ' + LN(kf).toLowerCase(), kf, r => sekX(r.a), rs)
    },
    pan() {
        const rs = V().filter(r => sek(r.a) === PANGAN), kf = lv(); if (!rs.length) return none;
        const tot = add(rs, r => r.l), all = add(V(), r => r.l), bk = sorted(sum(r => r[kf], rs)).slice(0, 10), gl = sorted(sum(r => r.q, rs)).slice(0, 10);
        setTimeout(() => { mk('c1', 'bar', bk); mk('c2', 'bar', gl) });
        return `<div class="desc">Potensi pengembangan pertanian pangan seluas <b>${fm(tot)} ha</b> (${pc(tot, all)} dari wilayah terpilih). Wilayah terluas <b>${esc(bk[0][0])}</b> (${fm(bk[0][1])} ha, ${pc(bk[0][1], tot)}), dengan penggunaan tanah baru terbesar <b>${esc(gl[0][0])}</b> (${fm(gl[0][1])} ha).</div>` +
            box('Luas potensi pangan per ' + LN(kf).toLowerCase() + ' (10 terbesar)', chart('c1')) + box('Penggunaan tanah baru pada lahan potensi pangan (ha)', chart('c2')) +
            cross('Penggunaan tanah baru pada potensi pangan per ' + LN(kf).toLowerCase(), kf, r => r.q, rs)
    },
    kar() {
        const rs = V(), kf = lv(), w = r => (r.cq - r.cg) * r.l, c0 = add(rs, r => r.cg * r.l), c1 = add(rs, r => r.cq * r.l), d = c1 - c0;
        if (!c0 && !c1) return '<p class="mu">Kolom TON_C_G / TON_C_Q tidak ditemukan atau kosong.</p>';
        const bg = [...sum(r => r[kf], rs, w)].sort((a, b) => a[1] - b[1]), tr = [...sum(r => r.g !== r.q ? r.g + ' menjadi ' + r.q : null, rs, w)].sort((a, b) => a[1] - b[1]);
        const g = new Map(); for (const r of rs) { let a = g.get(r[kf]); if (!a) g.set(r[kf], a = [0, 0]); a[0] += r.cg * r.l; a[1] += r.cq * r.l }
        setTimeout(() => { mk('c1', 'bar', bg.slice(0, 10), 'Perubahan karbon (ton)'); if (tr.length) mk('c2', 'bar', tr.slice(0, 10), 'Perubahan karbon (ton)') });
        return `<div class="desc">Total cadangan karbon penggunaan tanah baru <b>${fm(c1, 0)} ton</b> (lama ${fm(c0, 0)} ton). Perubahan potensi <b>${fm(d, 0)} ton</b> (${d < 0 ? 'defisit' : 'surplus'}). Dihitung dari TON_C (ton/ha) dikalikan LUASHA.</div>` +
            box('Perubahan karbon per ' + LN(kf).toLowerCase() + ' (ton, terendah dulu)', chart('c1')) +
            box('Perubahan penggunaan tanah dengan dampak karbon terbesar (ton)', tr.length ? chart('c2') : '<span class="mu">Tidak ada perubahan.</span>') +
            box('Cadangan karbon per ' + LN(kf).toLowerCase(), tbl([[LN(kf)], ['Lama (ton)', 1], ['Baru (ton)', 1], ['Perubahan (ton)', 1]], [...g].sort((a, b) => a[0].localeCompare(b[0])).map(([k, a]) => `<tr><td>${esc(k)}</td><td class="n">${fm(a[0], 0)}</td><td class="n">${fm(a[1], 0)}</td><td class="n">${fm(a[1] - a[0], 0)}</td></tr>`).join('')))
    }
};

function render(skipLegend) {
    charts.forEach(c => c.destroy()); charts = [];
    const rs = V(), tot = rs.reduce((a, r) => a + r.l, 0);
    $('#content').innerHTML = `<div class="cards"><div class="stat"><b>${rs.length.toLocaleString('id-ID')}</b><span>Poligon</span></div><div class="stat"><b>${fm(tot, 1)}</b><span>Total luas (ha)</span></div><div class="stat"><b>${kecSel ? 1 : new Set(rs.map(r => r.k)).size}</b><span>Kecamatan</span></div></div>` + (rs.length ? VIEWS[tab]() : '');
    groups.forEach(g => g.setStyle(st));
    setOp();
    if (!skipLegend) legend();
}

/* Legenda: pencarian, semua/kosong, 10 teratas, bar proporsi */
const LIM = 10; let lgQ = '', lgAll = false, lgTab = null;
function legend() {
    $('#sym').style.display = 'flex';
    if (lgTab !== tab) { lgTab = tab; lgQ = ''; lgAll = false; $('#lgq').value = '' }
    const s = sorted(sum(TABS[tab].c)), h = hid[tab] || (hid[tab] = new Set());
    lgKeys = s.map(x => x[0]);
    const T = add(s, x => x[1]) || 1, mx = s.length ? s[0][1] || 1 : 1, q = lgQ.trim().toLowerCase();
    let list = s.map((x, i) => [x, i]).filter(([x]) => !q || String(x[0]).toLowerCase().includes(q));
    const cut = !q && !lgAll && list.length > LIM; if (cut) list = list.slice(0, LIM);
    const hidN = [...h].filter(k => lgKeys.includes(k)).length;
    $('#lgttl').innerHTML = `<b>${TABS[tab].t}</b><span>${s.length} kategori${hidN ? ` · ${hidN} disembunyikan` : ''}</span>`;
    $('#lg').innerHTML = (list.length ? list.map(([[k, v], i]) => {
        const off = h.has(k), c = col(k);
        return `<div class="lr${off ? ' off' : ''}" style="--c:${c};--w:${Math.max(.02, v / mx)}"><input type="color" data-c="${i}" value="${hex(c)}" title="Ubah warna"><label class="tg" title="${esc(k)} · ${fm(v, 1)} ha"><input type="checkbox" data-h="${i}" ${off ? '' : 'checked'}><span class="nm">${esc(k)}</span></label><span class="pct">${pc(v, T)}</span></div>`
    }).join('') : '<div class="mu" style="padding:8px 4px">Tidak ada kategori yang cocok.</div>')
        + (!q && s.length > LIM ? `<button id="lgmore">${lgAll ? 'Ringkas daftar' : `Tampilkan semua (${s.length})`}</button>` : '');
}
let dbt;
$('#lg').addEventListener('input', e => {
    const i = e.target.dataset.c; if (i == null) return;
    const u = custom[lgKeys[i]] = custom[lgKeys[i]] || {}; u.f = e.target.value; delete u.h; delete u.pf; delete u.p; clearTimeout(dbt); dbt = setTimeout(() => render(true), 120)
});
$('#lg').addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.h != null) { const k = lgKeys[d.h], h = hid[tab]; e.target.checked ? h.delete(k) : h.add(k); render() }
});
$('#lg').addEventListener('click', e => { if (e.target.closest('#lgmore')) { lgAll = !lgAll; legend() } });
$('#lgq').addEventListener('input', e => { lgQ = e.target.value; legend() });
$('#lgon').onclick = () => { hid[tab] = new Set(); render() };
$('#lgoff').onclick = () => { hid[tab] = new Set(lgKeys); render() };
$('#op').oninput = e => { op = e.target.value / 100; $('#opv').textContent = e.target.value + '%'; setOp() };
// $('#ol').onchange = e => { outline = e.target.checked; groups.forEach(g => g.setStyle(st)) };
// $('#rst').onclick = () => { for (const k in custom) delete custom[k]; hid = {}; render() };
$('#sht').onclick = () => $('#sym').classList.toggle('min');
if (innerWidth < 900) $('#sym').classList.add('min');
L.DomEvent.disableClickPropagation($('#sym')); L.DomEvent.disableScrollPropagation($('#sym'));

/* Impor .stylx (ArcGIS Pro, berupa basis data SQLite) */
const h2 = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
function cim(c) {
    if (!c || !Array.isArray(c.values)) return null; const v = c.values; let r, g, b;
    if (/HSV/.test(c.type)) {
        const hh = v[0] / 60, s = v[1] / 100, w = v[2] / 100, i = Math.floor(hh) % 6, f = hh - Math.floor(hh), p = w * (1 - s), q = w * (1 - f * s), t = w * (1 - (1 - f) * s);
        [r, g, b] = [[w, t, p], [q, w, p], [p, w, t], [p, q, w], [t, p, w], [w, p, q]][i].map(x => x * 255)
    }
    else if (/CMYK/.test(c.type)) { const k = v[3] / 100;[r, g, b] = [0, 1, 2].map(j => 255 * (1 - v[j] / 100) * (1 - k)) }
    else if (/HSL/.test(c.type) || v.length < 3) return null;
    else[r, g, b] = v;
    return '#' + h2(r) + h2(g) + h2(b)
}
function parseSym(o) {
    const y = o && (o.symbol || o); if (!y || !Array.isArray(y.symbolLayers)) return null;
    if (y.type && !/Polygon/.test(y.type)) return null;
    let f, s, w, h, m, pf; for (const l of y.symbolLayers) {
        if (l.enable === false) continue;
        if (l.type === 'CIMSolidFill' && !f) f = cim(l.color);
        else if (l.type === 'CIMSolidStroke' && !s) { s = cim(l.color); w = l.width }
        else if (l.type === 'CIMHatchFill' && !h) {
            const k = ((l.lineSymbol || {}).symbolLayers || []).find(z => z.type === 'CIMSolidStroke'), c = k && cim(k.color);
            if (c) h = { c, w: k.width, r: l.rotation || 0, sp: l.separation }
        }
        else if ((l.type === 'CIMPictureFill' || l.type === 'CIMPictureMarker') && l.url && !pf) {
            const sub = (l.colorSubstitutions || []).map(z => [z.oldColor.values, z.newColor.values]), b = sub.find(z => z[0][0] + z[0][1] + z[0][2] < 90 && z[1][3] > 0);
            pf = { u: l.url, sub, h: l.height, sx: l.scaleX, r: l.rotation || 0, c: b && cim({ type: 'CIMRGBColor', values: b[1] }) };
            if (l.type === 'CIMPictureMarker') { pf.mk = 1; pf.size = l.size; pf.step = ((l.markerPlacement || {}).stepX) || l.size }
        }
        else if (l.symbol && !m) { const z = parseSym(l.symbol); m = z && z.f }
    }
    const c = f || (h && h.c) || m || (pf && pf.c) || s; if (!c) return null;
    return { f: c, s: s, w: w ? Math.max(.3, Math.min(4, w * 1.33)) : undefined, h: f ? undefined : h, pf: f || h ? undefined : pf }
}
const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]/g, '');

function autoMatch() {
    if (!styles.length) return 0;
    const cats = new Set(['Berubah', 'Tidak Berubah']); rows.forEach(r => [r.g, r.q, r.ks, r.o, r.v].forEach(x => cats.add(x)));
    const idx = [...new Map(styles.map(x => [norm(x.n), x]))]; let m = 0;
    cats.forEach(k => {
        const nk = norm(k); if (!nk) return;
        const x = (idx.find(i => i[0] === nk) || idx.find(i => nk.length > 4 && i[0].length > 4 && (i[0].includes(nk) || nk.includes(i[0]))) || [])[1];
        if (x) { app(k, x); m++ }
    });
    $('#ss').textContent = `${styles.length} simbol dimuat, ${m} kategori cocok otomatis berdasarkan nama.`;
    return m;
}

async function loadStylx(file) {
    $('#ss').textContent = 'Membaca .stylx...';
    try {
        const SQL = await initSqlJs({ locateFile: f => 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/' + f });
        const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
        const res = db.exec('SELECT NAME, CONTENT FROM ITEMS'); styles = []; let bad = 0;
        if (res[0]) for (const [n, c] of res[0].values) {
            try {
                const o = JSON.parse((typeof c === 'string' ? c : new TextDecoder().decode(c)).replace(/\0+$/, '')), y = parseSym(o); if (y) styles.push({ n: String(n), ...y }); else bad++
            } catch (e) { }
        }
        db.close();
        await Promise.all(styles.filter(x => x.pf).map(x => prep(x).catch(() => { delete x.pf; bad++ })));
        if (!styles.length) { $('#ss').textContent = 'Tidak ada simbol poligon pada file ini.'; return }
        autoMatch();
        if (bad) $('#ss').textContent += ` (${bad} simbol tidak terbaca)`;
        if (rows.length) render();
    } catch (e) { console.error(e); $('#ss').textContent = 'Gagal membaca .stylx: ' + (e.message || e) }
}

/* Muat otomatis simbologi bawaan dari assets/simbologi.stylx */
const stylxReady = fetch('assets/simbologi.stylx')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob() })
    .then(loadStylx)
    .catch(e => { console.warn(e); $('#ss').textContent = 'Simbologi bawaan gagal dimuat: ' + e.message });

/* UI */
$('#nav').innerHTML = Object.entries(TABS).map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${ic(v.i)}${v.t}</button>`).join('');
$('#nav').onclick = e => {
    const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t;
    document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
    if (rows.length) { render(); $('#content').scrollTop = 0 }
};
function fillKec() {
    const ks = [...new Set(rows.filter(r => !kabSel || r.b === kabSel).map(r => r.k))].sort((a, b) => a.localeCompare(b));
    $('#kec').innerHTML = '<option value="">Semua kecamatan</option>' + ks.map(k => `<option>${esc(k)}</option>`).join('')
}
const fit = () => { const b = kecSel ? kb[kecSel] : kabSel ? bb[kabSel] : allB; if (b) map.fitBounds(b) };
$('#kab').onchange = e => { kabSel = e.target.value; kecSel = ''; fillKec(); render(); fit() };
$('#kec').onchange = e => { kecSel = e.target.value; render(); fit() };
$('#pick').onclick = () => $('#file').click();
$('#file').onchange = e => load(e.target.files[0]);
const mw = $('#mapwrap');
['dragenter', 'dragover'].forEach(t => mw.addEventListener(t, e => { e.preventDefault(); mw.classList.add('drag') }));
['dragleave', 'drop'].forEach(t => mw.addEventListener(t, e => { e.preventDefault(); mw.classList.remove('drag') }));
mw.addEventListener('drop', e => load(e.dataTransfer.files[0]));