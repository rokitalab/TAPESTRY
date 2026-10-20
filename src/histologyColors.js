// Canonical plot_group → hex color, sourced from cohort-histologies.tsv
// (plot_group / plot_group_hex). Keys must match the plot_group values in the
// data exactly -- they are also the values sent to the API as filters. To show
// a different name in the UI, add it to HISTOLOGY_LABELS rather than renaming
// a key here.
// "Oligodendroglioma" uses CSS named color "tan" (#D2B48C) in the source file.
// "Rare CNS tumor" is #b5b5b5 in the source file; it's overridden here so it
// doesn't look like the gray fallback used for unknown groups.
export const HISTOLOGY_COLORS = {
  "Atypical Teratoid Rhabdoid Tumor": "#4d0d85",
  "Choroid plexus tumor":             "#00441B",
  "Craniopharyngioma":                "#b2502d",
  "DIPG or DMG":                      "#ff40d9",
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
  "Pineoblastoma":                    "#FF2900",
  "Rare CNS tumor":                   "#9F0B62",
  "Schwannoma/MPNST":                 "#ab7200",
};

// Display names for plot_groups whose data value differs from what the UI
// should show. Anything not listed is shown as-is.
export const HISTOLOGY_LABELS = {
  "DIPG or DMG": "Diffuse midline glioma",
};

/** Returns the hex color for a plot_group, or a fallback if not found. */
export function histologyColor(plotGroup, fallback = "#b5b5b5") {
  return HISTOLOGY_COLORS[plotGroup] ?? fallback;
}

/** Returns the display name for a plot_group (the plot_group itself if not renamed). */
export function histologyLabel(plotGroup) {
  return HISTOLOGY_LABELS[plotGroup] ?? plotGroup;
}

/** All tumor plot_groups, sorted by display name, for dropdowns. */
export const HISTOLOGIES = Object.keys(HISTOLOGY_COLORS).sort((a, b) =>
  histologyLabel(a).localeCompare(histologyLabel(b))
);

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

