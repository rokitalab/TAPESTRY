// TAPESTRY release history (newest first).
// `date` is optional; omit it until the release date is confirmed.

export const RELEASES = [
  {
    version: "v1.0.0",
    current: true,
    summary:
      "Updated oncofetal definition, new rare CNS tumor histology groups, and expanded documentation.",
    changes: [
      "Oncofetal definition updated. A tumor-enriched junction is now called oncofetal when at least one prenatal evo-devo region/week-bin group has a minimum prenatal-to-postnatal fold change greater than 2 and a minimum SNR greater than 2 against every postnatal region/stage group. Tumor-enriched junctions that do not meet this are shown as Tumor-specific. The call is made per junction.",
      "Rare CNS tumors added to the cohort as separate histology groups: Rare CNS tumor (48 samples), Other CNS embryonal tumor (27), and Pineoblastoma (12). Samples previously grouped as \"Other tumor\" were removed. The cohort now has 1,962 PBTA RNA-seq specimens across 19 histology groups.",
      "Docs: updated glossary and methods text for the new definition, added a table of contents, a link to the pbta-tumor-enriched-junctions repository, and this release notes page.",
    ],
  },
  {
    version: "v0.9.0",
    summary:
      "Initial release of TAPESTRY, a web app for exploring tumor-enriched and oncofetal splice junctions (TEJs) in pediatric CNS tumors.",
    changes: [
      "Home page with quick search by gene, histology, or splice event type, and cohort summary plots.",
      "Explore page to filter, sort, and export TEJs, with per-junction CPM plots across tumor histologies, normal-tissue controls, cell lines, and evo-devo timepoints, and exon/transcript diagrams.",
      "Junction Expression page, Docs (glossary and use-case walkthroughs), and About page.",
    ],
  },
];
