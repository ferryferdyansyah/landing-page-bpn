// hat.js - Input kedua: file HAT (ZIP shapefile hak atas tanah) -> mengisi Tabel IV-18 dan Tabel III-9 per kecamatan.
// Dimuat SETELAH main.js. Syarat kolom di HAT: TIPEHAK, LUAS_HA, WADMKC (nama kecamatan, sama dengan file utama).

// ====== PENGATURAN: ubah di sini bila pembagian jenis hak berbeda ======
const HAT_ADA = ['hak milik', 'hak pakai', 'hak guna bangunan', 'hak wakaf'];   // -> kolom "Ada HAT" (IV-18)
const HAT_BELUM = ['kosong', 'hak belum terdaftar'];                              // -> kolom "Belum Ada HAT" (IV-18)
const HAT_GALAT = ['hak belum terdaftar'];                                        // -> Jumlah Bidang & Luas di III-9
// =======================================================================

(() => {
    const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const st = document.getElementById('status');
    const drop2 = document.getElementById('drop2'), fi2 = document.getElementById('file2');
    if (!drop2 || !fi2) return;

    async function loadHAT(file) {
        if (!ROWS.length) { st.textContent = 'Unggah file utama (ZIP shapefile) dulu, baru file HAT.'; return }
        st.textContent = 'Membaca HAT ' + file.name + '…';
        try {
            const zip = await JSZip.loadAsync(file);
            const e = Object.values(zip.files).find(f => !f.dir && /\.dbf$/i.test(f.name));
            if (!e) { st.textContent = 'File .dbf tidak ditemukan di dalam ZIP HAT.'; return }
            const p = parseDBF(await e.async('arraybuffer')), cc = canonCols(p.cols, p.rows, ['TIPEHAK', 'LUASHA', 'WADMKC']);
            const cols = cc.cols, rows = p.rows;   // LUAS_HA / luas_ha / LUASHA dianggap sama
            const miss = ['TIPEHAK', 'LUASHA', 'WADMKC'].filter(c => !cols.includes(c));
            if (miss.length) { st.textContent = 'Kolom HAT tidak ditemukan: ' + miss.join(', '); return }

            const agg = {};
            for (const r of rows) {
                const kn = norm(r.WADMKC); if (!kn) continue;
                const t = norm(r.TIPEHAK), ha = parseFloat(r.LUASHA) || 0;
                const a = agg[kn] ??= { ada: 0, belum: 0, gb: 0, gl: 0 };
                if (HAT_ADA.includes(t)) a.ada += ha;
                if (HAT_BELUM.includes(t)) a.belum += ha;
                if (HAT_GALAT.includes(t)) { a.gb += 1; a.gl += ha }
            }

            const kecs = [...new Set(ROWS.map(kecOf))].filter(k => k !== '-');
            let ok = 0; const unmatched = Object.keys(agg).filter(kn => !kecs.some(k => norm(k) === kn));
            for (const k of kecs) {
                const a = agg[norm(k)]; if (!a) continue;
                skSet(k, 'a', a.ada); skSet(k, 'b', a.belum);   // Tabel IV-18
                glSet(k, 'b', a.gb); glSet(k, 'l', a.gl);       // Tabel III-9
                ok++;
            }

            const on = document.querySelector('.tab.on'), idx = on ? on.dataset.i : null;
            render();
            if (idx !== null) document.querySelector(`.tab[data-i="${idx}"]`)?.click();
            document.getElementById('dl').disabled = false;

            let msg = `HAT ${file.name}: ${rows.length.toLocaleString('id')} bidang, ${ok} kecamatan terisi (Tabel IV-18 & III-9).`;
            if (unmatched.length) msg += ` Peringatan: kecamatan di HAT tidak cocok dengan file utama → ${unmatched.join(', ')}.`;
            if (ok < kecs.length) msg += ` ${kecs.length - ok} kecamatan di file utama tidak ada di HAT.`;
            st.textContent = msg;
        } catch (err) { st.textContent = 'Gagal membaca HAT: ' + err.message }
    }

    drop2.onclick = () => fi2.click();
    fi2.onchange = () => { fi2.files[0] && loadHAT(fi2.files[0]); fi2.value = '' };
    ['dragover', 'dragenter'].forEach(t => drop2.addEventListener(t, e => { e.preventDefault(); drop2.classList.add('over') }));
    ['dragleave', 'drop'].forEach(t => drop2.addEventListener(t, e => { e.preventDefault(); drop2.classList.remove('over') }));
    drop2.addEventListener('drop', e => e.dataTransfer.files[0] && loadHAT(e.dataTransfer.files[0]));
})();