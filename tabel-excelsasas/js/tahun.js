// tahun.js - kotak input tahun penggunaan tanah lama dan baru. Dimuat SETELAH main.js.
(() => {
    const anchor = document.getElementById('drop2') || document.getElementById('drop'); if (!anchor) return;
    const css = document.createElement('style');
    css.textContent = `#tahunbox{margin-top:10px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--mut)}
  #tahunbox input{width:84px;margin-left:6px;padding:6px 8px;border:1px solid var(--bd);border-radius:8px;background:var(--card);color:var(--tx);font:inherit}
  #tahunbox small{flex-basis:100%}`;
    document.head.append(css);
    const box = document.createElement('div'); box.id = 'tahunbox';
    box.innerHTML = `<label>Tahun penggunaan tanah lama<input type="number" id="th-lama" min="1900" max="2100" value="${TH_LAMA}"></label>
    <label>Tahun penggunaan tanah baru<input type="number" id="th-baru" min="1900" max="2100" value="${TH_BARU}"></label>
    <small>Dipakai untuk judul tabel/grafik dan hitungan laju per tahun. Tersimpan di browser ini.</small>`;
    anchor.after(box);
    const a = document.getElementById('th-lama'), b = document.getElementById('th-baru'), st = document.getElementById('status');
    const apply = () => {
        const l = parseInt(a.value, 10), n = parseInt(b.value, 10);
        if (!(l >= 1900 && n <= 2100 && l < n)) { st.textContent = 'Tahun lama harus lebih kecil dari tahun baru (1900-2100).'; a.value = TH_LAMA; b.value = TH_BARU; return }
        if (l === TH_LAMA && n === TH_BARU) return;
        TH_LAMA = l; TH_BARU = n;
        try { localStorage.setItem('djpa_tahun', JSON.stringify({ lama: l, baru: n })) } catch (e) { }
        const on = document.querySelector('.tab.on'), idx = on ? on.dataset.i : null;
        render();
        if (idx !== null) document.querySelector(`.tab[data-i="${idx}"]`)?.click();
        st.textContent = `Tahun diubah: lama ${l}, baru ${n}.`;
    };
    a.onchange = b.onchange = apply;
})();