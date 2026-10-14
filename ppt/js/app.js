// app.js - halaman Generate PPT: input (template + data) -> loading -> preview/edit -> simpan PPTX / PDF.
(() => {
  const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const BG = window.BG_DATA || { cover: 'assets/cover.jpg', outline: 'assets/outline.jpg', content: 'assets/content.jpg' };
  // Unduh blob sebagai file (tidak bergantung pada FileSaver/writeFile pustaka)
  const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 5000) };
  const baseName = () => 'Integrasi_NPGT_' + ((deck && deck[0].els[2] && deck[0].els[2].text) || 'Regional').replace(/[^\w]+/g, '_');
  let note = '', tplBuf = null, tplName = '', dataBuf = null, dataName = '', hatBuf = null, hatName = '', tsBuf = null, tsName = '', deck = null, cur = 0, sel = -1;

  // ---------- Akses: Trial / Akun (sama seperti halaman lain) ----------
  (async () => {
    const TRIAL = new URLSearchParams(location.search).get('mode') === 'trial', theme = $('#theme');
    const home = () => location.href = '../index.html';
    if (TRIAL) { theme.insertAdjacentHTML('beforebegin', '<span class="hsp" style="flex:1"></span><span class="trial" style="background:#f59e0b;color:#3b2300;font-weight:700;font-size:12px;padding:4px 10px;border-radius:999px">Mode Trial</span><button class="hb" id="thome">Beranda</button>'); $('#thome').onclick = home }
    else {
      const { data: { session } } = await supa.auth.getSession();
      if (!session) return location.replace('../index.html');
      theme.insertAdjacentHTML('beforebegin', `<span style="flex:1"></span><span style="font-size:12px;opacity:.85">${esc(session.user.email)}</span><button class="hb" id="thome">Beranda</button><button class="hb" id="logout">Keluar</button>`);
      $('#thome').onclick = home; $('#logout').onclick = async () => { await supa.auth.signOut(); home() };
    }
    document.documentElement.classList.remove('guard');
  })();
  const root = document.documentElement, tb = $('#theme'); tb.onclick = () => { root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light'; tb.textContent = root.dataset.theme === 'light' ? '☾' : '☀' }; tb.textContent = '☀';

  // ---------- Input (dengan animasi progress unggah) ----------
  const ready = () => { $('#gen').disabled = !(tplBuf && dataBuf) };
  function bind(drop, fi, cb) {
    drop.onclick = () => fi.click(); fi.onchange = () => fi.files[0] && pick(fi.files[0]);
    ['dragover', 'dragenter'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over') }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over') }));
    drop.addEventListener('drop', e => e.dataTransfer.files[0] && pick(e.dataTransfer.files[0]));
    async function pick(f) { try { const b = await DZ.read(drop, f); cb(f, b); DZ.done(drop, f) } catch (err) { DZ.fail(drop); $('#status').textContent = 'Gagal membaca file: ' + err.message } ready() }
  }
  bind($('#dropT'), $('#fileT'), (f, b) => { if (!/\.(pdf|pptx)$/i.test(f.name)) throw new Error('Template harus berformat .pdf atau .pptx'); tplBuf = b; tplName = f.name });
  bind($('#dropD'), $('#fileD'), (f, b) => { if (!/\.zip$/i.test(f.name)) throw new Error('Data harus berupa .zip shapefile'); dataBuf = b; dataName = f.name });

  bind($('#dropH'), $('#fileH'), (f, b) => { if (!/\.zip$/i.test(f.name)) throw new Error('HAT harus berupa .zip shapefile'); hatBuf = b; hatName = f.name });
  bind($('#dropS'), $('#fileS'), (f, b) => { if (!/\.zip$/i.test(f.name)) throw new Error('TS harus berupa .zip shapefile titik survei'); tsBuf = b; tsName = f.name });

  // ---------- Loading + generate ----------
  const STEPS = ['Membaca template', 'Membaca data shapefile (DJPA, HAT, TS)', 'Menghitung tabel & ringkasan', 'Memuat basemap, menggambar peta & menyusun slide'];
  const wait = () => new Promise(r => setTimeout(r, 40));
  function busy(on, step, pct, msg) {
    $('#busy').hidden = !on; if (!on) return;
    $('#bsteps').innerHTML = STEPS.map((s, i) => `<li class="${i < step ? 'ok' : i === step ? 'on' : ''}">${s}</li>`).join('');
    $('#bfill').style.width = pct + '%'; $('#bmsg').textContent = msg || '';
  }
  $('#gen').onclick = async () => {
    try {
      busy(true, 0, 5, 'Membaca ' + tplName + '…'); await wait();
      const pages = await parseTemplate(tplName, tplBuf);
      busy(true, 1, 20, 'Membaca ' + dataName + '…'); await wait();
      const rows = await readShapefile(dataBuf.slice(0), (p, m) => busy(true, 1, p, m));
      busy(true, 2, 75, rows.length.toLocaleString('id-ID') + ' poligon dibaca'); await wait();
      let hat = null, ts = null, extra = '';
      if (hatBuf) { busy(true, 1, 78, 'Membaca ' + hatName + '…'); await wait(); try { hat = await readHat(hatBuf.slice(0), () => { }) } catch (e) { extra += ' HAT dilewati: ' + e.message + '.'; console.warn(e) } }
      if (tsBuf) { busy(true, 1, 82, 'Membaca ' + tsName + '…'); await wait(); try { ts = await readPoints(tsBuf.slice(0), () => { }, rows) } catch (e) { extra += ' TS dilewati: ' + e.message + '.'; console.warn(e) } }
      const nama = $('#kab').value.trim() || rows[0].WADMKK || 'Kabupaten/Kota';
      busy(true, 3, 86, 'Memuat basemap satelit…'); await wait();
      const bm = await prepareBasemap(rows, $('#basemap').value, (d, t) => busy(true, 3, 86 + Math.round(d / t * 8), `Memuat basemap satelit ${d}/${t} tile…`));
      if (bm.used === null) extra += ' Basemap gagal dimuat (jaringan/CORS diblokir) - peta memakai latar polos.'; else if (bm.fallback) extra += ' Google Satelit tidak bisa dimuat, dipakai Esri World Imagery.';
      busy(true, 3, 95, 'Menggambar peta (bisa memakan waktu beberapa detik)…'); await wait();
      const res = buildSlides(rows, pages, nama, { hat, ts }); deck = res.slides; cur = 0; sel = -1; note = (rows.renamed.length ? ' Kolom dikenali: ' + rows.renamed.join(', ') + '.' : '') + (res.info.skipped.length ? ' Catatan: ' + res.info.skipped.join('; ') + '.' : '') + extra;
      busy(true, 4, 100, 'Selesai'); await wait();
      $('#input').style.display = 'none'; $('#editor').classList.add('on'); show(); busy(false);
      $('#status').textContent = `${deck.length} slide dibuat untuk ${nama}. Klik teks/tabel untuk mengedit.` + note;
    } catch (err) { console.error(err); busy(false); $('#status').textContent = 'Gagal: ' + err.message }
  };
  $('#back').onclick = () => { $('#editor').classList.remove('on'); $('#input').style.display = '' };

  // ---------- Render slide (preview & thumbnail & cetak) ----------
  const style = e => `left:${e.x}px;top:${e.y}px;width:${e.w}px;` + (e.h ? `height:${e.h}px;` : '');
  function svgBar(e) {
    const mx = Math.max(...e.items.map(i => i.v), 1), lw = e.w * (e.lwf || .42), ih = e.h / e.items.length, bh = Math.min(ih * .7, 22), tr = e.trunc || 34, fm = e.fmt === 'pct' ? v => NF(v) + '%' : e.fmt === 'int' ? v => (+v).toLocaleString('id-ID') : NF;
    return `<svg width="${e.w}" height="${e.h}" font-family="Montserrat,Arial" font-size="12">` + e.items.map((i, n) => { const y = n * ih + (ih - bh) / 2, w = (e.w - lw - 80) * i.v / mx; return `<text x="${lw - 6}" y="${y + bh / 2 + 4}" text-anchor="end" fill="#10243a">${esc(i.k.length > tr ? i.k.slice(0, tr - 1) + '…' : i.k)}</text><rect x="${lw}" y="${y}" width="${Math.max(w, 1)}" height="${bh}" fill="${NAVY}"/><text x="${lw + w + 5}" y="${y + bh / 2 + 4}" fill="#10243a">${fm(i.v)}</text>` }).join('') + '</svg>';
  }
  function svgPie(e) {
    const T = e.items.reduce((s, i) => s + i.v, 0) || 1, r = Math.min(e.h, e.w * .45) / 2 - 6, cx = r + 10, cy = e.h / 2, lh = Math.min(24, (e.h - 12) / e.items.length); let a = -Math.PI / 2, out = `<svg width="${e.w}" height="${e.h}" font-family="Montserrat,Arial" font-size="12">`;
    e.items.forEach((i, n) => { const b = a + i.v / T * 2 * Math.PI, big = b - a > Math.PI ? 1 : 0, f = i.c || PAL[n % PAL.length];
      out += i.v / T > .9999 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>` : `<path d="M${cx},${cy} L${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} A${r},${r} 0 ${big} 1 ${cx + r * Math.cos(b)},${cy + r * Math.sin(b)} Z" fill="${f}" stroke="#fff"/>`;
      out += `<rect x="${cx * 2 + 16}" y="${8 + n * lh}" width="12" height="12" fill="${f}"/><text x="${cx * 2 + 34}" y="${19 + n * lh}" fill="#10243a">${esc(i.k.length > 30 ? i.k.slice(0, 29) + '…' : i.k)} (${PC(i.v / T * 100)})</text>`; a = b });
    return out + '</svg>';
  }
  function tableHTML(e, i, edit) {
    const cw = e.cw || e.head.map(() => 1 / e.head.length), ce = edit ? ' contenteditable="true"' : '', isN = c => (e.num || []).includes(c);
    return `<table style="font-size:${e.sz}px"><colgroup>${cw.map(w => `<col style="width:${w * 100}%">`).join('')}</colgroup><tr style="height:${e.rh}px">${e.head.map((h, c) => `<th class="${isN(c) ? 'n' : ''}"${ce} data-i="${i}" data-r="-1" data-c="${c}">${esc(h)}</th>`).join('')}</tr>` +
      e.rows.map((r, ri) => `<tr style="height:${e.rh}px" class="${e.tot && ri === e.rows.length - 1 ? 'tot' : (e.bold || []).includes(ri) ? 'grp' : ''}">${r.map((v, c) => `<td class="${isN(c) ? 'n' : ''}"${ce} data-i="${i}" data-r="${ri}" data-c="${c}">${esc(v)}</td>`).join('')}</tr>`).join('') + '</table>';
  }
  function slideEl(s, n, edit) {
    const d = document.createElement('div'); d.className = 'sl'; d.style.backgroundImage = `url(${BG[s.bg]})`;
    d.innerHTML = s.els.map((e, i) => {
      const c = `class="el ${e.t}${edit && i === sel ? ' sel' : ''}" data-i="${i}"`;
      if (e.t === 'text') return `<div ${c} ${edit && !e.auto ? 'contenteditable="true"' : ''} style="${style(e)}font-size:${e.sz}px;color:${e.c};font-weight:${e.b ? 700 : 400};text-align:${e.al};justify-content:${e.v === 'middle' ? 'center' : 'flex-start'};${e.fill ? 'background:' + e.fill + ';padding:0 10px;' : ''}">${esc(e.auto === 'pg' ? n + 1 : e.text)}</div>`;
      if (e.t === 'table') return `<div ${c} style="${style(e)}">${tableHTML(e, i, edit)}</div>`;
      if (e.t === 'bar') return `<div ${c} style="${style(e)}">${svgBar(e)}</div>`;
      if (e.t === 'pie') return `<div ${c} style="${style(e)}">${svgPie(e)}</div>`;
      return `<div ${c} style="${style(e)}"><img src="${e.src}" alt=""></div>`;
    }).join('');
    return d;
  }
  function show(keepScroll) {
    cur = Math.min(Math.max(cur, 0), deck.length - 1);
    const st = $('#stage'); st.innerHTML = ''; st.append(slideEl(deck[cur], cur, true));
    $('#stage').closest('.stagewrap').scrollTop = keepScroll ? $('#stage').closest('.stagewrap').scrollTop : 0;
    placeHandles(); thumbs(); $('#cnt').textContent = `Slide ${cur + 1} / ${deck.length}`;
  }
  function thumbs() { const t = $('#thumbs'); t.innerHTML = ''; deck.forEach((s, i) => { const w = document.createElement('div'); w.className = 'th' + (i === cur ? ' on' : ''); w.append(slideEl(s, i, false)); w.insertAdjacentHTML('beforeend', `<i>${i + 1}</i>`); w.onclick = () => { cur = i; sel = -1; show() }; t.append(w) }) }
  let tmr; const later = () => { clearTimeout(tmr); tmr = setTimeout(thumbs, 600) };

  // ---------- Edit: teks, sel tabel, pilih/geser/hapus elemen ----------
  const stage = $('#stage');
  stage.addEventListener('input', e => {
    const n = e.target.closest('[data-i]'); if (!n) return; const el = deck[cur].els[+n.dataset.i];
    if (el.t === 'text') el.text = n.innerText; else if (el.t === 'table' && e.target.dataset.c !== undefined) { const r = +e.target.dataset.r, c = +e.target.dataset.c; (r < 0 ? el.head : el.rows[r])[c] = e.target.innerText }
    // Slide Sosial Ekonomi: isi jumlah penduduk -> kepadatan, total & teks analisis terhitung otomatis
    if (el.t === 'table' && el.fx === 'sosek' && +e.target.dataset.c === deck[cur].meta.denCol) {
      const r = sosekRecalc(deck[cur]);
      r.cells.forEach(([ri, ci, v]) => { const td = stage.querySelector(`[data-i="${n.dataset.i}"][data-r="${ri}"][data-c="${ci}"]`); if (td && td !== e.target) td.textContent = v });
      const ti = deck[cur].els.findIndex(x => x.fx === 'sosekText'), tn = ti >= 0 && stage.querySelector(`.el[data-i="${ti}"]`); if (tn && r.text != null) tn.textContent = r.text;
    }
    later();
  });
  const mark = () => { stage.querySelectorAll('.el').forEach(n => n.classList.toggle('sel', +n.dataset.i === sel)); placeHandles() };
  // Pegangan elemen terpilih: ✥ (pindah) di atas-kiri, kotak di pojok kanan-bawah (ubah ukuran).
  function placeHandles() {
    const sl = stage.firstChild; if (!sl) return; sl.querySelectorAll('.hd').forEach(h => h.remove());
    const n = sel >= 0 && sl.querySelector(`.el[data-i="${sel}"]`); if (!n) return;
    const x = n.offsetLeft, y = n.offsetTop, w = n.offsetWidth, h = n.offsetHeight;
    sl.insertAdjacentHTML('beforeend', `<div class="hd mv" data-act="mv" title="Seret untuk memindah" style="left:${x}px;top:${Math.max(0, y - 22)}px">✥</div><div class="hd rz" data-act="rz" title="Seret untuk mengubah ukuran" style="left:${x + w - 10}px;top:${y + h - 10}px"></div>`);
  }
  function dragHandle(e, act) {
    e.preventDefault(); const el = deck[cur].els[sel], n = stage.querySelector(`.el[data-i="${sel}"]`); if (!el || !n) return;
    const sc = stage.firstChild.getBoundingClientRect().width / 1280, sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y, ow = n.offsetWidth, oh = n.offsetHeight;
    const mv = ev => { const dx = (ev.clientX - sx) / sc, dy = (ev.clientY - sy) / sc;
      if (act === 'mv') { el.x = Math.round(ox + dx); el.y = Math.round(oy + dy); n.style.left = el.x + 'px'; n.style.top = el.y + 'px' }
      else { el.w = Math.max(40, Math.round(ow + dx)); n.style.width = el.w + 'px';
        if (el.t === 'table') { el.rh = Math.max(12, Math.round((oh + dy) / (el.rows.length + 1))); n.querySelectorAll('tr').forEach(r => r.style.height = el.rh + 'px'); if (el.sz > el.rh * .6) { el.sz = Math.max(8, Math.floor(el.rh * .6)); n.querySelector('table').style.fontSize = el.sz + 'px' } }
        else { el.h = Math.max(20, Math.round(oh + dy)); n.style.height = el.h + 'px' } }
      placeHandles() };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); show(true) };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  }
  stage.addEventListener('mousedown', e => {
    const hd = e.target.closest('.hd'); if (hd) return dragHandle(e, hd.dataset.act);
    const n = e.target.closest('.el'); if (!n) { sel = -1; mark(); return }
    sel = +n.dataset.i; mark();
    // geser: tahan Alt untuk teks/tabel, atau seret langsung untuk gambar/grafik
    const el = deck[cur].els[sel], editable = el.t === 'text' || el.t === 'table';
    if (editable && !e.altKey) return; e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = el.x, oy = el.y, sc = stage.firstChild.getBoundingClientRect().width / 1280;
    const mv = ev => { el.x = Math.round(ox + (ev.clientX - sx) / sc); el.y = Math.round(oy + (ev.clientY - sy) / sc); n.style.left = el.x + 'px'; n.style.top = el.y + 'px' };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); thumbs() };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  const delEl = () => { if (sel < 0) return; deck[cur].els.splice(sel, 1); sel = -1; show(true) };
  addEventListener('keydown', e => { if (e.key === 'Delete' && sel >= 0 && !e.target.isContentEditable && $('#editor').classList.contains('on')) delEl() });
  $('#delEl').onclick = delEl;
  const fs = d => { const el = deck[cur].els[sel]; if (!el || !(el.t === 'text' || el.t === 'table')) return; if (el.t === 'text') el.sz = Math.max(8, el.sz + d); else el.sz = Math.max(8, el.sz + d); show(true) };
  $('#fsUp').onclick = () => fs(1); $('#fsDn').onclick = () => fs(-1);
  $('#dup').onclick = () => { deck.splice(cur + 1, 0, JSON.parse(JSON.stringify(deck[cur]))); cur++; sel = -1; show() };
  $('#del').onclick = () => { if (deck.length < 2 || !confirm('Hapus slide ini?')) return; deck.splice(cur, 1); sel = -1; show() };
  $('#up').onclick = () => { if (cur > 0) { [deck[cur - 1], deck[cur]] = [deck[cur], deck[cur - 1]]; cur--; show() } };
  $('#dn').onclick = () => { if (cur < deck.length - 1) { [deck[cur + 1], deck[cur]] = [deck[cur], deck[cur + 1]]; cur++; show() } };
  $('#addI').onclick = () => { const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.onchange = () => { const f = fi.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const w = Math.min(600, im.width), h = Math.round(w * im.height / im.width); deck[cur].els.push({ t: 'img', x: 340, y: 150, w, h, src: r.result }); sel = deck[cur].els.length - 1; show(true) }; im.src = r.result }; r.readAsDataURL(f) }; fi.click() };
  $('#addT').onclick = () => { deck[cur].els.push({ t: 'text', x: 100, y: 300, w: 500, h: 60, text: 'Teks baru', sz: 20, c: '#10243a', al: 'left', v: 'top' }); sel = deck[cur].els.length - 1; show(true) };

  // ---------- Simpan PDF (langsung diunduh: 1 slide = 1 halaman) ----------
  $('#pdf').onclick = async () => {
    const b = $('#pdf'), old = b.textContent; b.disabled = true; let host;
    try {
      if (!window.html2canvas || !window.jspdf) throw new Error('Pustaka PDF (jsPDF/html2canvas) belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:720px;pointer-events:none'; document.body.append(host);
      const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720], compress: true, hotfixes: ['px_scaling'] });
      for (let i = 0; i < deck.length; i++) {
        b.textContent = `PDF ${i + 1}/${deck.length}…`; host.innerHTML = ''; const el = slideEl(deck[i], i, false); host.append(el);
        await Promise.all([...el.querySelectorAll('img')].map(im => im.decode ? im.decode().catch(() => { }) : 0)); await wait();
        const cv = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff', logging: false, width: 1280, height: 720 });
        if (i) pdf.addPage([1280, 720], 'landscape'); pdf.addImage(cv.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 1280, 720);
      }
      saveBlob(pdf.output('blob'), baseName() + '.pdf');
    } catch (err) { console.error(err); alert('Gagal membuat PDF: ' + err.message) }
    if (host) host.remove(); b.disabled = false; b.textContent = old;
  };

  // ---------- Simpan PPTX ----------
  const hx = c => { c = String(c).replace('#', ''); return c.length === 3 ? c.split('').map(x => x + x).join('') : c.toUpperCase() };
  const b64 = async url => { if (/^data:/.test(url)) return url.replace(/^data:/, ''); const r = await fetch(url), b = await r.blob(); return new Promise(ok => { const f = new FileReader(); f.onload = () => ok(String(f.result).replace(/^data:/, '')); f.readAsDataURL(b) }) };
  $('#pptx').onclick = async () => {
    const b = $('#pptx'); b.disabled = true; const old = b.textContent; b.textContent = 'Menyiapkan…';
    try {
      const px = new PptxGenJS(); px.layout = 'LAYOUT_WIDE'; const k = 13.333 / 1280, F = 'Montserrat', bg = {};
      for (const n in BG) bg[n] = await b64(BG[n]);
      deck.forEach((s, n) => {
        const sl = px.addSlide(); sl.background = { data: bg[s.bg] };
        s.els.forEach(e => {
          const pos = { x: e.x * k, y: e.y * k, w: e.w * k, h: (e.h || 30) * k };
          if (e.t === 'text') sl.addText(e.auto === 'pg' ? String(n + 1) : e.text, { ...pos, fontFace: F, fontSize: e.sz * .75, bold: !!e.b, color: hx(e.c), align: e.al, valign: e.v === 'middle' ? 'middle' : 'top', margin: e.fill ? [0, 8, 0, 8] : 0, ...(e.fill ? { fill: { color: hx(e.fill) } } : {}) });
          else if (e.t === 'table') {
            const cw = (e.cw || e.head.map(() => 1 / e.head.length)).map(w => w * e.w * k), isN = c => (e.num || []).includes(c);
            const head = e.head.map((h, c) => ({ text: h, options: { bold: true, fill: { color: 'FDBF2D' }, color: '10243A', align: isN(c) ? 'right' : 'left' } }));
            const rows = e.rows.map((r, ri) => r.map((v, c) => ({ text: v, options: { align: isN(c) ? 'right' : 'left', bold: !!((e.tot && ri === e.rows.length - 1) || (e.bold || []).includes(ri)), color: '10243A', ...(e.tot && ri === e.rows.length - 1 ? { fill: { color: 'E4ECF4' } } : (e.bold || []).includes(ri) ? { fill: { color: 'FDF1D6' } } : {}) } })));
            sl.addTable([head, ...rows], { x: pos.x, y: pos.y, w: e.w * k, colW: cw, rowH: e.rh * k, fontFace: F, fontSize: e.sz * .75, border: { type: 'solid', color: '9FB2C4', pt: .75 }, valign: 'middle' });
          } else if (e.t === 'bar') sl.addChart(px.charts.BAR, [{ name: 'Luas (Ha)', labels: e.items.map(i => i.k), values: e.items.map(i => i.v) }], { ...pos, barDir: 'bar', catAxisOrientation: 'maxMin', chartColors: [hx(NAVY)], showValue: true, dataLabelFormatCode: e.fmt === 'pct' ? '#,##0.00"%"' : e.fmt === 'int' ? '#,##0' : '#,##0.00', dataLabelFontSize: 9, catAxisLabelFontSize: 9, valAxisHidden: true, valGridLine: { style: 'none' }, showLegend: false, barGapWidthPct: 40 });
          else if (e.t === 'pie') sl.addChart(px.charts.PIE, [{ name: 'Luas (Ha)', labels: e.items.map(i => i.k), values: e.items.map(i => i.v) }], { ...pos, chartColors: e.items.map((i, n) => hx(i.c || PAL[n % PAL.length])), showLegend: true, legendPos: 'r', legendFontSize: 9, showPercent: true, showValue: false, dataLabelColor: 'FFFFFF', dataLabelFontSize: 9 });
          else if (e.t === 'img') sl.addImage({ data: e.src.replace(/^data:/, ''), ...pos });
        });
      });
      let blob; try { blob = await px.write({ outputType: 'blob' }) } catch (e) { blob = await px.write('blob') }
      saveBlob(blob, baseName() + '.pptx');
    } catch (err) { console.error(err); alert('Gagal membuat PPTX: ' + err.message) }
    b.disabled = false; b.textContent = old;
  };
})();
