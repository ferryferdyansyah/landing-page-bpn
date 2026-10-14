// dropzone-ui.js - progress bar + status "sudah diunggah" untuk kotak input
const DZ = (() => {
    const fmt = n => n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

    function ui(drop) {
        let u = drop.querySelector(':scope > .dz-ui');
        if (!u) { u = document.createElement('div'); u.className = 'dz-ui'; drop.append(u); drop.classList.add('dz'); }
        return u;
    }

    // Baca file dengan progress. Hasilnya ArrayBuffer.
    function read(drop, file) {
        const u = ui(drop);
        drop.classList.remove('done'); drop.classList.add('loading');
        u.innerHTML = '<div class="dz-name"></div><div class="dz-sub"></div><div class="dz-bar"><div class="dz-fill"></div></div>';
        u.querySelector('.dz-name').textContent = file.name;
        const sub = u.querySelector('.dz-sub'), fill = u.querySelector('.dz-fill');
        const set = p => { fill.style.width = p + '%'; sub.textContent = 'Mengunggah… ' + Math.round(p) + '%' };
        set(0);
        return new Promise((ok, no) => {
            const r = new FileReader();
            r.onprogress = e => e.lengthComputable && set(e.loaded / e.total * 80);
            r.onload = () => { fill.style.width = '90%'; sub.textContent = 'Memproses…'; ok(r.result) };
            r.onerror = () => no(r.error);
            r.readAsArrayBuffer(file);
        });
    }

    // Panggil setelah seluruh proses berhasil
    function done(drop, file) {
        const u = ui(drop), f = u.querySelector('.dz-fill');
        if (f) f.style.width = '100%';
        setTimeout(() => {
            u.innerHTML = '<div class="dz-check">✓</div><div class="dz-name"></div><div class="dz-sub">Data sudah diunggah · ketuk untuk mengubah data</div>';
            u.querySelector('.dz-name').textContent = file.name + ' (' + fmt(file.size) + ')';
            drop.classList.remove('loading'); drop.classList.add('done');
        }, 350);
    }

    // Panggil kalau gagal: kotak kembali ke tampilan awal
    function fail(drop) { drop.classList.remove('loading', 'done') }

    return { read, done, fail };
})();