// Invoice fonts (Carlito, a metric-compatible Calibri alternative under the SIL Open Font License),
// subset to Latin + ₹. Shared by the PDF writer and the on-screen preview.
import regularFont from '../assets/fonts/Carlito-Regular.ttf';
import boldFont from '../assets/fonts/Carlito-Bold.ttf';

export { regularFont, boldFont };

let registered = false;
export function registerPreviewFonts() {
  if (registered || typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return;
  registered = true;
  try {
    document.fonts.add(new FontFace('Carlito', regularFont, { weight: '400' }));
    document.fonts.add(new FontFace('Carlito', boldFont, { weight: '700' }));
  } catch {
    /* falls back to system fonts */
  }
}
