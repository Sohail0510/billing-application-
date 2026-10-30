// File sharing and saving. Inside the Android app a native bridge (window.HisaabAndroid) writes the
// file and opens the share sheet; in a browser it falls back to Web Share or a download.
export const bridge = () => (typeof window !== 'undefined' ? window.HisaabAndroid : undefined);
export const isAndroidApp = () => Boolean(bridge());
export const IS_PREVIEW = typeof __PREVIEW__ !== 'undefined' && __PREVIEW__;

export function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export const textBytes = (s) => new TextEncoder().encode(s);

// Returns { ok, message }: ok is false when sharing failed or was cancelled; message is for a toast ('' = nothing to say).
export async function shareFile(bytes, fileName, mime, text = '') {
  const b = bridge();
  if (b) {
    try {
      const msg = b.shareFile(bytesToBase64(bytes), fileName, mime, text) || '';
      return { ok: !msg, message: msg };
    } catch (e) {
      return { ok: false, message: 'Could not share the file: ' + (e && e.message ? e.message : 'unknown error') };
    }
  }
  try {
    const file = new File([bytes], fileName, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: fileName, text });
      return { ok: true, message: '' };
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, message: '' };
  }
  const message = saveFile(bytes, fileName, mime);
  return { ok: !IS_PREVIEW, message };
}

export function saveFile(bytes, fileName, mime) {
  const b = bridge();
  if (b) {
    try {
      return b.saveFile(bytesToBase64(bytes), fileName, mime) || 'Saved';
    } catch (e) {
      return 'Could not save the file: ' + (e && e.message ? e.message : 'unknown error');
    }
  }
  if (IS_PREVIEW) return 'Saving files works in the Android app. This preview can’t download files.';
  try {
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return `Downloading ${fileName}`;
  } catch {
    return 'This browser blocked the download.';
  }
}

export function openExternal(url) {
  const b = bridge();
  if (b && b.openExternal) {
    b.openExternal(url);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Lets the Android back button close sheets and walk back through screens.
export function installBackHandler(handler) {
  window.__hisaabBack = () => (handler() ? 'true' : 'false');
}

// Reads a picked image, scales it down and returns a PNG data URL (logos stay small in backups and PDFs).
export function imageFileToPng(file, maxSide = 320) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('That file is not an image this phone can read'));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
