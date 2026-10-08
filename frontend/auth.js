/* Logika halaman login.html dan register.html */
(async () => {
    const $ = s => document.querySelector(s), root = document.documentElement;

    // Tujuan setelah login (hanya dari daftar putih, agar tidak jadi open redirect)
    const ALLOWED = ['index.html', '../tabel-excel/index.html'];
    const nx = new URLSearchParams(location.search).get('next');
    const NEXT = ALLOWED.includes(nx) ? nx : 'index.html';
    // Pertahankan tujuan saat pindah antara halaman Masuk <-> Daftar
    document.querySelectorAll('.alink a').forEach(a => a.href = a.getAttribute('href') + '?next=' + encodeURIComponent(NEXT));

    $('#theme').onclick = () => {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.theme = root.dataset.theme } catch (e) { }
    };

    // Sudah login? langsung ke halaman utama
    const { data: { session } } = await supa.auth.getSession();
    if (session) { location.replace(NEXT); return }

    const form = $('#af'), msg = $('#msg'), btn = $('#sub'), isReg = !!$('#pw2');
    const show = (t, ok) => { msg.textContent = t; msg.className = 'amsg ' + (ok ? 'ok' : 'err'); msg.hidden = !t };
    const tr = m => {
        if (/invalid login/i.test(m)) return 'Email atau kata sandi salah.';
        if (/already registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk.';
        if (/not confirmed/i.test(m)) return 'Email belum dikonfirmasi. Cek kotak masuk Anda.';
        if (/at least/i.test(m)) return 'Kata sandi minimal 6 karakter.';
        if (/rate limit/i.test(m)) return 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.';
        if (/fetch|network/i.test(m)) return 'Tidak dapat terhubung ke server. Periksa koneksi internet.';
        return m;
    };

    // Validasi email langsung saat mengetik
    const emailEl = $('#email'), hint = $('#eh');
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    const checkEmail = (force) => {
        const v = emailEl.value.trim();
        let m = '';
        if (!v) m = force ? 'Email wajib diisi.' : '';
        else if (!EMAIL_RE.test(v)) m = 'Format email tidak valid. Isian ini hanya menerima alamat email, contoh: nama@email.com';
        emailEl.setAttribute('aria-invalid', m ? 'true' : 'false');
        hint.textContent = m; hint.hidden = !m;
        return !m;
    };
    emailEl.addEventListener('input', () => checkEmail(false));
    emailEl.addEventListener('blur', () => checkEmail(false));

    form.onsubmit = async e => {
        e.preventDefault(); show('');
        if (!checkEmail(true)) { emailEl.focus(); return }
        const email = emailEl.value.trim(), pw = $('#pw').value;
        if (isReg) {
            if (pw.length < 6) return show('Kata sandi minimal 6 karakter.');
            if (pw !== $('#pw2').value) return show('Konfirmasi kata sandi tidak sama.');
        }
        const old = btn.textContent; btn.disabled = true; btn.textContent = 'Memproses...';
        try {
            if (isReg) {
                const { data, error } = await supa.auth.signUp({ email, password: pw });
                if (error) throw error;
                if (data.session) { location.replace(NEXT); return }
                // Email sudah ada: Supabase mengembalikan user tanpa identities
                if (data.user && data.user.identities && !data.user.identities.length) show('Email ini sudah terdaftar. Silakan masuk.');
                else { show('Pendaftaran berhasil. Cek email Anda untuk konfirmasi, lalu masuk.', true); form.reset() }
            } else {
                const { error } = await supa.auth.signInWithPassword({ email, password: pw });
                if (error) throw error;
                location.replace(NEXT); return
            }
        } catch (err) { show(tr(err.message || String(err))) }
        btn.disabled = false; btn.textContent = old;
    };
})();