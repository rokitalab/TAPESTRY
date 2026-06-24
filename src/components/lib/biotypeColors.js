// Shared Ensembl/GENCODE transcript-biotype color scheme, used by
// TranscriptVis.jsx and GeneModelGtex.jsx so the same biotype renders in
// the same color in both places.
export const BIO_COLOURS = {
  protein_coding: "#0072B2",
  lncRNA: "#CC79A7",
  miRNA: "#56B4E9",
  snRNA: "#7c3aed",
  snoRNA: "#9d4edd",
  processed_transcript: "#b45309",
  retained_intron: "#92400e",
  nonsense_mediated_decay: "#E69F00",
  pseudogene: "#F0E442",
  other: "#4b5563",
};

export function colourForBiotype(bt) {
  const key = String(bt || "other").toLowerCase();
  // Normalize common variants
  if (key == "protein_coding") return BIO_COLOURS.protein_coding;
  if (key.includes("lncrna")) return BIO_COLOURS.lncRNA;
  if (key.includes("mirna")) return BIO_COLOURS.miRNA;
  if (key.includes("snrna")) return BIO_COLOURS.snRNA;
  if (key.includes("snorna")) return BIO_COLOURS.snoRNA;
  if (key.includes("processed_transcript")) return BIO_COLOURS.processed_transcript;
  if (key.includes("retained_intron")) return BIO_COLOURS.retained_intron;
  if (key.includes("nonsense") || key.includes("decay")) return BIO_COLOURS.nonsense_mediated_decay;
  if (key.includes("pseudogene")) return BIO_COLOURS.pseudogene;
  return BIO_COLOURS.other;
}

export function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex; // fallback
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
