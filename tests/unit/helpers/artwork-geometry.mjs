/** Geometric checks shared by browser evidence and captured regression cases.
 * Hidden/empty boxes cannot collide. No DOM, CSS values or image URLs needed. */
const visible = rect => rect && rect.width > 0 && rect.height > 0
  && rect.display !== 'none' && rect.visibility !== 'hidden';

export function intersection(first, second) {
  if (!visible(first) || !visible(second)) return { width: 0, height: 0, area: 0 };
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return { width, height, area: width * height };
}

export function separated(first, second, tolerance = 1) {
  const overlap = intersection(first, second);
  return overlap.width <= tolerance || overlap.height <= tolerance;
}
