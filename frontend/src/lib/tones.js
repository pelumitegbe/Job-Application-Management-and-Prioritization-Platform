// Accent "tones" shared by icon tiles, stat cards, bars and empty states,
// so each feature keeps the same colour everywhere in the app.
// Text classes use darker shades to keep WCAG AA contrast on the soft backgrounds.
export const TONES = {
  violet: { tile: 'bg-violet-100 text-violet-700', solid: 'bg-violet-500', soft: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200' },
  blue: { tile: 'bg-blue-100 text-blue-700', solid: 'bg-blue-500', soft: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
  teal: { tile: 'bg-teal-100 text-teal-700', solid: 'bg-teal-500', soft: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-200' },
  coral: { tile: 'bg-orange-100 text-orange-700', solid: 'bg-coral', soft: 'bg-orange-50', text: 'text-orange-700', ring: 'ring-orange-200' },
  amber: { tile: 'bg-amber-100 text-amber-800', solid: 'bg-amber-400', soft: 'bg-amber-50', text: 'text-amber-800', ring: 'ring-amber-200' },
};
