// bps.js - Input data BPS ("Kabupaten/Kota Dalam Angka", PDF) -> mengisi Tabel III-1 s/d III-5 dan IV-18.
// Alur: unggah PDF -> isi nomor halaman tiap data -> Pratinjau -> Konfirmasi -> data ditempel ke tabel.
// Dimuat SETELAH main.js (butuh ROWS, wilayah(), kecOf(), popSet(), t2Set(), pkSet(), pdSet(), pd2Set(), kpSet(),
// PK_STATUS, PD_USAHA, PD_TAHUN dari extra.js). Bagian inti (const BPS) tidak menyentuh halaman web, jadi bisa diuji terpisah.
//
// Nomor halaman = urutan halaman di PDF viewer (halaman ke-123 dari 554), BUKAN nomor cetak di pojok halaman.
// Angka dibaca dengan format Indonesia: titik = ribuan, koma = desimal (55.270 -> 55270 ; 0,43 -> 0.43).

// =====================================================================
// BAGIAN INTI: membaca teks PDF per halaman dan mengurai tabel
// =====================================================================
const BPS = (() => {
  // ---------- angka ----------
  // Buku BPS tidak selalu konsisten: "1.718,42" (Indonesia), "25,028.72" (Inggris), "15 907.7" (spasi ribuan),
  // bahkan salah cetak seperti "15,722,27" atau "142,". Pembaca ini menafsirkan tiap angka dari bentuknya sendiri;
  // style ('id'/'en') hanya dipakai untuk angka yang benar-benar ambigu, mis. "1.234" atau "1,234".
  // Hasil: {v, raw}; fix=true bila bentuknya tidak baku (ditandai * di pratinjau); bad=true bila tak bisa dipastikan (v=null).
  function parseNum(s, style) {
    const raw = String(s).trim().replace(/[*†‡]+$/, ''); let t = raw.replace(/[\u00a0\u2009\u202f]/g, ' ');
    if (/^[-–—]$/.test(t)) return { v: null, raw };                                                   // strip = tidak ada data
    const sp = t.match(/^(-?\d{1,3})((?: \d{3})+)([.,]\d+)?$/);                                         // spasi sebagai pemisah ribuan: "1 819.14"
    if (sp) t = sp[1] + sp[2].replace(/ /g, '') + (sp[3] || '');
    if (!/^-?[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
    const neg = t[0] === '-'; if (neg) t = t.slice(1);
    const ok = (v, fix) => ({ v: neg ? -v : v, raw, fix: !!fix }), bad = () => ({ v: null, raw, bad: true });
    const hasD = t.includes('.'), hasC = t.includes(',');
    if (!hasD && !hasC) return ok(+t);
    if (hasD && hasC) {                                                                                  // pemisah terakhir = desimal
      const li = Math.max(t.lastIndexOf('.'), t.lastIndexOf(',')), dec = t[li], ths = dec === '.' ? ',' : '.', ip = t.slice(0, li), fp = t.slice(li + 1);
      const grp = ths === ',' ? /^\d{1,3}(,\d{3})+$/ : /^\d{1,3}(\.\d{3})+$/;
      return grp.test(ip) && /^\d+$/.test(fp) ? ok(+(ip.split(ths).join('') + '.' + fp)) : bad();       // "28,01.61" -> tidak bisa dipastikan
    }
    const sep = hasD ? '.' : ',', parts = t.split(sep), n = parts.length - 1, last = parts[n], head = parts.slice(0, n);
    if (parts[0] === '') return bad();
    if (last === '' && n === 1) return { ...ok(+head[0], true), cut: true };                              // "142," : desimal terpotong di PDF (nilai sebenarnya 142,0 s/d 142,9)
    if (!/^\d{1,3}$/.test(head[0]) && n > 1) return bad();
    if (n === 1) {
      const ip = head[0], amb = last.length === 3 && ip.length <= 3;
      if (amb) { const th = sep === '.' ? (style !== 'en' && ip !== '0') : style === 'en'; return th ? ok(+(ip + last)) : ok(+(ip + '.' + last)) }
      return ok(+(ip + '.' + last), sep === ',' && style === 'en');
    }
    if (!head.slice(1).every(p => /^\d{3}$/.test(p))) return bad();
    if (last.length === 3) return ok(+parts.join(''));                                                   // 1.234.567 atau 1,234,567
    if (sep === ',' && last.length <= 2) return ok(+(head.join('') + '.' + last), true);                 // "15,722,27" : ribuan koma + desimal koma
    return bad();
  }

  // ---------- model halaman: item teks -> baris ----------
  // items = hasil pdf.js getTextContent().items. Teks miring (watermark diagonal) dibuang; halaman landscape diputar tegak.
  function pageModel(raw) {
    const its = raw.filter(i => i.str && i.str.trim());
    const bucket = {};
    its.forEach(i => { const k = (Math.round(Math.atan2(i.transform[1], i.transform[0]) / 0.1) * 0.1).toFixed(1); bucket[k] = (bucket[k] || 0) + i.str.length });
    const dom = +(Object.keys(bucket).sort((a, b) => bucket[b] - bucket[a])[0] || 0), c = Math.cos(dom), s = Math.sin(dom), out = [];
    for (const i of its) {
      let d = Math.abs(Math.atan2(i.transform[1], i.transform[0]) - dom); d = Math.min(d, 2 * Math.PI - d);
      if (d > 0.12) continue;                                                                   // bukan teks isi (watermark)
      const X = i.transform[4], Y = i.transform[5], x = X * c + Y * s, y = -X * s + Y * c, w = i.width, str = i.str, len = str.length || 1, whole = str.trim();
      const parts = whole.split(/\s+/);
      if (!parseNum(whole) && parts.length > 1 && parts.every(p => parseNum(p))) {              // beberapa angka dalam satu item -> pecah
        let from = 0;
        for (const p of parts) { const at = str.indexOf(p, from); from = at + p.length; out.push({ s: p, x: x + w * at / len, w: w * p.length / len, xc: x + w * (at + p.length / 2) / len, y }) }
      } else out.push({ s: whole, x, w, xc: x + w / 2, y });
    }
    // gaya angka dominan di halaman ini (untuk angka ambigu): hitung bentuk yang tidak ambigu
    let en = 0, id = 0; out.forEach(i => { if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(i.s)) en++; else if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(i.s)) id++ });
    out.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of out) { const L = lines[lines.length - 1]; if (L && Math.abs(L.y - it.y) <= 3.5) L.items.push(it); else lines.push({ y: it.y, items: [it] }) }
    lines.forEach(L => L.items.sort((a, b) => a.x - b.x));
    return { items: out, lines, style: en > id ? 'en' : 'id', text: lines.map(L => L.items.map(i => i.s).join(' ')).join('\n') };
  }
  const num = (pg, s) => parseNum(s, pg.style);

  // nama untuk pencocokan (abaikan huruf besar/kecil, spasi, tanda baca, awalan "Kecamatan")
  const nname = s => String(s || '').toUpperCase().replace(/^(KECAMATAN|KEC\.?)\s+/, '').replace(/[^A-Z0-9]/g, '');
  const sq = s => String(s).replace(/\s+/g, '').toLowerCase();       // PDF kadang kehilangan spasi: "JumlahPenduduk(ribu"

  // penanda kolom "(2) (3) ..." di bawah judul kolom (kolom (1) = label, dilewati)
  function colMarks(pg) {
    const m = pg.items.filter(i => /^\(\d+\)$/.test(i.s) && +i.s.slice(1, -1) >= 2);
    if (!m.length) return null;
    const by = {}; m.forEach(i => (by[Math.round(i.y / 3)] ||= []).push(i));
    const best = Object.values(by).sort((a, b) => b.length - a.length)[0].sort((a, b) => a.xc - b.xc);
    return { y: best[0].y, cols: best };
  }
  // indeks kolom yang judulnya cocok dengan re (judul ada di atas penanda kolom)
  function headerCol(pg, mk, re) {
    const hs = pg.items.filter(i => re.test(sq(i.s)) && i.y > mk.y && i.y - mk.y <= 90).sort((a, b) => (a.y - mk.y) - (b.y - mk.y));
    if (!hs.length) return -1;
    let bi = 0; mk.cols.forEach((m, i) => { if (Math.abs(m.xc - hs[0].xc) < Math.abs(mk.cols[bi].xc - hs[0].xc)) bi = i });
    return bi;
  }
  // satuan di judul kolom: "(ribu jiwa)" -> 1000
  function unitOf(pg, mk, ci) {
    const t = pg.items.filter(i => i.y > mk.y && i.y - mk.y <= 60 && Math.abs(i.xc - mk.cols[ci].xc) <= 45).map(i => sq(i.s)).join(' ');
    return /ribu|thousand/.test(t) ? 1000 : /juta|million/.test(t) ? 1e6 : 1;
  }
  const scale = (n, f) => f === 1 || n.v === null ? n : { ...n, v: Math.round(n.v * f * 1e4) / 1e4, factor: f };

  // ---------- tabel per kecamatan (Jumlah Penduduk, Laju, Kepadatan, Rasio) ----------
  function kecField(pgs, re, kecs, wil) {
    const res = {}, nk = new Map(kecs.map(k => [nname(k), k])), nw = nname(wil); let hdr = 0, factor = 1;
    for (const pg of pgs) {
      const mk = colMarks(pg); if (!mk) continue;
      const ci = headerCol(pg, mk, re); if (ci < 0) continue;
      hdr++; const f = unitOf(pg, mk, ci); factor = Math.max(factor, f);
      const cx = mk.cols[ci].xc, labMax = mk.cols[0].xc - 30;
      const sp = mk.cols.length > 1 ? Math.min(...mk.cols.slice(1).map((m, i) => m.xc - mk.cols[i].xc)) : 160, tol = Math.max(25, sp * 0.45);
      for (const L of pg.lines) {
        if (L.y > mk.y - 2) continue;
        const key = nname(L.items.filter(i => i.xc < labMax && !num(pg, i.s)).map(i => i.s).join(' ')); if (!key) continue;
        let who = nk.has(key) ? nk.get(key) : (key === nw || /^(KOTA|KABUPATEN|KAB|JUMLAH|TOTAL)/.test(key)) ? '__kota' : null; if (!who) continue;
        if (who !== '__kota' && who in res) who = '__kota';          // nama sama muncul lagi = baris total (mis. Kecamatan "Banyuwangi" vs Kabupaten Banyuwangi)
        const c = L.items.map(i => ({ i, n: num(pg, i.s) })).filter(o => o.n && Math.abs(o.i.xc - cx) <= tol && o.i.xc > labMax).sort((a, b) => Math.abs(a.i.xc - cx) - Math.abs(b.i.xc - cx))[0];
        if (c && !(who in res)) res[who] = scale(c.n, f);
      }
    }
    return { res, hdr, factor };
  }

  // ---------- Status Pekerjaan Utama (Laki-laki | Perempuan | Jumlah) ----------
  function parsePek(pgs) {
    const rows = []; let total = null;
    for (const pg of pgs) {
      const mk = colMarks(pg); if (!mk || mk.cols.length < 3) continue;
      const labMax = mk.cols[0].xc - 40, below = pg.lines.filter(L => L.y < mk.y - 2), numRows = [], textLines = [];
      for (const L of below) {
        const nums = L.items.filter(i => i.xc > labMax).map(i => ({ i, n: num(pg, i.s) }));
        const self = L.items.filter(i => i.xc <= labMax).map(i => i.s).join(' ');
        if (nums.length === 3 && nums.every(o => o.n)) numRows.push({ y: L.y, self, v: nums.map(o => o.n) });
        else if (!nums.length && self) textLines.push({ y: L.y, s: self });
      }
      numRows.forEach(r => {
        const near = textLines.filter(t => { const d = Math.abs(t.y - r.y); return numRows.every(o => o === r || Math.abs(t.y - o.y) >= d) && t.y >= r.y - 1.5 });   // baris Indonesia berada di atas angka
        r.label = [...near.map(t => t.s), r.self].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      });
      numRows.forEach(r => { const o = { label: r.label, l: r.v[0], p: r.v[1], t: r.v[2] }; if (/jumlah|total/i.test(r.self) && !total) total = o; else rows.push(o) });
    }
    return { rows, total };
  }

  // ---------- PDRB menurut Lapangan Usaha (kode huruf x tahun) ----------
  const CODE = /^[A-U](\s*,\s*[A-U])*$/, YEAR = /^(20\d\d)\*{0,2}$/;
  function parsePDRB(pgs) {
    const rows = {}, years = new Set(), notes = []; let total = null;
    const txt = pgs.map(p => p.text).join('\n'), kind = /\bkonstan\b/i.test(txt) ? 'ADHK' : /\bberlaku\b/i.test(txt) ? 'ADHB' : null;
    for (const pg of pgs) {
      const yl = pg.lines.find(L => L.items.filter(i => YEAR.test(i.s)).length >= 3);
      if (!yl) { notes.push('baris tahun (2021 2022 …) tidak ditemukan pada salah satu halaman'); continue }
      const yc = yl.items.filter(i => YEAR.test(i.s)).map(i => ({ yr: +i.s.slice(0, 4), xc: i.xc })); yc.forEach(y => years.add(y.yr));
      const left = yc[0].xc - 30, codes = pg.items.filter(i => i.xc < left && CODE.test(i.s));
      const numRows = [];
      for (const L of pg.lines) {
        if (L.y >= yl.y - 2) continue;
        const nums = L.items.filter(i => i.xc >= left).map(i => ({ i, n: num(pg, i.s) }));
        if (nums.length >= 3 && nums.every(o => o.n)) numRows.push({ L, nums });
      }
      numRows.forEach((r, idx) => {
        const vals = {}; let bad = false;
        r.nums.forEach(o => { const y = yc.reduce((b, c) => Math.abs(c.xc - o.i.xc) < Math.abs(b.xc - o.i.xc) ? c : b); if (y.yr in vals) bad = true; vals[y.yr] = o.n });
        if (bad) { notes.push('ada baris dengan angka bertumpuk di y=' + r.L.y.toFixed(0)); return }
        const cd = codes.filter(c => Math.abs(c.y - r.L.y) <= 7).sort((a, b) => Math.abs(a.y - r.L.y) - Math.abs(b.y - r.L.y))[0];
        if (cd) { const k = cd.s.replace(/\s/g, '').toUpperCase(); if (rows[k]) notes.push('kode ' + k + ' muncul dua kali (yang pertama dipakai)'); else rows[k] = vals }
        else {
          const lab = pg.items.filter(i => i.xc < left && Math.abs(i.y - r.L.y) <= 14).map(i => i.s).join(' ');
          if (!total && (/produk\s*domestik|pdrb|jumlah|total/i.test(lab) || idx === numRows.length - 1)) total = vals;
        }
      });
    }
    return { rows, total, years: [...years].sort(), kind, notes };
  }

  // =====================================================================
  // ANALISIS: hasil urai + pemeriksaan -> data siap pratinjau/tempel
  // cfg = { kecs, wil, status:[nama status], usaha:[[kode,nama]], tahun:[tahun], pages:[nomor halaman] }
  // =====================================================================
  const worst = ms => ms.some(m => m.lv === 'err') ? 'err' : ms.some(m => m.lv === 'warn') ? 'warn' : 'ok';
  const near = (a, b, t) => Math.abs(a - b) <= t;
  const idn = v => v === null || v === undefined ? '-' : v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  const list = (a, n = 5) => a.slice(0, n).join(', ') + (a.length > n ? ` (+${a.length - n} lagi)` : '');
  // ringkasan angka bertanda * (bentuk tidak baku) dan ? (tidak terbaca) dari sekumpulan {label, n}
  function flagMsgs(cells) {
    const out = [], fx = cells.filter(c => c.n && c.n.fix), bd = cells.filter(c => c.n && c.n.bad);
    if (bd.length) out.push({ lv: 'warn', s: `${bd.length} angka tidak terbaca (kemungkinan salah cetak di PDF), selnya dikosongkan agar diisi manual: ${list(bd.map(c => `${c.label} "${c.n.raw}"`))}` });
    if (fx.length) out.push({ lv: 'warn', s: `${fx.length} angka dibaca dari format tidak baku (ditandai *), cocokkan dengan PDF: ${list(fx.map(c => `${c.label} "${c.n.raw}" → ${idn(c.n.v)}`))}` });
    return out;
  }

  const KEC_RE = { pop: /jumlahpenduduk/, laju: /lajupertumbuhan/, kp: /kepadatanpenduduk/, rasio: /rasiojeniskelamin/ };
  function analyzeKec(id, pgs, cfg) {
    const { res, hdr, factor } = kecField(pgs, KEC_RE[id], cfg.kecs, cfg.wil), msgs = [];
    const rows = cfg.kecs.map(k => ({ k, n: res[k] || null })), got = rows.filter(r => r.n).length, kota = res.__kota || null;
    if (!hdr) msgs.push({ lv: 'err', s: 'Judul kolom tidak ditemukan pada halaman ini. Periksa nomor halaman (urutan di PDF viewer).' });
    else if (!got) msgs.push({ lv: 'err', s: 'Tidak ada kecamatan yang cocok. Nama kecamatan di PDF harus sama dengan di shapefile.' });
    else if (got < rows.length) msgs.push({ lv: 'warn', s: `${rows.length - got} kecamatan tidak ditemukan di PDF: ${rows.filter(r => !r.n).map(r => r.k).join(', ')}` });
    else msgs.push({ lv: 'ok', s: `Semua ${got} kecamatan ditemukan.` });
    if (got && factor > 1) msgs.push({ lv: 'warn', s: `Satuan di PDF "${factor === 1000 ? 'ribu' : 'juta'}": angka dikalikan ${idn(factor)} saat disimpan. PDF membulatkan angkanya, jadi hasilnya hanya teliti sampai ${idn(factor / 10)}.` });
    if (got) msgs.push(...flagMsgs(rows.map(r => ({ label: r.k, n: r.n }))));
    if (got && rows.some(r => r.n && r.n.v === null && !r.n.bad)) msgs.push({ lv: 'warn', s: 'Ada sel bertanda "-" (tanpa data); sel itu dikosongkan.' });
    if (id === 'pop' && got && kota && kota.v !== null) {
      const cut = rows.filter(r => r.n && r.n.cut).length, sum = rows.reduce((s, r) => s + ((r.n && r.n.v) || 0), 0);
      const base = factor === 1 ? 0.5 : 0.05 * factor * (got + 1), tol = base + cut * (factor === 1 ? 1 : factor), d = kota.v - sum;   // angka terpotong ("142,") bisa kehilangan sampai 1 satuan
      msgs.push(near(sum, kota.v, base) ? { lv: 'ok', s: `Jumlah kecamatan (${idn(sum)}) sama dengan total ${cfg.wil} di PDF${factor > 1 ? ' (selisih pembulatan diabaikan)' : ''}.` }
        : near(sum, kota.v, tol) ? { lv: 'ok', s: `Jumlah kecamatan (${idn(sum)}) selisih ${idn(d)} dari total ${cfg.wil} di PDF (${kota.raw}${factor > 1 ? ' × ' + idn(factor) : ''}). Masih wajar karena ${cut} angka terpotong di PDF kehilangan desimalnya.` }
        : { lv: 'warn', s: `Jumlah kecamatan (${idn(sum)}) berbeda ${idn(d)} dari total di PDF (${kota.raw}${factor > 1 ? ' × ' + idn(factor) : ''}).` });
    }
    // kewajaran nilai: PDF kadang salah cetak/satuan; hanya peringatan, tidak memblokir
    const odd = (f, lo, hi) => rows.filter(r => r.n && r.n.v !== null && (r.n.v < lo || r.n.v > hi)).filter(f);
    if (id === 'laju' && got) { const o = odd(() => true, -10, 10); if (o.length) msgs.push({ lv: 'warn', s: `${o.length} nilai laju pertumbuhan di luar ±10% per tahun (mis. ${o[0].k} ${o[0].n.raw}). Angka sebesar itu tidak wajar untuk satuan %; periksa di PDF apakah satuannya benar atau ada salah cetak.` }) }
    if (id === 'rasio' && got) { const o = odd(() => true, 80, 125); if (o.length) msgs.push({ lv: 'warn', s: `${o.length} nilai rasio jenis kelamin di luar 80-125 (mis. ${o[0].k} ${o[0].n.raw}); periksa di PDF.` }) }
    if (id === 'kp' && got) msgs.push({ lv: 'ok', s: 'Tampil di Tabel III-1 dan IV-18 selama Jumlah Penduduk di III-1 tidak diubah.' });
    return { id, kind: 'kec', rows, kota, factor, msgs, level: worst(msgs), canApply: got > 0 && !msgs.some(m => m.lv === 'err') };
  }

  function analyzePek(pgs, cfg) {
    const { rows, total } = parsePek(pgs), msgs = [], n = cfg.status.length;
    if (rows.length !== n) msgs.push({ lv: 'err', s: `Ditemukan ${rows.length} baris status pekerjaan, sedangkan tabel dashboard butuh ${n}. Periksa nomor halaman atau susunan tabel BPS.` });
    else {
      const bad = rows.filter(r => r.l.v !== null && r.p.v !== null && r.t.v !== null && !near(r.l.v + r.p.v, r.t.v, 1));
      msgs.push(bad.length ? { lv: 'warn', s: `Laki-laki + Perempuan ≠ Jumlah pada: ${bad.map(r => r.label.slice(0, 30)).join('; ')}` } : { lv: 'ok', s: 'Laki-laki + Perempuan = Jumlah pada setiap baris.' });
      if (total) {
        const sl = rows.reduce((s, r) => s + (r.l.v || 0), 0), sp = rows.reduce((s, r) => s + (r.p.v || 0), 0);
        msgs.push(near(sl, total.l.v, 1) && near(sp, total.p.v, 1) ? { lv: 'ok', s: 'Total kolom sama dengan baris Jumlah di PDF.' } : { lv: 'warn', s: `Total kolom (${idn(sl)} / ${idn(sp)}) berbeda dari baris Jumlah PDF (${total.l.raw} / ${total.p.raw}).` });
      } else msgs.push({ lv: 'warn', s: 'Baris Jumlah/Total tidak ditemukan, jadi total tidak bisa diperiksa.' });
      msgs.push(...flagMsgs(rows.flatMap((r, i) => [{ label: cfg.status[i] + ' L', n: r.l }, { label: cfg.status[i] + ' P', n: r.p }])));
    }
    return { id: 'pek', kind: 'pek', names: cfg.status, rows, total, msgs, level: worst(msgs), canApply: rows.length === n };
  }

  function analyzePDRB(id, pgs, cfg, expect) {
    const r = parsePDRB(pgs), msgs = [], keys = cfg.usaha.map(u => u[0].replace(/\s/g, '').toUpperCase());
    const missing = cfg.usaha.filter((u, i) => !r.rows[keys[i]]).map(u => u[0]);
    const noYear = cfg.tahun.filter(y => !r.years.includes(y));
    if (r.kind && r.kind !== expect) msgs.push({ lv: 'err', s: `Halaman ini tampaknya tabel ${r.kind === 'ADHK' ? 'Harga Konstan (ADHK)' : 'Harga Berlaku (ADHB)'}, bukan ${expect === 'ADHK' ? 'Harga Konstan (ADHK)' : 'Harga Berlaku (ADHB)'}. Tertukar?` });
    if (missing.length === keys.length) msgs.push({ lv: 'err', s: 'Tidak ada baris lapangan usaha (A, B, C …) yang terbaca pada halaman ini.' });
    else if (missing.length) {
      msgs.push({ lv: 'warn', s: `Lapangan usaha tidak ditemukan di halaman yang dibaca: ${missing.join(', ')}.${!r.total ? ' Jika tabel di PDF berlanjut ke halaman berikutnya, tambahkan halamannya; jika tidak, baris itu memang tidak tercetak di PDF dan perlu diisi manual di tabel.' : ''}` });
    } else msgs.push({ lv: 'ok', s: `Semua ${keys.length} lapangan usaha ditemukan.` });
    if (noYear.length && missing.length < keys.length) msgs.push({ lv: 'warn', s: `Tahun ${noYear.join(', ')} tidak ada di PDF (PDF memuat ${r.years.join(', ') || '-'}); kolom itu tidak diubah.` });
    const cells = []; cfg.usaha.forEach((u, i) => cfg.tahun.forEach(y => { const c = (r.rows[keys[i]] || {})[y]; if (c) cells.push({ label: `${u[0]} ${y}`, n: c, y }) }));
    if (missing.length < keys.length) msgs.push(...flagMsgs(cells));
    if (r.total && missing.length < keys.length) {
      const diffs = [], skipped = [];
      for (const y of cfg.tahun) {
        const t = r.total[y]; if (!t || t.v === null) continue;
        const cs = keys.map(k => (r.rows[k] || {})[y]);
        if (cs.some(c => !c || c.v === null)) { skipped.push(y); continue }
        const sum = cs.reduce((s, c) => s + c.v, 0), sc = near(sum, t.v, 0.15) ? 1 : near(sum * 1000, t.v, 150) ? 1000 : 1;   // total kadang tercetak dalam juta
        const d = sum * sc - t.v; if (Math.abs(d) > 0.15 * sc) diffs.push({ y, d: d / sc });
      }
      if (skipped.length) msgs.push({ lv: 'warn', s: `Penjumlahan tahun ${skipped.join(', ')} dilewati karena ada angka yang hilang/tidak terbaca.` });
      // satu-satunya angka tidak terbaca pada suatu tahun dapat diperkirakan dari PDRB total dikurangi lapangan usaha lain (hanya saran, tidak ditempel otomatis)
      for (const y of skipped) {
        const cs = keys.map(k => (r.rows[k] || {})[y]), badIdx = cs.map((c, i) => c && c.bad ? i : -1).filter(i => i >= 0), t = r.total[y];
        if (badIdx.length !== 1 || cs.some(c => !c) || cs.some((c, i) => i !== badIdx[0] && c.v === null)) continue;
        const rest = cs.reduce((s, c, i) => i === badIdx[0] ? s : s + c.v, 0), sc = near(rest, t.v, t.v) && t.v > rest * 100 ? 1000 : 1, est = t.v / sc - rest;
        if (est > 0) msgs.push({ lv: 'warn', s: `Perkiraan ${cfg.usaha[badIdx[0]][0]} ${y}: ${idn(Math.round(est * 100) / 100)} (dari PDRB total dikurangi lapangan usaha lain; di PDF tercetak "${cs[badIdx[0]].raw}"). Periksa lalu isi manual di tabel.` });
      }
      const checked = cfg.tahun.filter(y => r.total[y] && !skipped.includes(y)).length;
      if (diffs.length) msgs.push({ lv: 'warn', s: 'Jumlah lapangan usaha ≠ PDRB total di PDF pada tahun ' + diffs.map(o => `${o.y} (selisih ${o.d.toFixed(2)})`).join(', ') + '. Mungkin ada baris yang salah baca atau salah cetak di PDF.' });
      else if (checked) msgs.push({ lv: 'ok', s: 'Jumlah semua lapangan usaha sama dengan PDRB total di PDF (selisih ≤ 0,15 karena pembulatan).' });
    } else if (!r.total && missing.length < keys.length) msgs.push({ lv: 'warn', s: 'Baris PDRB total tidak ditemukan, jadi penjumlahan tidak bisa diperiksa.' });
    r.notes.forEach(s => msgs.push({ lv: 'warn', s }));
    const rows = cfg.usaha.map((u, i) => ({ code: u[0], name: u[1], vals: cfg.tahun.map(y => (r.rows[keys[i]] || {})[y] || null) }));
    return { id, kind: 'pdrb', years: cfg.tahun, rows, total: cfg.tahun.map(y => (r.total || {})[y] || null), hasTotal: !!r.total, msgs, level: worst(msgs), canApply: missing.length < keys.length && !msgs.some(m => m.lv === 'err') };
  }

  function analyze(id, pgs, cfg) {
    if (id === 'pek') return analyzePek(pgs, cfg);
    if (id === 'adhb') return analyzePDRB(id, pgs, cfg, 'ADHB');
    if (id === 'adhk') return analyzePDRB(id, pgs, cfg, 'ADHK');
    return analyzeKec(id, pgs, cfg);
  }

  // "524-525, 530" -> [524,525,530]
  function parsePages(s, max) {
    const out = [];
    for (const part of String(s).split(/[,;]+/).map(x => x.trim()).filter(Boolean)) {
      const m = part.match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/); if (!m) throw new Error('Format halaman tidak dikenali: "' + part + '" (contoh: 123 atau 524-525)');
      const a = +m[1], b = m[2] ? +m[2] : a; if (b < a || b - a > 20) throw new Error('Rentang halaman tidak wajar: "' + part + '"');
      for (let p = a; p <= b; p++) { if (max && p > max) throw new Error(`Halaman ${p} melebihi jumlah halaman PDF (${max})`); if (p < 1) throw new Error('Halaman minimal 1'); out.push(p) }
    }
    if (!out.length) throw new Error('Nomor halaman kosong');
    return out;
  }

  return { parseNum, pageModel, nname, kecField, parsePek, parsePDRB, analyze, parsePages, idn };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BPS;   // untuk pengujian di Node

// =====================================================================
// BAGIAN TAMPILAN: kotak unggah PDF, isian nomor halaman, pratinjau, konfirmasi, tempel
// =====================================================================
(() => {
  if (typeof document === 'undefined' || typeof ROWS === 'undefined') return;
  const $ = s => document.querySelector(s), st = $('#status');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PDFJS = [
    ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'],
    ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js']
  ];
  // urutan sesuai daftar: 1 Penduduk, 2 Laju, 3 Rasio, 4 Pekerjaan, 5 ADHK, 6 ADHB, 7 Kepadatan.  def = halaman bawaan (contoh Kota Blitar 2026)
  const ITEMS = [
    { id: 'pop', label: 'Jumlah Penduduk', target: 'Tabel III-1', def: '123' },
    { id: 'laju', label: 'Laju Pertumbuhan Penduduk', target: 'Tabel III-2', def: '123' },
    { id: 'rasio', label: 'Rasio Jenis Kelamin', target: 'Tabel III-2', def: '125' },
    { id: 'pek', label: 'Status Pekerjaan Utama', target: 'Tabel III-3', def: '141' },
    { id: 'adhk', label: 'Lapangan Usaha ADHK (Harga Konstan)', target: 'Tabel III-5', def: '524-525' },
    { id: 'adhb', label: 'Lapangan Usaha ADHB (Harga Berlaku)', target: 'Tabel III-4', def: '522-523' },
    { id: 'kp', label: 'Kepadatan Penduduk', target: 'Tabel III-1 dan IV-18', def: '124' }
  ];
  const LS = 'djpa_bps_pages';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}') } catch (e) { return {} } })();

  const css = document.createElement('style');
  css.textContent = `
  #bpsbox{margin-top:12px;border:1px solid var(--bd);border-radius:14px;background:var(--card);padding:0}
  #bpsbox>summary{cursor:pointer;padding:14px 18px;font-weight:600;font-size:14px;list-style:none}
  #bpsbox>summary small{display:block;font-weight:400;color:var(--mut);margin-top:2px}
  #bpsbox[open]>summary{border-bottom:1px solid var(--bd)}
  .bps-body{padding:16px 18px}
  #drop3{border:1.5px dashed var(--bd);border-radius:12px;padding:18px;text-align:center;cursor:pointer;color:var(--mut);transition:border-color .15s,background .15s}
  #drop3:hover,#drop3.over{border-color:var(--acc);background:var(--card2)}
  #drop3 b{color:var(--tx)}
  .bps-grid{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:8px 14px;margin:14px 0;align-items:center}
  .bps-grid label{font-size:13px}.bps-grid label small{display:block;color:var(--mut)}
  .bps-grid input{padding:7px 10px;border:1px solid var(--bd);border-radius:8px;background:transparent;color:var(--tx);font:inherit;width:100%;box-sizing:border-box}
  .bps-act{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  #bps-st{font-size:13px;color:var(--mut)}
  .bps-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:70;display:grid;place-items:center;padding:14px}
  .bps-box{background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:14px;width:min(960px,100%);max-height:92vh;display:flex;flex-direction:column}
  .bps-h{padding:14px 18px;border-bottom:1px solid var(--bd)}.bps-h small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
  .bps-b{overflow:auto;padding:12px 18px;display:flex;flex-direction:column;gap:12px}
  .bps-f{padding:12px 18px;border-top:1px solid var(--bd);display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}
  .bps-f .r{display:flex;gap:10px}
  .bps-f button.sec,.bps-act button.sec{background:var(--card2);color:var(--tx);border:1px solid var(--bd)}
  .bps-c{border:1px solid var(--bd);border-radius:10px;overflow:hidden}
  .bps-c.err{border-color:var(--bad)}.bps-c.warn{border-color:#f59e0b}.bps-c.ok{border-color:var(--ok)}
  .bps-ch{display:flex;gap:10px;align-items:center;padding:9px 12px;background:var(--card2);font-size:13px;flex-wrap:wrap}
  .bps-ch b{font-size:14px}.bps-ch .tg{color:var(--mut)}.bps-ch input{width:16px;height:16px}
  .bps-bd{padding:8px 12px;font-size:12.5px;overflow-x:auto}
  .bps-bd table{border-collapse:collapse;margin:6px 0;font-size:12.5px}
  .bps-bd th,.bps-bd td{border:1px solid var(--cell-bd);padding:3px 9px}.bps-bd th{background:var(--th);color:var(--th-tx);font-weight:600}
  .bps-bd td.n{text-align:right;font-variant-numeric:tabular-nums}.bps-bd tr.tot td{font-weight:700;background:var(--alt)}
  .bps-m{list-style:none;margin:4px 0;padding:0}.bps-m li{padding:1px 0}
  .bps-m .ok::before{content:"✓ ";color:var(--ok)}.bps-m .warn::before{content:"⚠ ";color:#f59e0b}.bps-m .err::before{content:"✕ ";color:var(--bad)}
  .bps-ow{color:#f59e0b}
  .bps-tx{white-space:pre-wrap;font:11px/1.35 ui-monospace,monospace;max-height:160px;overflow:auto;background:var(--alt);padding:6px 8px;border-radius:6px}`;
  document.head.append(css);

  const box = document.createElement('details'); box.id = 'bpsbox';
  box.innerHTML = `<summary>Input data BPS dari PDF "Dalam Angka" (opsional)<small>Mengisi Tabel III-1 s/d III-5 dan IV-18 dari PDF BPS kabupaten/kota, tanpa mengetik satu per satu. Data selalu ditampilkan dulu untuk Anda periksa.</small></summary>
  <div class="bps-body">
    <div id="drop3"><b>Klik atau seret PDF "Kabupaten/Kota Dalam Angka" ke sini</b><br><small>PDF dibaca di browser Anda, tidak diunggah ke server.</small><input type="file" id="file3" accept=".pdf,application/pdf" hidden></div>
    <div class="bps-grid">${ITEMS.map((it, i) => `<label for="bp-${it.id}">${i + 1}. ${it.label}<small>→ ${it.target}</small></label><input id="bp-${it.id}" data-id="${it.id}" value="${esc(saved[it.id] ?? it.def)}" placeholder="mis. 123 atau 524-525" inputmode="numeric">`).join('')}</div>
    <small class="note">Isi dengan nomor halaman menurut PDF viewer (halaman ke-n dari seluruh PDF), bukan nomor cetak di pojok halaman. Rentang ditulis 524-525. Nilai bawaan di atas adalah contoh Kota Blitar 2026; ubah sesuai PDF kabupaten/kota Anda.</small>
    <div class="bps-act" style="margin-top:12px"><button id="bps-go" disabled>Baca PDF dan tampilkan pratinjau</button><span id="bps-st">Belum ada PDF.</span></div>
  </div>`;
  (document.querySelector('.bar') || document.querySelector('main')).before(box);

  const drop = $('#drop3'), fi = $('#file3'), go = $('#bps-go'), msg = $('#bps-st');
  let doc = null, docName = '', cache = new Map();

  const loadScript = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('gagal memuat ' + src)); document.head.append(s) });
  async function pdfLib() {
    if (window.pdfjsLib) return window.pdfjsLib;
    for (const [src, worker] of PDFJS) { try { await loadScript(src); if (window.pdfjsLib) { pdfjsLib.GlobalWorkerOptions.workerSrc = worker; return pdfjsLib } } catch (e) { } }
    throw new Error('Pustaka pdf.js tidak bisa dimuat. Periksa koneksi internet.');
  }
  async function openPdf(file) {
    msg.textContent = 'Membuka ' + file.name + '…'; go.disabled = true; doc = null; cache = new Map();
    try {
      const buf = await DZ.read(drop, file);          // <- baru: baca file dengan progress bar
      const lib = await pdfLib();
      doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise; docName = file.name;   // <- tadinya new Uint8Array(await file.arrayBuffer())
      msg.textContent = `${file.name}: ${doc.numPages.toLocaleString('id')} halaman. Isi nomor halaman di atas, lalu klik tombol.`; go.disabled = false;
      DZ.done(drop, file);                            // <- baru: kotak berubah jadi "sudah diunggah"
    } catch (e) {
      msg.textContent = e && e.name === 'PasswordException' ? 'PDF diberi kata sandi; tidak bisa dibuka.' : 'Gagal membuka PDF: ' + (e.message || e);
      DZ.fail(drop);                                  // <- baru
    }
  }
  async function page(n) {
    if (!cache.has(n)) { const p = await doc.getPage(n); cache.set(n, BPS.pageModel((await p.getTextContent()).items)) }
    return cache.get(n);
  }
  drop.onclick = () => fi.click();
  fi.onchange = () => { fi.files[0] && openPdf(fi.files[0]); fi.value = '' };
  ['dragover', 'dragenter'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over') }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over') }));
  drop.addEventListener('drop', e => e.dataTransfer.files[0] && openPdf(e.dataTransfer.files[0]));
  box.addEventListener('input', e => { if (e.target.matches('.bps-grid input')) { saved[e.target.dataset.id] = e.target.value; try { localStorage.setItem(LS, JSON.stringify(saved)) } catch (x) { } } });

  // ---------- pratinjau ----------
  const cfgNow = () => ({ kecs: [...new Set(ROWS.map(kecOf))].filter(k => k !== '-').sort(), wil: wilayah(), status: PK_STATUS, usaha: PD_USAHA, tahun: PD_TAHUN });
  // numFrom = indeks kolom pertama yang berisi angka (diratakan kanan)
  const tbl = (head, rows, tot, numFrom) => `<table><tr>${head.map((h, i) => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i >= numFrom ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}${tot ? `<tr class="tot">${tot.map((c, i) => `<td class="${i >= numFrom ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>` : ''}</table>`;
  const raw = n => !n ? '-' : n.bad ? '? ' + n.raw : n.raw + (n.fix ? ' *' : '');   // * = format tidak baku di PDF, ? = tidak terbaca (sel dikosongkan)

  function existing(r, cfg) {   // jumlah isian yang sudah ada dan akan ditimpa
    if (r.kind === 'kec') {
      if (r.id === 'kp') return r.rows.filter(x => x.n && KPS[kpKey(x.k)]).length;
      const get = r.id === 'pop' ? popGet : k => t2Get(r.id, k);
      return r.rows.filter(x => x.n && get(x.k) !== null).length;
    }
    if (r.kind === 'pek') return cfg.status.reduce((s, _, i) => s + (pkGet(i, 'l') !== null) + (pkGet(i, 'p') !== null), 0);
    const get = r.id === 'adhb' ? pdGet : pd2Get; let c = 0;
    r.rows.forEach((x, i) => x.vals.forEach((v, y) => { if (v && get(i, y) !== null) c++ })); return c;
  }
  function body(r, cfg) {
    if (r.kind === 'kec') {
      const cv = r.factor > 1;   // satuan di PDF ribu/juta -> tampilkan nilai yang akan disimpan
      return tbl(['No', 'Kecamatan', 'Nilai di PDF', ...(cv ? ['Disimpan'] : [])], r.rows.map((x, i) => [i + 1, x.k, raw(x.n), ...(cv ? [x.n && x.n.v !== null ? BPS.idn(x.n.v) : '-'] : [])]),
        r.kota ? ['', cfg.wil + ' (di PDF)', raw(r.kota), ...(cv ? [r.kota.v !== null ? BPS.idn(r.kota.v) : '-'] : [])] : null, 2);
    }
    if (r.kind === 'pek') return tbl(['No', 'Status di dashboard', 'Baris di PDF', 'Laki-Laki', 'Perempuan', 'Jumlah'], r.names.map((nm, i) => { const x = r.rows[i]; return [i + 1, nm, x ? x.label.slice(0, 48) : '-', x ? raw(x.l) : '-', x ? raw(x.p) : '-', x ? raw(x.t) : '-'] }), r.total ? ['', 'Jumlah (di PDF)', '', raw(r.total.l), raw(r.total.p), raw(r.total.t)] : null, 3);
    return tbl(['Kode', 'Lapangan usaha', ...r.years.map(String)], r.rows.map(x => [x.code, x.name.slice(0, 52), ...x.vals.map(raw)]), ['', 'PDRB total (di PDF)', ...r.total.map(raw)], 2);
  }
  function card(r, it, pgNums, cfg, texts, extra) {
    const ow = existing(r, cfg), lv = r.level;
    return `<div class="bps-c ${lv}" data-id="${it.id}"><div class="bps-ch"><input type="checkbox" class="bps-ck" ${r.canApply && lv !== 'err' ? 'checked' : 'disabled'} aria-label="Tempel ${esc(it.label)}"><b>${esc(it.label)}</b><span class="tg">→ ${it.target} · halaman PDF ${pgNums.filter(n => !(extra || []).includes(n)).join(', ')}${extra && extra.length ? ` <b title="Tabel berlanjut; halaman ini dibaca otomatis">(+${extra.join(', ')} otomatis)</b>` : ''}</span></div>
    <div class="bps-bd"><ul class="bps-m">${r.msgs.map(m => `<li class="${m.lv}">${esc(m.s)}</li>`).join('')}</ul>${ow ? `<div class="bps-ow">Akan menimpa ${ow} isian yang sudah ada di tabel.</div>` : ''}${r.canApply ? body(r, cfg) : ''}
    ${r.canApply ? '' : `<details><summary>Lihat teks yang terbaca di halaman tersebut</summary><div class="bps-tx">${esc(texts.join('\n──── halaman berikutnya ────\n').split('\n').slice(0, 45).join('\n'))}</div></details>`}</div></div>`;
  }

  let results = [];
  async function preview() {
    if (!doc) return;
    if (!ROWS.length) { msg.textContent = 'Unggah file utama (ZIP shapefile) dulu: daftar kecamatan dan nama wilayah diambil dari sana.'; return }
    go.disabled = true; msg.textContent = 'Membaca halaman PDF…'; results = [];
    const cfg = cfgNow();
    try {
      for (const it of ITEMS) {
        const val = $('#bp-' + it.id).value;
        let nums; try { nums = BPS.parsePages(val, doc.numPages) } catch (e) { throw new Error(`${it.label}: ${e.message}`) }
        const pgs = []; for (const n of nums) pgs.push(await page(n));
        const extra = [];   // tabel PDRB sering berlanjut ke halaman berikutnya: bila baris total belum ketemu, baca halaman "Lanjutan Tabel" berikutnya (maks. 2)
        if (it.id === 'adhb' || it.id === 'adhk') for (let k = 0; k < 2 && !BPS.parsePDRB(pgs).total; k++) {
          const nx = nums[nums.length - 1] + 1; if (nx > doc.numPages) break;
          const p = await page(nx); if (!/lanjutan|continued/i.test(p.text)) break;
          nums.push(nx); extra.push(nx); pgs.push(p);
        }
        results.push({ it, nums, pgs, extra, r: BPS.analyze(it.id, pgs, { ...cfg, pages: nums }) });
      }
    } catch (e) { msg.textContent = e.message; go.disabled = false; return }
    go.disabled = false; msg.textContent = 'Pratinjau siap.';
    showModal(cfg);
  }
  function showModal(cfg) {
    const m = document.createElement('div'); m.className = 'bps-modal';
    m.innerHTML = `<div class="bps-box" role="dialog" aria-label="Pratinjau data BPS"><div class="bps-h"><b>Pratinjau data dari PDF BPS</b><small>${esc(docName)} · wilayah di shapefile: ${esc(cfg.wil)} (${cfg.kecs.length} kecamatan). Bandingkan angka di bawah dengan PDF. Hanya item yang dicentang yang akan ditempel; isian lama di item itu akan ditimpa.</small></div>
    <div class="bps-b">${results.map(x => card(x.r, x.it, x.nums, cfg, x.pgs.map(p => p.text), x.extra)).join('')}</div>
    <div class="bps-f"><span id="bps-cnt" class="note"></span><div class="r"><button class="sec" id="bps-no">Batal</button><button id="bps-yes">Data sudah benar, tempel ke tabel</button></div></div></div>`;
    document.body.append(m);
    const cnt = () => { const n = m.querySelectorAll('.bps-ck:checked').length; m.querySelector('#bps-cnt').textContent = `${n} dari ${results.length} item dipilih`; m.querySelector('#bps-yes').disabled = !n };
    m.addEventListener('change', e => { if (e.target.matches('.bps-ck')) cnt() }); cnt();
    const close = () => { m.remove(); document.removeEventListener('keydown', esck) }, esck = e => { if (e.key === 'Escape') close() };
    document.addEventListener('keydown', esck);
    m.querySelector('#bps-no').onclick = close;
    m.addEventListener('mousedown', e => { if (e.target === m) close() });
    m.querySelector('#bps-yes').onclick = () => {
      const sel = new Set([...m.querySelectorAll('.bps-c')].filter(c => c.querySelector('.bps-ck').checked).map(c => c.dataset.id));
      close(); apply(sel, cfg);
    };
  }

  // ---------- tempel ke tabel ----------
  const num = n => n && n.v !== null ? n.v : null;
  function apply(sel, cfg) {
    const by = Object.fromEntries(results.map(x => [x.it.id, x.r])), done = [], tip = [];
    const kec = (id, set) => { by[id].rows.forEach(x => { if (x.n) set(x.k, num(x.n)) }); done.push(by[id].rows.filter(x => x.n).length + ' kecamatan ' + ITEMS.find(i => i.id === id).label.toLowerCase()) };
    if (sel.has('pop')) kec('pop', popSet);
    if (sel.has('laju')) kec('laju', (k, v) => t2Set('laju', k, v));
    if (sel.has('rasio')) kec('rasio', (k, v) => t2Set('rasio', k, v));
    if (sel.has('pek')) { by.pek.rows.forEach((x, i) => { pkSet(i, 'l', num(x.l)); pkSet(i, 'p', num(x.p)) }); done.push('status pekerjaan utama (' + by.pek.rows.length + ' baris)') }
    [['adhb', pdSet, 'PDRB ADHB (III-4)'], ['adhk', pd2Set, 'PDRB ADHK (III-5)']].forEach(([id, set, nm]) => {
      if (!sel.has(id)) return; let n = 0;
      by[id].rows.forEach((x, i) => x.vals.forEach((v, y) => { if (v) { set(i, y, num(v)); n++ } })); done.push(nm + ': ' + n + ' sel');
    });
    if (sel.has('kp')) {   // pasangkan dengan Jumlah Penduduk saat ini; kepadatan BPS dipakai selama Jiwa tidak berubah
      let n = 0, nj = 0; const js = [];
      by.kp.rows.forEach(x => { if (!x.n) return; const j = popGet(x.k); if (j === null) nj++; else js.push(j); kpSet(x.k, num(x.n), j); n++ });
      if (by.kp.kota && js.length) kpSet('__kota', num(by.kp.kota), js.reduce((a, b) => a + b, 0));
      done.push(n + ' kecamatan kepadatan penduduk'); if (nj) tip.push('Kepadatan ' + nj + ' kecamatan baru tampil setelah Jumlah Penduduk di Tabel III-1 terisi (ikut pilih item Jumlah Penduduk).');
    }
    const on = document.querySelector('.tab.on'), idx = on ? on.dataset.i : null;
    render(); if (idx !== null) document.querySelector(`.tab[data-i="${idx}"]`)?.click();
    msg.textContent = st.textContent = 'Data BPS ditempel: ' + (done.join('; ') || 'tidak ada item dipilih') + '.' + (tip.length ? ' ' + tip.join(' ') : '');
  }
  go.onclick = preview;
})();