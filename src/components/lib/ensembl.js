// Ensembl lookups via the Ensembl GraphQL API (https://www.ensembl.org/data/graphql).
//
// The legacy REST API (rest.ensembl.org) was frozen at Ensembl release 116 and
// is not being ported to the new Ensembl platform; GraphQL is its replacement.
// The API is still versioned as a beta (0.2.0-beta at time of writing), so the
// schema may change.
//
// fetchEnsemblGene returns:
//   { id, symbol, strand: "+" | "-" | null,
//     transcripts: [{ id, symbol, biotype, isCanonical,
//                     exons: [{ id, start, end }],                      // ascending genomic order
//                     translation: { id, start, end, length } | null }] }
// - IDs are unversioned (e.g. "ENSG00000012048").
// - Coordinates are GRCh38, 1-based and inclusive, with start <= end on either
//   strand (translation.start/end are the genomic CDS bounds).
// - translation.length is the protein length in amino acids; translation is
//   null for non-coding transcripts.

export const ENSEMBL_GRAPHQL_URL = "https://www.ensembl.org/data/graphql";

// Ensembl genome UUID for human GRCh38 (assembly GCA_000001405.29). Every
// GraphQL query is scoped to a genome by this ID rather than a species name.
export const GRCH38_GENOME_ID = "59871324-7803-4234-856e-2a2bd96d7b3c";

// GraphQL reports query errors with HTTP 200 and an `errors` array, so both
// the status and the body are checked. A GENE_NOT_FOUND error resolves to
// null rather than throwing, so callers can tell "no such gene" apart from a
// failed request.
async function ensemblGraphql(query, variables, signal) {
  const res = await fetch(ENSEMBL_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (Array.isArray(body?.errors) && body.errors.length > 0) {
    if (body.errors.every((e) => e?.extensions?.code === "GENE_NOT_FOUND")) return null;
    throw new Error(body.errors[0]?.message || "Ensembl GraphQL error");
  }
  return body?.data ?? null;
}

// Exon has no unversioned_stable_id field, so its stable_id ("ENSE….N") is
// stripped of the version suffix here to match the other IDs.
const stripVersion = (id) => (typeof id === "string" ? id.replace(/\.\d+$/, "") : null);

const toAscending = (a, b) => ({ start: Math.min(a, b), end: Math.max(a, b) });

function toTranscript(t) {
  const exons = (Array.isArray(t?.spliced_exons) ? t.spliced_exons : [])
    .map((se) => {
      const { start, end } = se?.exon?.slice?.location ?? {};
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return { id: stripVersion(se.exon.stable_id), ...toAscending(start, end) };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);

  // A transcript can have several product-generating contexts; the one marked
  // default is the canonical protein.
  //
  // Genomic CDS bounds are derived from cds.relative_start/relative_end (1-based
  // offsets from the transcript's 5' end), NOT cds.start/end: on the reverse
  // strand cds.start/end come back snapped to the first/last coding exon's
  // inner boundary (e.g. BRCA1-203 gives 43124017 rather than its start codon at
  // 43124096), which drops ~200 coding nt and misplaces protein domains. The
  // relative offsets reproduce cds.nucleotide_length exactly on both strands.
  const contexts = Array.isArray(t?.product_generating_contexts) ? t.product_generating_contexts : [];
  const coding = contexts.find((c) => c?.default && c?.cds && c?.product)
    ?? contexts.find((c) => c?.cds && c?.product);
  const txLoc = t?.slice?.location;
  const strandCode = t?.slice?.strand?.code;
  const relStart = coding?.cds?.relative_start;
  const relEnd = coding?.cds?.relative_end;
  let cdsBounds = null;
  if (coding && Number.isFinite(relStart) && Number.isFinite(relEnd)
      && Number.isFinite(txLoc?.start) && Number.isFinite(txLoc?.end)) {
    if (strandCode === "forward") cdsBounds = toAscending(txLoc.start + relStart - 1, txLoc.start + relEnd - 1);
    else if (strandCode === "reverse") cdsBounds = toAscending(txLoc.end - relEnd + 1, txLoc.end - relStart + 1);
  }
  const translation = cdsBounds
    ? {
        id: coding.product.unversioned_stable_id ?? null,
        ...cdsBounds,
        length: Number.isFinite(coding.product.length) ? coding.product.length : null,
      }
    : null;

  return {
    id: t.unversioned_stable_id,
    symbol: t.symbol || t.unversioned_stable_id,
    biotype: t.metadata?.biotype?.value || "unknown",
    isCanonical: t.metadata?.canonical?.value === true,
    exons,
    translation,
  };
}

// Gene symbol -> unversioned Ensembl gene ID, or null if Ensembl has no gene
// with that symbol. The match is exact and case-sensitive ("BRCA1", not "brca1").
export async function fetchEnsemblGeneId(symbol, signal) {
  const data = await ensemblGraphql(
    `query ($g: String!, $s: String!) {
      genes(by_symbol: { genome_id: $g, symbol: $s }) { unversioned_stable_id }
    }`,
    { g: GRCH38_GENOME_ID, s: symbol },
    signal,
  );
  const genes = Array.isArray(data?.genes) ? data.genes : [];
  return genes.find((g) => g?.unversioned_stable_id?.startsWith("ENSG"))?.unversioned_stable_id ?? null;
}

// Gene ID (versioned or not) -> gene with all transcripts, exons and
// translations (shape at top of file), or null if not found.
export async function fetchEnsemblGene(geneId, signal) {
  const data = await ensemblGraphql(
    `query ($g: String!, $id: String!) {
      gene(by_id: { genome_id: $g, stable_id: $id }) {
        unversioned_stable_id
        symbol
        slice { strand { code } }
        transcripts {
          unversioned_stable_id
          symbol
          slice { location { start end } strand { code } }
          metadata { biotype { value } canonical { value } }
          spliced_exons { exon { stable_id slice { location { start end } } } }
          product_generating_contexts {
            default
            cds { relative_start relative_end }
            product { unversioned_stable_id length }
          }
        }
      }
    }`,
    { g: GRCH38_GENOME_ID, id: geneId },
    signal,
  );
  const g = data?.gene;
  if (!g) return null;
  const strandCode = g.slice?.strand?.code;
  return {
    id: g.unversioned_stable_id,
    symbol: g.symbol ?? null,
    strand: strandCode === "forward" ? "+" : strandCode === "reverse" ? "-" : null,
    transcripts: (Array.isArray(g.transcripts) ? g.transcripts : [])
      .filter((t) => t?.unversioned_stable_id)
      .map(toTranscript),
  };
}
