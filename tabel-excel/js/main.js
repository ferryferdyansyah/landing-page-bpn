// main.js
// Penghubung: menangani upload/drag-drop ZIP, memanggil parser, render, dan tombol download.

async function load(file){
 const st=document.getElementById('status'),dl=document.getElementById('dl');
 st.textContent='Membaca '+file.name+'…';dl.disabled=true;
 try{
  const zip=await JSZip.loadAsync(file);
  const e=Object.values(zip.files).find(f=>!f.dir&&/\.dbf$/i.test(f.name));
  if(!e){ROWS=[];COLS=[];render();st.textContent='File .dbf tidak ditemukan di dalam ZIP.';return}
     const r = parseDBF(await e.async('arraybuffer')), cc = canonCols(r.cols, r.rows); ROWS = r.rows; COLS = cc.cols; render();
     const miss = ['LUASHA', 'WADMKC'].filter(c => !COLS.includes(c));
     st.textContent = `${file.name}: ${ROWS.length.toLocaleString('id')} baris, ${COLS.length} kolom.` + (cc.renamed.length ? ` Nama kolom disesuaikan: ${cc.renamed.join(', ')}.` : '') + (miss.length ? ` Peringatan: kolom ${miss.join(', ')} tidak ditemukan.` : ''); dl.disabled = false;
 }catch(err){ROWS=[];COLS=[];render();st.textContent='Gagal membaca file: '+err.message}
}
const drop=document.getElementById('drop'),fi=document.getElementById('file');
drop.onclick=()=>fi.click();fi.onchange=()=>fi.files[0]&&load(fi.files[0]);
['dragover','dragenter'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
drop.addEventListener('drop',e=>e.dataTransfer.files[0]&&load(e.dataTransfer.files[0]));
document.getElementById('dl').onclick=async()=>{const b=document.getElementById('dl');b.disabled=true;b.textContent='Menyiapkan…';try{await downloadXLSX()}finally{b.disabled=false;b.textContent='⬇ Download Excel (31 sheet)'}};
// Tema terang/gelap. Default selalu dark; toggle hanya berlaku selama halaman terbuka.
const tb=document.getElementById('theme'),root=document.documentElement;
const paintTheme=()=>{tb.textContent=root.dataset.theme==='light'?'☾':'☀'};
tb.onclick=()=>{root.dataset.theme=root.dataset.theme==='light'?'dark':'light';paintTheme()};
paintTheme();
render();
