// account.js - mode akses untuk web Tabel: Trial (tanpa simpan) atau Akun (simpan ke Supabase).
// Dimuat SETELAH main.js. Memakai klien Supabase, bucket, dan tabel `files` yang sama dengan dashboard.
(async () => {
  const BUCKET = 'shapefiles', MAX = 50 * 1024 * 1024;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TRIAL = new URLSearchParams(location.search).get('mode') === 'trial';
  const HOME = '../index.html', LOGIN = '../frontend/login.html?next=' + encodeURIComponent('../tabel-excel/index.html');

  const css = document.createElement('style');
  css.textContent = `
  html.guard body{visibility:hidden}
  header button.hb{margin-left:0;height:36px;padding:0 14px;border-radius:8px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);color:#fff;font-size:13px}
  header button.hb:hover{background:rgba(255,255,255,.24)}
  #theme{margin-left:0!important}
  .hsp{flex:1}
  .usr{font-size:12px;color:#fff;opacity:.85;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .trial{background:#f59e0b;color:#3b2300;font-weight:700;font-size:12px;padding:4px 10px;border-radius:999px;white-space:nowrap}
  .modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;z-index:50;padding:16px}
  .modal[hidden]{display:none}
  .mbox{background:var(--card);color:var(--tx);border:1px solid var(--bd);border-radius:14px;width:min(560px,100%);max-height:80vh;display:flex;flex-direction:column}
  .mh{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--bd)}
  .fl{overflow:auto;padding:8px}
  .fr{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px}
  .fr:hover{background:var(--card2)}
  .fi{flex:1;min-width:0}.fn{font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .fm2{font-size:12px;color:var(--mut)}
  button.sm{padding:6px 12px;font-size:12px}
  button.del{background:var(--bad);color:#fff}
  .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--tx);color:var(--bg);padding:10px 16px;border-radius:10px;font-size:13px;z-index:60}
  .mu{color:var(--mut);font-size:13px;padding:8px}`;
  document.head.append(css);

  const theme = $('#theme');
  const toast = t => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.append(d); setTimeout(() => d.remove(), 3500) };

  // ---------- Mode Trial ----------
  if (TRIAL) {
    theme.insertAdjacentHTML('beforebegin', '<span class="hsp"></span><span class="trial" title="Data yang diunggah tidak disimpan ke database">Mode Trial · data tidak disimpan</span><button class="hb" id="tlogin">Masuk / Daftar</button><button class="hb" id="thome">Beranda</button>');
    $('#tlogin').onclick = () => location.href = LOGIN;
    $('#thome').onclick = () => location.href = HOME;
    document.documentElement.classList.remove('guard');
    return; // tidak ada penyimpanan
  }

  // ---------- Mode Akun ----------
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { location.replace(HOME); return }
  const user = session.user;
  document.documentElement.classList.remove('guard');
  supa.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace(HOME) });

  theme.insertAdjacentHTML('beforebegin', `<span class="hsp"></span><span class="usr" title="${esc(user.email)}">${esc(user.email)}</span><button class="hb" id="myfiles">File Saya</button><button class="hb" id="logout">Keluar</button>`);
  document.body.insertAdjacentHTML('beforeend', '<div class="modal" id="fmod" hidden><div class="mbox" role="dialog" aria-label="File Saya"><div class="mh"><b>File Saya</b><button class="sm" id="fclose">Tutup</button></div><div class="fl" id="flist"></div></div></div>');
  const modal = $('#fmod'), list = $('#flist');
  const size = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const date = s => new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  $('#logout').onclick = async () => { await supa.auth.signOut(); location.replace(HOME) };
  $('#fclose').onclick = () => modal.hidden = true;
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true });

  // Simpan otomatis setelah file berhasil dibaca (bungkus load() dari main.js)
  const orig = load;
  load = async (file, skipSave) => {
    const before = ROWS;
    await orig(file);
    if (skipSave || !file || ROWS === before || !ROWS.length) return; // gagal dibaca / dibuka dari File Saya
    await save(file);
  };

  async function save(file) {
    if (file.size > MAX) return toast('File lebih dari 50 MB, tidak disimpan ke akun.');
    const path = `${user.id}/${Date.now()}_${file.name.replace(/[^\w.-]/g, '_')}`;
    const blob = new Blob([file], { type: 'application/zip' });
    const up = await supa.storage.from(BUCKET).upload(path, blob, { contentType: 'application/zip' });
    if (up.error) return toast('Gagal menyimpan file: ' + up.error.message);
    const ins = await supa.from('files').insert({ name: file.name, size: file.size, path });
    if (ins.error) { await supa.storage.from(BUCKET).remove([path]); return toast('Gagal mencatat file: ' + ins.error.message) }
    toast('File tersimpan di akun Anda.');
  }

  async function refresh() {
    list.innerHTML = '<p class="mu">Memuat...</p>';
    const { data, error } = await supa.from('files').select('*').order('created_at', { ascending: false });
    if (error) { list.innerHTML = `<p class="mu">Gagal memuat daftar: ${esc(error.message)}</p>`; return }
    if (!data.length) { list.innerHTML = '<p class="mu">Belum ada file tersimpan. Unggah ZIP shapefile, maka file akan tersimpan otomatis.</p>'; return }
    list.innerHTML = data.map(f => `<div class="fr"><div class="fi"><div class="fn" title="${esc(f.name)}">${esc(f.name)}</div><div class="fm2">${size(f.size)} · ${date(f.created_at)}</div></div><button class="sm" data-o="${f.id}">Buka</button><button class="sm del" data-d="${f.id}">Hapus</button></div>`).join('');
    list._data = data;
  }
  $('#myfiles').onclick = () => { modal.hidden = false; refresh() };

  list.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || !list._data) return;
    const f = list._data.find(x => x.id === (b.dataset.o || b.dataset.d)); if (!f) return;
    if (b.dataset.o) {
      modal.hidden = true; $('#status').textContent = 'Mengunduh ' + f.name + '…';
      const { data, error } = await supa.storage.from(BUCKET).download(f.path);
      if (error) { $('#status').textContent = 'Gagal mengunduh file.'; return toast('Gagal mengunduh: ' + error.message) }
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
