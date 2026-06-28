// Canonical plot_group → hex color, sourced from cohort-histologies.tsv
// "Oligodendroglioma" uses CSS named color "tan" (#D2B48C) in the source file.
// "Low-grade glioma" has two hex values in the source; #8f8fbf is the majority.
export const HISTOLOGY_COLORS = {
  "Atypical Teratoid Rhabdoid Tumor": "#4d0d85",
  "Choroid plexus tumor":             "#00441B",
  "Craniopharyngioma":                "#b2502d",
  "Diffuse midline glioma":           "#ff40d9",
  "Ependymoma":                       "#2200ff",
  "Germ cell tumor":                  "#0074d9",
  "Low-grade glioma":                 "#8f8fbf",
  "Medulloblastoma":                  "#a340ff",
  "Meningioma":                       "#2db398",
  "Mesenchymal tumor":                "#7fbf00",
  "Mixed neuronal-glial tumor":       "#685815",
  "Neurofibroma plexiform":           "#e6ac39",
  "Non-neoplastic tumor":             "#FFF5EB",
  "Oligodendroglioma":                "#D2B48C",
  "Other CNS embryonal tumor":        "#b08ccf",
  "Other high-grade glioma":          "#ffccf5",
  "Other tumor":                      "#b5b5b5",
  "Schwannoma":                       "#ab7200",
};

/** Returns the hex color for a plot_group, or a fallback if not found. */
export function histologyColor(plotGroup, fallback = "#b5b5b5") {
  return HISTOLOGY_COLORS[plotGroup] ?? fallback;
}

// Control samples don't have per-histology colors; color them by source cohort instead.
export const CONTROL_COHORT_COLORS = {
  "GTEx": "#1f77b4",
  "Evo-devo": "#e67e22",
  "Pediatric brain": "#2ca02c",
  "Pediatric brain cell type": "#17becf",
};

/** Returns the hex color for a control sample's source cohort, or a fallback if not found. */
export function controlCohortColor(cohort, fallback = "#b5b5b5") {
  return CONTROL_COHORT_COLORS[cohort] ?? fallback;
}

