// Junction coordinate conventions, defined in one place.
//
// The Junction Expression page's junctionIds ('chr_intronStart_intronEnd',
// from gene-junction-expression) use STAR's intron coordinates: the first
// and last base of the intron. The tej table (Explore) instead reports a
// junction by its flanking exons, "chr:upStart-upEnd_downStart-downEnd", so
// the junction runs from upEnd (last base of the upstream exon) to
// downStart (first base of the downstream exon).
//
// TAPESTRY displays junctions in the tej-table convention on every page, so
// the same junction reads the same everywhere and lines up with the Ensembl
// exon coordinates shown in the gene model. junctionIds themselves stay in
// intron coordinates -- the API and GtexGeneModel's exon matching rely on
// them -- and are converted only for display, on both strands:
//   upEnd = intronStart - 1, downStart = intronEnd + 1
// e.g. junctionId "chr10_116862853_116868649" displays as 116862852-116868650.

// Splits a 'chr_intronStart_intronEnd' junctionId into its chromosome and
// display coordinates (last base of the upstream exon, first base of the
// downstream exon). Reads the coordinates from the end in case a contig
// name itself contains an underscore.
export function junctionIdToDisplayCoords(junctionId) {
  const parts = junctionId.split("_");
  const intronEnd = Number(parts.pop());
  const intronStart = Number(parts.pop());
  return { chr: parts.join("_"), start: intronStart - 1, end: intronEnd + 1 };
}
