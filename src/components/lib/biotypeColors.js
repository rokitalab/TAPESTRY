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

// Dark-mode counterparts: several BIO_COLOURS are too dark to read on the
// dark theme's #262c35 paper (protein_coding 2.7:1, retained_intron 2.0:1,
// other 1.9:1), so each is lightened to at least ~5:1 against it while
// keeping the biotypes distinguishable.
export const BIO_COLOURS_DARK = {
  protein_coding: "#4da3e8",
  lncRNA: "#e39ccb",
  miRNA: "#8fd3f7",
  snRNA: "#a98bf5",
  snoRNA: "#c78cf0",
  processed_transcript: "#e8925a",
  retained_intron: "#c9a07a",
  nonsense_mediated_decay: "#f2b84b",
  pseudogene: "#F0E442",
  other: "#9aa5b1",
};

// mode is the MUI palette mode ("light" | "dark"); defaults to light.
export function colourForBiotype(bt, mode = "light") {
  const colours = mode === "dark" ? BIO_COLOURS_DARK : BIO_COLOURS;
  const key = String(bt || "other").toLowerCase();
  // Normalize common variants
  if (key == "protein_coding") return colours.protein_coding;
  if (key.includes("lncrna")) return colours.lncRNA;
  if (key.includes("mirna")) return colours.miRNA;
  if (key.includes("snrna")) return colours.snRNA;
  if (key.includes("snorna")) return colours.snoRNA;
  if (key.includes("processed_transcript")) return colours.processed_transcript;
  if (key.includes("retained_intron")) return colours.retained_intron;
  if (key.includes("nonsense") || key.includes("decay")) return colours.nonsense_mediated_decay;
  if (key.includes("pseudogene")) return colours.pseudogene;
  return colours.other;
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
