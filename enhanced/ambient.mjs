const width = 12;
const height = 8;
const band = 3;

/** Sample once per loaded image, keeping only three bounded CSS colors. */
export function ambientPalette(image) {
  const source = new URL(image.currentSrc || image.src, document.baseURI);
  if (source.origin !== location.origin) return [];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext('2d');
    if (!context) return [];
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    return [[0, 0, band, height], [width - band, 0, width, height], [0, height - band, width, height]].map(([left, top, right, bottom]) => {
      const channels = [0, 0, 0];
      const area = (right - left) * (bottom - top);
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const offset = (y * width + x) * 4;
          for (let channel = 0; channel < channels.length; channel++) channels[channel] += pixels[offset + channel] / area;
        }
      }
      const light = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      const alpha = Math.min(0.53, Math.max(0, (light - 10) / 110)) * (1 - 0.48 * Math.max(0, light - 145) / 110);
      const muted = channels.map(value => Math.round(Math.min(178, (value * 0.74 + light * 0.26) * 0.92)));
      return `rgb(${muted.join(' ')} / ${alpha.toFixed(3)})`;
    });
  } catch {
    return [];
  }
}
