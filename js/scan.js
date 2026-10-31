// Barcode scanner. It lives outside #app so re-rendering the screen doesn't stop the camera.
import { html, icon } from './ui.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function canScan() {
  return 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** Opens the camera; calls onCode(digits) once with the first barcode found or typed. */
export function openScanner(onCode) {
  const box = document.createElement('div');
  box.className = 'scrim scanner';
  box.innerHTML = String(html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="scan-title">
<div class="spread"><h2 id="scan-title">Scan a barcode</h2><button type="button" class="icon-btn bare" data-scan="close" aria-label="Close">${icon('close', 22)}</button></div>
<div class="scan-view"><video playsinline muted></video><span class="scan-frame" aria-hidden="true"></span></div>
<p class="small muted" data-scan="msg">${canScan() ? 'Point the camera at the barcode on the package.' : 'This browser can’t read barcodes with the camera. Type the numbers under the barcode instead.'}</p>
<form class="row" data-scan="form"><label class="field" style="flex:1">Or type the barcode number<input class="input" type="text" inputmode="numeric" autocomplete="off" data-scan="code" placeholder="e.g. 041190468713"></label>
<button type="submit" class="btn primary" style="align-self:flex-end">Look up</button></form></div>`);
  document.body.appendChild(box);
  const video = box.querySelector('video');
  const msg = box.querySelector('[data-scan="msg"]');
  let stream = null, timer = null, done = false;

  const close = () => {
    done = true;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    box.remove();
    document.removeEventListener('keydown', onKey);
  };
  const finish = (code) => {
    if (done) return;
    close();
    onCode(code);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('[data-scan="close"]')) close();
  });
  box.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = box.querySelector('[data-scan="code"]').value.replace(/\D/g, '');
    if (code.length >= 8) finish(code);
    else msg.textContent = 'Type all the numbers under the barcode (usually 12 or 13).';
  });

  if (!canScan()) {
    box.querySelector('.scan-view').remove();
    box.querySelector('[data-scan="code"]').focus();
    return close;
  }
  const detector = new window.BarcodeDetector({ formats: FORMATS });
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    .then((s) => {
      if (done) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      video.srcObject = s;
      return video.play().then(tick);
    })
    .catch(() => {
      msg.textContent = 'The camera isn’t available. Allow camera access for this app in the browser’s site settings, or type the number below.';
      const view = box.querySelector('.scan-view');
      if (view) view.remove();
    });

  function tick() {
    if (done) return;
    detector.detect(video)
      .then((codes) => {
        const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue));
        if (hit) {
          if (navigator.vibrate) navigator.vibrate(60);
          finish(hit.rawValue);
        } else timer = setTimeout(tick, 250);
      })
      .catch(() => { timer = setTimeout(tick, 500); });
  }
  return close;
}
