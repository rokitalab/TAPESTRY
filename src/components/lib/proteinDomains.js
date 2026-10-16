// UniProt protein-domain lookup + AA-to-genomic coordinate mapping, used by
// TranscriptVis.jsx to draw a domain track under the highlighted transcript.

const DOMAIN_COLOURS = [
  "#D55E00", "#009E73", "#0072B2", "#CC79A7",
  "#E69F00", "#56B4E9", "#8DA0CB", "#A6761D",
];

export function colourForDomainIndex(i) {
  return DOMAIN_COLOURS[i % DOMAIN_COLOURS.length];
}

export function stripVersion(id) {
  return String(id ?? "").split(".")[0];
}

// Fetches the reviewed UniProt entry for a gene (human) and returns its
// Domain-type features (1-based, inclusive AA coordinates, on the canonical
// isoform), the canonical isoform's length, and the set of Ensembl
// transcript/protein IDs UniProt maps to the canonical isoform, so callers can
// tell whether a given Ensembl transcript encodes the sequence the domain
// coordinates refer to.
export async function fetchUniProtDomains(geneName, { signal } = {}) {
  if (!geneName) return null;
  const query = `organism_id:9606 AND gene:${geneName} AND reviewed:true`;
  const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(query)}&fields=accession,length,ft_domain,xref_ensembl,cc_alternative_products&format=json`;
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const entry = data?.results?.[0];
  if (!entry) return null;

  const domains = (entry.features || [])
    .filter(f => f?.type === "Domain")
    .map(f => {
      const start = Number(f?.location?.start?.value);
      const end = Number(f?.location?.end?.value);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return { start: Math.min(start, end), end: Math.max(start, end), description: f?.description || "Domain" };
    })
    .filter(Boolean);

  // UniProt cross-references Ensembl transcripts for every isoform, tagging
  // each with an isoformId; domain coordinates are on the "Displayed"
  // (canonical) isoform only. Xrefs without an isoformId belong to entries
  // with a single isoform.
  const canonicalIsoforms = new Set();
  (entry.comments || [])
    .filter(c => c?.commentType === "ALTERNATIVE PRODUCTS")
    .forEach(c => (c.isoforms || [])
      .filter(iso => iso?.isoformSequenceStatus === "Displayed")
      .forEach(iso => (iso.isoformIds || []).forEach(id => canonicalIsoforms.add(id))));

  const ensemblXrefs = (entry.uniProtKBCrossReferences || []).filter(x => x?.database === "Ensembl");
  const ensemblIds = new Set();
  ensemblXrefs
    .filter(x => !x.isoformId || canonicalIsoforms.has(x.isoformId))
    .forEach(x => {
      if (x.id) ensemblIds.add(stripVersion(x.id));
      const proteinId = (x.properties || []).find(p => p?.key === "ProteinId")?.value;
      if (proteinId) ensemblIds.add(stripVersion(proteinId));
    });

  const length = Number(entry.sequence?.length);

  return {
    accession: entry.primaryAccession || null,
    domains,
    length: Number.isFinite(length) ? length : null,
    ensemblIds,
    hasEnsemblXrefs: ensemblXrefs.length > 0,
  };
}

// Maps UniProt AA-coordinate domains onto a transcript's coding exons,
// producing genomic-coordinate segments (a domain can split into more than
// one segment if it straddles an exon boundary).
//
// transcript: { exons: [{start,end}] (genomic, ascending), translation: {start,end} (genomic CDS bounds) }
// All genomic coordinates are 1-based and inclusive, as Ensembl returns them.
export function mapDomainsToGenomicSegments(domains, transcript, strand) {
  if (!domains?.length || !transcript?.exons?.length || !transcript?.translation) return [];
  const { start: cdsStart, end: cdsEnd } = transcript.translation;
  if (!Number.isFinite(cdsStart) || !Number.isFinite(cdsEnd) || cdsEnd <= cdsStart) return [];

  const codingSegments = transcript.exons
    .map(e => ({ start: Math.max(e.start, cdsStart), end: Math.min(e.end, cdsEnd) }))
    .filter(s => s.end >= s.start)
    .sort((a, b) => a.start - b.start);
  if (codingSegments.length === 0) return [];

  // Order 5'->3': ascending genomic order for +, descending for -.
  const ordered = strand === "-" ? [...codingSegments].reverse() : codingSegments;

  let cum = 0;
  const table = ordered.map(seg => {
    const len = seg.end - seg.start + 1;
    const withCum = { ...seg, cumStart: cum, cumEnd: cum + len };
    cum += len;
    return withCum;
  });

  const results = [];
  domains.forEach((d, idx) => {
    const ntStart = (d.start - 1) * 3;
    const ntEnd = d.end * 3;
    const segments = [];
    table.forEach(seg => {
      const overlapStart = Math.max(ntStart, seg.cumStart);
      const overlapEnd = Math.min(ntEnd, seg.cumEnd);
      if (overlapEnd <= overlapStart) return;
      const offsetStart = overlapStart - seg.cumStart;
      const offsetEnd = overlapEnd - seg.cumStart;
      let gStart, gEnd;
      if (strand === "-") {
        // 5' end of this segment is the higher genomic coordinate (seg.end).
        gEnd = seg.end - offsetStart;
        gStart = seg.end - offsetEnd + 1;
      } else {
        gStart = seg.start + offsetStart;
        gEnd = seg.start + offsetEnd - 1;
      }
      segments.push({ start: Math.min(gStart, gEnd), end: Math.max(gStart, gEnd) });
    });
    if (segments.length > 0) {
      results.push({ key: `${d.start}-${d.end}-${idx}`, description: d.description, aaStart: d.start, aaEnd: d.end, segments });
    }
  });
  return results;
}
