const width = 12;
const height = 8;
const band = 3;

/** Sample once per loaded image, keeping only a pair of bounded CSS colors. */
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
    return [0, width - band].map(start => {
      const channels = [0, 0, 0];
      for (let y = 0; y < height; y++) {
        for (let x = start; x < start + band; x++) {
          const offset = (y * width + x) * 4;
          channels.forEach((_, channel) => { channels[channel] += pixels[offset + channel] / (band * height); });
        }
      }
      const light = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      const alpha = Math.min(0.29, Math.max(0, (light - 11) / 155)) * (light > 190 ? 0.65 : 1);
      const muted = channels.map(value => Math.round(Math.min(176, (value * 0.76 + light * 0.24) * 0.86)));
      return `rgb(${muted.join(' ')} / ${alpha.toFixed(3)})`;
    });
  } catch {
    return [];
  }
}
