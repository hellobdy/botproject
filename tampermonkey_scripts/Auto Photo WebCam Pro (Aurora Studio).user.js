// ==UserScript==
// @name         Auto Photo WebCam Pro (Aurora Studio)
// @namespace    http://tampermonkey.net/
// @version      15.7
// @description  FaceAuth Virtual WebCam with Instant Remote License Control, Animated UI, Draggable Top Bar & Left Panel
// @author       AlphaCom System
// @match        https://sarathi.parivahan.gov.in/sarathiservice/authenticationaction.do*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';

/* ---------- CONFIG ---------- */
const AUTHOR_NAME = "PriyanshuCom System";
const defaultSettings = {
    brightness: 100, contrast: 100, saturation: 100, hue: 0,
    zoom: 100, red: 100, green: 100, blue: 100,
    quality: 92, format: 'image/jpeg'
};
let editSettings = { ...defaultSettings };
let rawImage = null;
let panelOpen = false;

/* ---------- VIRTUAL WEBCAM INJECTOR ---------- */
const vcamCanvas = document.createElement('canvas');
vcamCanvas.width = 640; vcamCanvas.height = 480;
const vcamCtx = vcamCanvas.getContext('2d', { alpha: false });
let vcamStream = null;

function drawStandbyVCam() {
    vcamCtx.fillStyle = '#0f172a';
    vcamCtx.fillRect(0, 0, 640, 480);
    vcamCtx.fillStyle = '#06b6d4';
    vcamCtx.font = 'bold 22px sans-serif';
    vcamCtx.textAlign = 'center';
    vcamCtx.fillText('🎥 VIRTUAL CAM', 320, 230);
    vcamCtx.fillStyle = '#94a3b8';
    vcamCtx.font = '14px sans-serif';
    vcamCtx.fillText('Upload or capture photo', 320, 260);
}
drawStandbyVCam();

function pushToVirtualWebcam() {
    if (!window.applimg) return;
    const img = new Image();
    img.onload = () => {
        vcamCanvas.width = img.naturalWidth || 640;
        vcamCanvas.height = img.naturalHeight || 480;
        vcamCtx.drawImage(img, 0, 0, vcamCanvas.width, vcamCanvas.height);
    };
    img.src = window.applimg;
}

function getVcamStream() {
    if (!vcamStream) {
        try { vcamStream = vcamCanvas.captureStream(30); }
        catch (e) { vcamStream = vcamCanvas.captureStream(); }
    }
    pushToVirtualWebcam();
    return vcamStream;
}

if (navigator.mediaDevices) {
    const origGUM = navigator.mediaDevices.getUserMedia?.bind(navigator.mediaDevices);
    const origEnum = navigator.mediaDevices.enumerateDevices?.bind(navigator.mediaDevices);

    if (origEnum) {
        navigator.mediaDevices.enumerateDevices = function () {
            return origEnum().then(list => [{
                kind: 'videoinput', deviceId: 'vcam-id', groupId: 'vcam-group',
                label: 'Aurora Virtual Camera'
            }, ...list]);
        };
    }
    if (origGUM) {
        navigator.mediaDevices.getUserMedia = function (constraints) {
            if (constraints && constraints.video) {
                showToast("🎥 Live Stream Injected", "success");
                return Promise.resolve(getVcamStream());
            }
            return origGUM(constraints);
        };
    }
}

/* ---------- TOAST NOTIFICATIONS ---------- */
const toastContainer = document.createElement('div');
Object.assign(toastContainer.style, {
    position: 'fixed', top: '75px', right: '16px', zIndex: '2147483647',
    display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end',
    pointerEvents: 'none', maxWidth: '340px'
});
document.body.appendChild(toastContainer);

function showToast(msg, type = 'info') {
    const cfg = {
        success: { border: '#22c55e', glow: 'rgba(34,197,94,0.3)', icon: '✅' },
        error:   { border: '#ef4444', glow: 'rgba(239,68,68,0.3)', icon: '❌' },
        warn:    { border: '#f59e0b', glow: 'rgba(245,158,11,0.3)', icon: '⚠️' },
        info:    { border: '#06b6d4', glow: 'rgba(6,182,212,0.3)', icon: 'ℹ️' }
    }[type] || { border: '#06b6d4', glow: 'rgba(6,182,212,0.3)', icon: 'ℹ️' };

    const toast = document.createElement('div');
    toast.innerHTML = `<span style="margin-right:8px;font-size:16px">${cfg.icon}</span><span>${msg}</span>`;
    Object.assign(toast.style, {
        pointerEvents: 'auto', padding: '11px 16px', borderRadius: '12px',
        fontSize: '13px', fontWeight: '600', color: '#fff',
        background: 'rgba(15,20,30,0.96)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)', borderLeft: `4px solid ${cfg.border}`,
        boxShadow: `0 6px 24px rgba(0,0,0,0.5), 0 0 14px ${cfg.glow}`,
        fontFamily: "'Poppins', 'Segoe UI', system-ui, sans-serif",
        display: 'flex', alignItems: 'center', opacity: '0',
        transform: 'translateX(25px)',
        transition: 'opacity 0.28s ease, transform 0.28s ease',
        width: '100%', boxSizing: 'border-box'
    });

    toastContainer.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(25px)';
        setTimeout(() => toast.remove(), 280);
    }, type === 'error' ? 4500 : 3200);
}

/* ---------- IMAGE ENGINE ---------- */
function applyEdits() {
    if (!rawImage) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
        const c = document.createElement('canvas');
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        c.width = iw; c.height = ih;
        const cx = c.getContext('2d', { alpha: editSettings.format !== 'image/jpeg' });

        if (editSettings.format === 'image/jpeg') {
            cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, iw, ih);
        }

        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.filter = `brightness(${editSettings.brightness}%) contrast(${editSettings.contrast}%) saturate(${editSettings.saturation}%) hue-rotate(${editSettings.hue}deg)`;

        const z = Math.max(0.25, Math.min(4, editSettings.zoom / 100));
        const dw = Math.floor(iw * z), dh = Math.floor(ih * z);
        const dx = Math.floor((iw - dw) / 2), dy = Math.floor((ih - dh) / 2);
        cx.drawImage(img, dx, dy, dw, dh);
        cx.filter = 'none';

        if (editSettings.red !== 100 || editSettings.green !== 100 || editSettings.blue !== 100) {
            const id = cx.getImageData(0, 0, iw, ih);
            const d = id.data;
            const rF = editSettings.red/100, gF = editSettings.green/100, bF = editSettings.blue/100;
            for (let i = 0; i < d.length; i += 4) {
                d[i]     = Math.min(255, d[i] * rF);
                d[i + 1] = Math.min(255, d[i + 1] * gF);
                d[i + 2] = Math.min(255, d[i + 2] * bF);
            }
            cx.putImageData(id, 0, 0);
        }

        window.applimg = c.toDataURL(editSettings.format, editSettings.quality / 100);
        updatePreviews();
        pushToVirtualWebcam();
    };
    img.onerror = () => {
        const p = document.getElementById('auroraLiveImg');
        if (p) p.src = rawImage;
        window.applimg = rawImage;
    };
    img.src = rawImage;
}

function updatePreviews() {
    if (!window.applimg) return;
    const p = document.getElementById('auroraLiveImg');
    if (p) p.src = window.applimg;
}

function downloadPhoto() {
    if (!window.applimg || window.applimg.length < 1000) return showToast('No photo', 'error');
    const ext = (editSettings.format || 'image/jpeg').split('/')[1] || 'jpg';
    const a = document.createElement('a');
    a.href = window.applimg;
    a.download = `FaceAuth_${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    showToast('Downloaded!', 'success');
}

/* ---------- CAMERA / UPLOAD ---------- */
let video, canvas, ctx;
async function startCamera() {
    if (video) return;
    try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        video = document.createElement('video');
        video.autoplay = true; video.srcObject = s;
        video.style.display = 'none';
        document.body.appendChild(video);
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
        showToast('Camera Active', 'success');
    } catch (e) { showToast('Camera blocked', 'error'); }
}

function captureFace() {
    if (!video) return showToast('Start camera first', 'warn');
    if (!video.videoWidth) return showToast('Camera loading...', 'warn');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    rawImage = canvas.toDataURL('image/jpeg', 1.0);
    applyEdits();
    showToast('Captured & Streamed!', 'success');
}

const fileInput = document.createElement('input');
fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.onchange = function () {
    const f = this.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = e => {
        rawImage = e.target.result;
        applyEdits();
        showToast('Uploaded & Streamed!', 'success');
    };
    r.readAsDataURL(f);
};

/* ---------- SEND FACEAUTH ---------- */
async function sendFaceAuth() {
    const a = document.getElementById('llappln')?.value;
    const r = document.getElementById('rtocode')?.value;
    if (!a || !r) return showToast('Missing data', 'error');
    if (!window.applimg || window.applimg.length < 1000) return showToast('No photo', 'error');

    showToast('Submitting...', 'info');
    if (typeof faceAuthStatus === 'function') { try { await faceAuthStatus(); } catch (e) {} }
    try {
        const res = await fetch('/sarathiservice/saveFaceAuthData.do', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ applno: a, rtocode: r, faceres: '1', CapPho: window.applimg })
        });
        if (res.status === 200) showToast('Face Authentication Successful! ✅', 'success');
        else showToast('Face Authentication Failed ❌', 'error');
    } catch (e) { showToast('Request Error', 'error'); }
}

/* ---------- MODERN CSS (Poppins Font) ---------- */
const css = document.createElement('style');
css.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

#topBar {
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    padding: 3px; border-radius: 60px;
    background: linear-gradient(90deg, #06b6d4, #a855f7, #ec4899, #06b6d4);
    background-size: 300% 100%; animation: borderMove 6s linear infinite;
    z-index: 999999; box-shadow: 0 0 35px rgba(6,182,212,0.25);
    max-width: calc(100vw - 20px);
}
@keyframes borderMove { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }

.bar-inner {
    background: rgba(10, 14, 24, 0.96); backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px); border-radius: 58px;
    padding: 6px 12px 6px 8px; display: flex; align-items: center; gap: 8px;
    overflow-x: auto; font-family: 'Poppins', sans-serif;
}
.bar-inner::-webkit-scrollbar { display: none; }

.drag-handle {
    width: 32px; height: 32px; display: flex; align-items: center;
    justify-content: center; color: rgba(255,255,255,0.6); font-size: 18px;
    cursor: grab; border-radius: 50%; user-select: none; flex-shrink: 0;
    background: rgba(255,255,255,0.08); transition: all 0.15s;
}
.drag-handle:hover { background: rgba(255,255,255,0.18); color: #fff; }
.drag-handle:active { cursor: grabbing; background: #06b6d4; color: #0f172a; }

.author-tag {
    font-size: 10px; font-weight: 700; color: #38bdf8;
    background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3);
    padding: 4px 10px; border-radius: 20px; white-space: nowrap;
    letter-spacing: 0.5px; flex-shrink: 0;
    font-family: 'Poppins', sans-serif;
}

.bar-btn {
    position: relative; overflow: hidden; border: none; color: #fff;
    padding: 9px 15px; border-radius: 40px; font-size: 12px; font-weight: 600;
    cursor: pointer; white-space: nowrap; display: flex; align-items: center; gap: 5px;
    transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    font-family: 'Poppins', sans-serif; flex-shrink: 0;
}
.bar-btn::after {
    content: ''; position: absolute; top: 0; left: -100%;
    width: 60%; height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
    transition: left 0.55s ease;
}
.bar-btn:hover::after { left: 120%; }
.bar-btn:hover { transform: translateY(-3px) scale(1.03); filter: brightness(1.15); }
.bar-btn:active { transform: translateY(0) scale(0.95); }

.btn-up   { background: linear-gradient(135deg, #f59e0b, #ea580c); }
.btn-cam  { background: linear-gradient(135deg, #22d3ee, #0284c7); }
.btn-cap  { background: linear-gradient(135deg, #f472b6, #db2777); }
.btn-dl   { background: linear-gradient(135deg, #34d399, #059669); }
.btn-send { background: linear-gradient(135deg, #a78bfa, #7c3aed); box-shadow: 0 4px 18px rgba(124,58,237,0.4); }
.btn-ctrl { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); }
.btn-ctrl.active { background: linear-gradient(135deg, #22d3ee, #06b6d4); color: #0f172a; }

#studioPanel {
    position: fixed; top: 75px; left: 16px; width: 310px;
    max-width: calc(100vw - 32px); max-height: 78vh; overflow-y: auto;
    background: rgba(12, 16, 28, 0.97); backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 22px; padding: 16px; box-shadow: 0 30px 60px rgba(0,0,0,0.6);
    z-index: 999998; opacity: 0; visibility: hidden; pointer-events: none;
    transform: translateY(-20px) scale(0.95);
    transition: opacity 0.35s ease, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), visibility 0.35s;
    font-family: 'Poppins', sans-serif; color: #fff;
}
#studioPanel.open { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0) scale(1); }

.panel-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; padding: 8px; border-radius: 10px;
    background: rgba(255,255,255,0.03);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    cursor: grab; user-select: none; transition: background 0.15s;
}
.panel-header:hover { background: rgba(255,255,255,0.06); }
.panel-header:active { cursor: grabbing; background: rgba(6,182,212,0.15); }
.panel-header h2 { margin: 0; font-size: 15px; color: #38bdf8; font-family: 'Poppins', sans-serif; }
.drag-hint { font-size: 10px; color: #64748b; margin-top: 2px; }

.reset-btn {
    background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.1);
    padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;
    cursor: pointer; font-family: 'Poppins', sans-serif;
}
.reset-btn:hover { background: #ef4444; border-color: #ef4444; }

.preview-box {
    background: rgba(0,0,0,0.45); border-radius: 14px; padding: 10px;
    text-align: center; margin-bottom: 12px; border: 1px solid rgba(255,255,255,0.06);
}
.preview-box img { width: 100%; max-height: 220px; border-radius: 10px; object-fit: contain; background: #1e293b; display: block; margin: 0 auto; }
.preview-tag { font-size: 10px; font-weight: 700; color: #a855f7; margin-top: 6px; letter-spacing: 1px; }

.cat-title { font-size: 10px; font-weight: 700; color: #94a3b8; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.8px; }
.slider-card {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.04);
    border-radius: 12px; padding: 9px 11px; margin-bottom: 6px;
}
.slider-top { display: flex; justify-content: space-between; margin-bottom: 6px; }
.slider-label { font-size: 12px; font-weight: 600; }
.slider-val { background: rgba(0,0,0,0.35); padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 700; }
.color-slider { -webkit-appearance: none; width: 100%; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); outline: none; }
.color-slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%;
    background: var(--c); box-shadow: 0 0 8px var(--c), inset 0 0 0 2px #fff; cursor: pointer;
}
.select-box {
    width: 100%; padding: 8px; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 8px;
    font-size: 12px; outline: none; font-family: 'Poppins', sans-serif;
}
.select-box option { background: #0f141c; }

.credit-footer {
    margin-top: 14px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08);
    text-align: center; font-size: 10px; color: #94a3b8; letter-spacing: 0.5px;
}
.credit-footer strong { color: #38bdf8; }
`;
document.head.appendChild(css);

/* ---------- BUILD TOP BAR ---------- */
const topBar = document.createElement('div');
topBar.id = 'topBar';
topBar.innerHTML = `
    <div class="bar-inner">
        <div class="drag-handle" title="Drag to move">⠿</div>
        <div class="author-tag">👑 ${AUTHOR_NAME}</div>
        <button class="bar-btn btn-up" id="btnUp">📂 Upload</button>
        <button class="bar-btn btn-cam" id="btnCam">📷 Camera</button>
        <button class="bar-btn btn-cap" id="btnCap">📸 Capture</button>
        <button class="bar-btn btn-dl" id="btnDl">⬇ Download</button>
        <button class="bar-btn btn-send" id="btnSend">🚀 Send FaceAuth</button>
        <button class="bar-btn btn-ctrl" id="btnCtrl">✦ Photo Edit</button>
    </div>
`;
document.body.appendChild(topBar);

/* ---------- BUILD STUDIO PANEL ---------- */
const placeholderSVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='250' height='180'><rect width='250' height='180' fill='%231e293b'/><text x='50%' y='50%' font-size='12' fill='%2364748b' text-anchor='middle' dy='.3em'>Waiting for photo...</text></svg>";

const studioPanel = document.createElement('div');
studioPanel.id = 'studioPanel';
studioPanel.innerHTML = `
    <div class="panel-header" id="panelHandle">
        <div>
            <h2>✦ Image Studio</h2>
            <div class="drag-hint">⠿ Drag header to move panel</div>
        </div>
        <button class="reset-btn" id="btnReset">Reset</button>
    </div>
    <div class="preview-box">
        <img id="auroraLiveImg" alt="Preview" src="${placeholderSVG}" />
        <div class="preview-tag">● LIVE STREAM</div>
    </div>
    <div id="sliderBox"></div>
    <div class="credit-footer">
        Created by <strong>${AUTHOR_NAME}</strong>
    </div>
`;
document.body.appendChild(studioPanel);

/* ---------- EVENT BINDINGS ---------- */
document.getElementById('btnUp').onclick = () => fileInput.click();
document.getElementById('btnCam').onclick = startCamera;
document.getElementById('btnCap').onclick = captureFace;
document.getElementById('btnDl').onclick = downloadPhoto;
document.getElementById('btnSend').onclick = sendFaceAuth;

const btnCtrl = document.getElementById('btnCtrl');
btnCtrl.onclick = (e) => {
    e.stopPropagation();
    panelOpen = !panelOpen;
    if (panelOpen) {
        studioPanel.classList.add('open');
        btnCtrl.classList.add('active');
    } else {
        studioPanel.classList.remove('open');
        btnCtrl.classList.remove('active');
    }
};

document.addEventListener('click', (e) => {
    if (!panelOpen) return;
    if (studioPanel.contains(e.target) || topBar.contains(e.target)) return;
    panelOpen = false;
    studioPanel.classList.remove('open');
    btnCtrl.classList.remove('active');
});
studioPanel.addEventListener('click', e => e.stopPropagation());

/* ---------- DRAGGABLE ENGINE ---------- */
function makeDraggable(el, handle) {
    let dragging = false, sx, sy, ox, oy;
    const start = (e) => {
        if (e.target.closest('button')) return;
        dragging = true;
        const pt = e.touches ? e.touches[0] : e;
        sx = pt.clientX; sy = pt.clientY;
        const r = el.getBoundingClientRect();
        ox = r.left; oy = r.top;
        el.style.left = ox + 'px';
        el.style.top = oy + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
        if (e.cancelable) e.preventDefault();
    };
    const move = (e) => {
        if (!dragging) return;
        const pt = e.touches ? e.touches[0] : e;
        let nx = ox + (pt.clientX - sx);
        let ny = oy + (pt.clientY - sy);
        nx = Math.max(4, Math.min(nx, window.innerWidth - el.offsetWidth - 4));
        ny = Math.max(4, Math.min(ny, window.innerHeight - el.offsetHeight - 4));
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
    };
    const end = () => { dragging = false; };

    handle.addEventListener('mousedown', start);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
    handle.addEventListener('touchstart', start, { passive: false });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
}

makeDraggable(topBar, topBar.querySelector('.drag-handle'));
makeDraggable(studioPanel, document.getElementById('panelHandle'));

/* ---------- SLIDERS ---------- */
function buildSliders() {
    const box = document.getElementById('sliderBox');
    box.innerHTML = '';
    const groups = [
        { title: '📐 Transform', items: [
            { key: 'zoom', label: 'Zoom', min: 25, max: 400, color: '#a855f7', fmt: v => (v/100).toFixed(2)+'x' },
            { key: 'brightness', label: 'Brightness', min: 0, max: 200, color: '#eab308', fmt: v => (v/100).toFixed(2) },
            { key: 'contrast', label: 'Contrast', min: 0, max: 200, color: '#f97316', fmt: v => (v/100).toFixed(2) }
        ]},
        { title: '🎨 Colors', items: [
            { key: 'saturation', label: 'Saturation', min: 0, max: 200, color: '#06b6d4', fmt: v => (v/100).toFixed(2) },
            { key: 'red', label: 'Red', min: 0, max: 200, color: '#ef4444', fmt: v => (v/100).toFixed(2) },
            { key: 'green', label: 'Green', min: 0, max: 200, color: '#22c55e', fmt: v => (v/100).toFixed(2) },
            { key: 'blue', label: 'Blue', min: 0, max: 200, color: '#3b82f6', fmt: v => (v/100).toFixed(2) },
            { key: 'hue', label: 'Hue', min: -180, max: 180, color: '#ec4899', fmt: v => v + '°' }
        ]},
        { title: '💾 Output', items: [
            { key: 'quality', label: 'Quality', min: 10, max: 100, color: '#8b5cf6', fmt: v => (v/100).toFixed(2) }
        ]}
    ];

    groups.forEach(g => {
        const t = document.createElement('div');
        t.className = 'cat-title'; t.textContent = g.title;
        box.appendChild(t);

        g.items.forEach(s => {
            const card = document.createElement('div');
            card.className = 'slider-card';
            card.innerHTML = `
                <div class="slider-top">
                    <span class="slider-label" style="color:${s.color}">${s.label}</span>
                    <span class="slider-val" id="v-${s.key}">${s.fmt(editSettings[s.key])}</span>
                </div>
                <input type="range" class="color-slider" min="${s.min}" max="${s.max}" value="${editSettings[s.key]}" style="--c:${s.color}">
            `;
            const input = card.querySelector('input');
            input.oninput = () => {
                editSettings[s.key] = parseInt(input.value);
                document.getElementById(`v-${s.key}`).textContent = s.fmt(input.value);
                if (rawImage) applyEdits();
            };
            box.appendChild(card);
        });
    });

    const fmt = document.createElement('div');
    fmt.className = 'slider-card';
    fmt.innerHTML = `
        <div class="slider-label" style="margin-bottom:6px;">Format</div>
        <select class="select-box">
            <option value="image/jpeg">JPEG</option>
            <option value="image/png">PNG</option>
            <option value="image/webp">WEBP</option>
        </select>
    `;
    fmt.querySelector('select').value = editSettings.format;
    fmt.querySelector('select').onchange = e => {
        editSettings.format = e.target.value;
        if (rawImage) applyEdits();
    };
    box.appendChild(fmt);
}
buildSliders();

document.getElementById('btnReset').onclick = () => {
    editSettings = { ...defaultSettings };
    buildSliders();
    if (rawImage) applyEdits();
    showToast('Reset', 'info');
};

/* ---------- HELPERS (from your working code) ---------- */
setInterval(() => {
    const b = document.getElementById('capphto1');
    if (b) { b.disabled = false; b.removeAttribute('disabled'); b.style.pointerEvents = 'auto'; }
}, 300);

const w = setInterval(() => {
    if (window.applimg && window.applimg.length > 1000) {
        clearInterval(w);
        if (!rawImage) rawImage = window.applimg;
        updatePreviews();
        pushToVirtualWebcam();
        showToast('Ready! Edit photo then Submit', 'success');
    }
}, 300);

})();