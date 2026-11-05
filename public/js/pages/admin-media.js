// Admin > Photos and videos: upload to the library, then choose where each file appears on the public site.
import { html, raw, esc, $, $$, api, toast, modal, confirmBox, formData, setTitle } from '../lib.js';
import { head } from './portal.js';

export default async function media(pc) {
  setTitle('Photos and videos'); let tab = 'slots';
  const sz = (b) => b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  const thumb = (m, ctl = false) => m.kind === 'video'
    ? `<video src="${esc(m.url || m.path)}" ${ctl ? 'controls' : ''} muted playsinline preload="metadata"></video>`
    : `<img src="${esc(m.url || m.path)}" alt="${esc(m.alt || '')}" loading="lazy">`;

  async function draw() {
    const { media: lib, slots } = await api('/admin/media');
    pc.innerHTML = html`${head('Photos and videos', 'Upload once, then choose where each one appears on the public site. Customers see changes within a minute.')}
    <div class="tabs"><button data-tab="slots" class="${tab === 'slots' ? 'on' : ''}">Where they appear</button><button data-tab="lib" class="${tab === 'lib' ? 'on' : ''}">Library (${lib.length})</button></div>
    ${tab === 'slots' ? html`<div class="panel"><h3>Placements</h3><p class="muted" style="margin-bottom:8px">Pick a photo or video for each spot. "Built-in" uses the standard picture that ships with the site.</p>
      ${slots.map((sl) => html`<div class="slotrow"><div class="sp">${sl.current ? raw(thumb(sl.current)) : html`<div class="empty" style="padding:30px 0;font-size:12px">None</div>`}</div>
        <div><b>${sl.label}</b><div class="muted" style="font-size:13px">${sl.kind === 'video' ? 'Video' : 'Photo'} · ${sl.is_default ? 'Built-in' : 'Your pick'}</div></div>
        <select class="inp" data-slot="${sl.slot}" aria-label="Choose for ${sl.label}"><option value="0">${sl.kind === 'video' && !sl.current ? 'Nothing (default)' : 'Built-in default'}</option>${lib.filter((m) => m.kind === sl.kind).map((m) => html`<option value="${m.id}" ${sl.current && sl.current.id === m.id ? 'selected' : ''}>${m.title || m.path}${m.builtin ? ' (built-in)' : ''}</option>`)}</select></div>`)}</div>`
    : html`<div class="panel"><h3>Upload</h3><label class="drop" id="dz">Drop a photo or video here, or click to choose<br><span style="font-size:13px">Photos: JPG, PNG or WebP up to 8 MB (resized for the web automatically). Videos: MP4 or WebM up to 90 MB. Keep videos short and compressed.</span><input type="file" id="fi" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" hidden></label>
        <div class="row" style="margin-top:16px"><div class="field" style="margin:0"><label>Name <span class="muted">(for you)</span></label><input id="mt" maxlength="120" placeholder="e.g. Warehouse at sunrise"></div><div class="field" style="margin:0"><label>Describe it <span class="muted">(read aloud by screen readers)</span></label><input id="ma" maxlength="200" placeholder="e.g. A forklift in a bright warehouse aisle"></div></div></div>
      <div class="panel"><h3>Library</h3><div class="mgrid">${lib.map((m) => html`<div class="mcard"><div class="thumb">${raw(thumb(m, m.kind === 'video'))}<span class="badge kind ${m.kind === 'video' ? 'acc' : ''}">${m.kind}</span></div>
        <div class="meta"><b style="font-size:14px">${m.title || m.path}</b><span class="muted">${m.builtin ? 'Built-in' : sz(m.size_bytes)}</span><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-g btn-sm" data-copy="${m.path}">Copy link</button>${m.builtin ? '' : html`<button class="btn btn-g btn-sm" data-rn="${m.id}">Rename</button><button class="btn btn-g btn-sm" data-del="${m.id}" style="color:var(--bad)">Delete</button>`}</div></div></div>`)}</div></div>`}`.s;

    $$('.tabs button', pc).forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
    $$('[data-slot]', pc).forEach((sel) => { sel.onchange = async () => { try { await api('/admin/media-slots', { method: 'PUT', body: { slot: sel.dataset.slot, media_id: +sel.value } }); toast('Saved. It is live on the site now.', 'ok'); draw(); } catch (e) { toast(e.message, 'bad'); } }; });
    const up = async (file) => {
      if (!file) return; const fd = new FormData(); fd.append('file', file); fd.append('title', $('#mt', pc)?.value || ''); fd.append('alt', $('#ma', pc)?.value || '');
      try { toast(`Uploading ${file.name}…`); await api('/admin/media', { method: 'POST', form: fd }); toast('Uploaded. Now choose where it appears.', 'ok'); tab = 'lib'; draw(); } catch (e) { toast(e.message, 'bad'); }
    };
    $('#fi', pc)?.addEventListener('change', (e) => up(e.target.files[0])); const dz = $('#dz', pc);
    if (dz) {
      ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('drag')));
      dz.addEventListener('drop', (e) => { e.preventDefault(); up(e.dataTransfer.files[0]); });
    }
    pc.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
      if (d.copy) { try { await navigator.clipboard.writeText(location.origin + d.copy); toast('Link copied'); } catch (_) { toast(location.origin + d.copy); } }
      if (d.rn) {
        const m = lib.find((x) => x.id == d.rn);
        const mo = modal(`<h2>Rename</h2><form id="rf"><div class="field"><label>Name</label><input name="title" value="${esc(m.title)}" maxlength="120"></div><div class="field"><label>Description</label><input name="alt" value="${esc(m.alt)}" maxlength="200"></div><button class="btn btn-p btn-block" type="submit">Save</button></form>`);
        $('#rf', mo.el).onsubmit = async (ev) => { ev.preventDefault(); await api('/admin/media/' + d.rn, { method: 'PATCH', body: formData(ev.target) }); mo.close(); draw(); };
      }
      if (d.del && await confirmBox('Delete this file?', 'Any placement using it goes back to the built-in default.', 'Delete')) { try { await api('/admin/media/' + d.del, { method: 'DELETE' }); toast('Deleted'); draw(); } catch (er) { toast(er.message, 'bad'); } }
    };
  }
  draw();
}
