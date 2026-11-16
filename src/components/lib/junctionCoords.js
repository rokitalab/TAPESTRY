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
// intron coordinates. Reads the coordinates from the end in case a contig
// name itself contains an underscore.
export function junctionIdToIntron(junctionId) {
  const parts = junctionId.split("_");
  const intronEnd = Number(parts.pop());
  const intronStart = Number(parts.pop());
  return { chr: parts.join("_"), intronStart, intronEnd };
}

// Splits a junctionId into its chromosome and display coordinates (last
// base of the upstream exon, first base of the downstream exon).
export function junctionIdToDisplayCoords(junctionId) {
  const { chr, intronStart, intronEnd } = junctionIdToIntron(junctionId);
  return { chr, start: intronStart - 1, end: intronEnd + 1 };
}

const TEJ_JUNCTION_RE = /^([^:]+):(\d+)-(\d+)_(\d+)-(\d+)$/;

// The reverse direction, for matching tej-table rows against junctionIds:
// takes a tej junction string ("chr:upStart-upEnd_downStart-downEnd") to
// its 'chr_intronStart_intronEnd' junctionId, or null if it doesn't parse.
// Orders the two flanking exons by start first, so the result doesn't
// depend on which exon is listed first.
// e.g. "chr10:116862799-116862852_116868650-116868706" -> "chr10_116862853_116868649"
export function tejJunctionToJunctionId(junction) {
  const m = TEJ_JUNCTION_RE.exec((junction ?? "").trim());
  if (!m) return null;
  const [left, right] = [
    { start: Number(m[2]), end: Number(m[3]) },
    { start: Number(m[4]), end: Number(m[5]) },
  ].sort((a, b) => a.start - b.start);
  return `${m[1]}_${left.end + 1}_${right.start - 1}`;
}
