/* Dimuat SETELAH app.js. Menambahkan: guard login, simpan file ke Supabase, dan daftar "File Saya".
   app.js tidak perlu diubah: fungsi load() dibungkus di sini. */
(async () => {
    const BUCKET = 'shapefiles', MAX = 50 * 1024 * 1024;

    // 1. Mode akses: trial (tanpa simpan) atau akun (simpan ke database)
    const TRIAL = new URLSearchParams(location.search).get('mode') === 'trial';
    if (TRIAL) {
        document.documentElement.classList.remove('guard');
        const pk = $('#pick');
        pk.insertAdjacentHTML('beforebegin', '<span class="usr" title="Data yang diunggah tidak disimpan ke database">Mode Trial · data tidak disimpan</span><button class="btn ghost" id="tlogin">Masuk / Daftar</button><button class="btn ghost" id="thome">Beranda</button>');
        $('#tlogin').onclick = () => location.href = 'login.html?next=index.html';
        $('#thome').onclick = () => location.href = '../index.html';
        return; // trial: tidak ada penyimpanan, tidak ada "File Saya"
    }

    // Guard login: tanpa sesi, kembali ke beranda untuk memilih trial / masuk
    const { data: { session } } = await supa.auth.getSession();
    if (!session) { location.replace('../index.html'); return }
    const user = session.user;
    document.documentElement.classList.remove('guard');
    supa.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('../index.html') });

    // 2. Tombol di header + modal
    const iconFiles = '<svg class="i" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
    const iconOut = '<svg class="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';
    const pick = $('#pick');
    pick.insertAdjacentHTML('beforebegin', `<button class="btn ghost" id="myfiles">${iconFiles}File Saya</button>`);
    pick.insertAdjacentHTML('afterend', `<span class="usr" title="${esc(user.email)}">${esc(user.email)}</span><button class="icon-btn" id="logout" title="Keluar" aria-label="Keluar">${iconOut}</button>`);
    document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="fmod" hidden><div class="mbox" role="dialog" aria-label="File Saya"><div class="mh"><b>File Saya</b><button class="btn sm ghost" id="fclose">Tutup</button></div><div class="fl" id="flist"></div></div></div>`);

    const modal = $('#fmod'), list = $('#flist');
    const toast = t => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 3500) };
    const size = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
    const date = s => new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    $('#logout').onclick = async () => { await supa.auth.signOut(); location.replace('../index.html') };
    $('#fclose').onclick = () => modal.hidden = true;
    modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true });

    // 3. Simpan otomatis setelah file berhasil dibaca
    const orig = load;
    load = async (file, skipSave) => {
        const before = rows;
        await orig(file);
        if (skipSave || !file || rows === before) return; // gagal dibaca, atau dibuka dari File Saya
        await save(file);
    };

    async function save(file) {
        if (file.size > MAX) return toast('File lebih dari 50 MB, tidak disimpan ke akun.');
        const path = `${user.id}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
        // Windows sering memberi tipe application/x-zip-compressed; paksa jadi application/zip
        const blob = new Blob([file], { type: 'application/zip' });
        const up = await supa.storage.from(BUCKET).upload(path, blob, { contentType: 'application/zip' });
        if (up.error) return toast('Gagal menyimpan file: ' + up.error.message);
        const ins = await supa.from('files').insert({ name: file.name, size: file.size, path });
        if (ins.error) { await supa.storage.from(BUCKET).remove([path]); return toast('Gagal mencatat file: ' + ins.error.message) }
        toast('File tersimpan di akun Anda.');
    }

    // 4. Daftar, buka, hapus
    async function refresh() {
        list.innerHTML = '<p class="mu">Memuat...</p>';
        const { data, error } = await supa.from('files').select('*').order('created_at', { ascending: false });
        if (error) { list.innerHTML = `<p class="mu">Gagal memuat daftar: ${esc(error.message)}</p>`; return }
        if (!data.length) { list.innerHTML = '<p class="mu">Belum ada file tersimpan. Unggah ZIP shapefile, maka file akan tersimpan otomatis.</p>'; return }
        list.innerHTML = data.map(f => `<div class="fr"><div class="fi"><div class="fn" title="${esc(f.name)}">${esc(f.name)}</div><div class="fm2">${size(f.size)} · ${date(f.created_at)}</div></div><button class="btn sm" data-o="${f.id}">Buka</button><button class="btn sm del" data-d="${f.id}">Hapus</button></div>`).join('');
        list._data = data;
    }

    $('#myfiles').onclick = () => { modal.hidden = false; refresh() };

    list.addEventListener('click', async e => {
        const b = e.target.closest('button'); if (!b || !list._data) return;
        const f = list._data.find(x => x.id === (b.dataset.o || b.dataset.d)); if (!f) return;
        if (b.dataset.o) {
            modal.hidden = true;
            $('#empty').style.display = 'none'; $('#load').style.display = 'flex'; setProg('Mengunduh file...', 10);
            const { data, error } = await supa.storage.from(BUCKET).download(f.path);
            if (error) { $('#load').style.display = 'none'; if (!rows.length) $('#empty').style.display = 'flex'; return toast('Gagal mengunduh: ' + error.message) }
            await load(new File([data], f.name), true);
        } else {
            if (!confirm(`Hapus "${f.name}" dari akun Anda?`)) return;
            b.disabled = true;
            const r = await supa.storage.from(BUCKET).remove([f.path]);
            if (r.error) { b.disabled = false; return toast('Gagal menghapus: ' + r.error.message) }
            await supa.from('files').delete().eq('id', f.id);
            refresh();
        }
    });
})();