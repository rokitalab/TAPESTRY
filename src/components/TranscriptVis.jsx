import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Divider, Typography, Stack, Chip, Tooltip } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { colourForBiotype, hexToRgba } from "./lib/biotypeColors";
import { fetchUniProtDomains, mapDomainsToGenomicSegments, stripVersion, colourForDomainIndex } from "./lib/proteinDomains";

// Genomic CDS bounds (always ascending, regardless of strand), protein
// stable ID and protein length (AA) from Ensembl's Translation object, used to
// place UniProt domains and check they belong to this protein.
function parseTranslation(raw) {
  if (!raw) return null;
  const s = Number(raw.start ?? raw.seq_region_start);
  const en = Number(raw.end ?? raw.seq_region_end);
  if (!Number.isFinite(s) || !Number.isFinite(en)) return null;
  const id = raw.id || raw.stable_id || null;
  const length = Number(raw.length);
  return { id, start: Math.min(s, en), end: Math.max(s, en), length: Number.isFinite(length) ? length : null };
}

// Background of the REFERENCE tag on the reference transcript's label.
const REFERENCE_TAG_COLOR = "#4a5562";

// Direction chevrons on intron lines: one shared column every CHEVRON_STEP_PX
// across the track so they line up between rows, skipped wherever a chevron
// would come within CHEVRON_PAD_PX of an exon. ROW_LABEL_PX is the fixed row
// label width (200) plus its right margin (8), so every track is the same width.
const CHEVRON_STEP_PX = 40;
const CHEVRON_SIZE_PX = 8;
const CHEVRON_PAD_PX = 3;
const ROW_LABEL_PX = 208;

// Intron retention junctions ("chr:s1-e1_s2-e2" with e1 === s2) pair an exon
// piece with the retained intron, meeting at one exon boundary b. Returns the
// indices of the exons flanking that intron (exons sorted ascending), or -1s
// when b is not an annotated boundary of this transcript.
function retainedIntronExons(exons, b) {
  const endIdx = exons.findIndex(e => e.end === b);
  if (endIdx >= 0 && endIdx + 1 < exons.length) return { leftExonIdx: endIdx, rightExonIdx: endIdx + 1 };
  const startIdx = exons.findIndex(e => e.start === b);
  if (startIdx > 0) return { leftExonIdx: startIdx - 1, rightExonIdx: startIdx };
  return { leftExonIdx: -1, rightExonIdx: -1 };
}

export default function TranscriptVis({ geneID, geneName = null, strand = "+", highlightedTranscript = null, highlightedTranscriptId = null, junctionCoords = null, junctionName = null, junctionString = null }) {
  const [txList, setTxList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [activeBiotypes, setActiveBiotypes] = useState(new Set());
  const [canonicalOnly, setCanonicalOnly] = useState(false);
  const [apiStrand, setApiStrand] = useState(null);

  // Clears transcripts when geneID is cleared. Done during render (rather
  // than as a setState call inside the fetch effect below) by comparing
  // against the geneID seen on the previous render.
  const [prevGeneID, setPrevGeneID] = useState(geneID);
  if (geneID !== prevGeneID) {
    setPrevGeneID(geneID);
    if (!geneID) setTxList([]);
  }

  useEffect(() => {
    if (!geneID) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setTxList([]);
    setFetchError(null);
    const url = `https://rest.ensembl.org/lookup/id/${encodeURIComponent(geneID)}?content-type=application/json;expand=1`;
    fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (!active) return;
        // Derive strand from gene lookup: 1 => '+', -1 => '-'
        const s = data?.strand;
        let sChar = null;
        if (s === 1 || s === "1") sChar = "+";
        else if (s === -1 || s === "-1") sChar = "-";
        setApiStrand(sChar);
        const arr = Array.isArray(data.Transcript) ? data.Transcript
                  : Array.isArray(data.transcripts) ? data.transcripts
                  : [];
        const canonicalId = data?.canonical_transcript || data?.canonicalTranscript || data?.Canonical_transcript || null;
        const items = arr.map(t => {
          const id = t && (t.id || t.stable_id || t.transcript_id);
          if (!id) return null;
          const biotype = t?.biotype || t?.BioType || t?.biotype_name || "unknown";
          const isCanonical = (t?.is_canonical === 1 || t?.is_canonical === true || (canonicalId && id === canonicalId));
          const displayName = t?.display_name || t?.name || id;
          const colour = colourForBiotype(biotype);
          // Robust exon count extraction across potential shapes (arrays or objects, plus numeric fields)
          let exonCount = null;
          const candidates = [t?.Exon, t?.exon, t?.exons];
          for (const c of candidates) {
            if (Array.isArray(c)) { exonCount = c.length; break; }
            if (c && typeof c === 'object') {
              const keys = Object.keys(c);
              if (keys.length > 0) { exonCount = keys.length; break; }
            }
          }
          if (exonCount == null) {
            if (Number.isFinite(t?.exon_count)) exonCount = t.exon_count;
            else if (Number.isFinite(t?.exonCount)) exonCount = t.exonCount;
            else if (Number.isFinite(t?.exons_count)) exonCount = t.exons_count;
          }
          // Extract exon coordinates and normalize to { start, end }. Left as `null`
          // (rather than []) when the gene-level payload had no Exon/exon/exons key at
          // all, so the backfill effect below can tell "not fetched yet" apart from
          // "fetched, genuinely has zero exons" and knows which transcripts to re-fetch.
          const hasExonSource = candidates.some(c => c != null);
          let rawExons = [];
          for (const c of candidates) {
            if (Array.isArray(c)) { rawExons = c; break; }
            if (c && typeof c === 'object') { rawExons = Object.values(c); break; }
          }
          const exons = hasExonSource
            ? (rawExons || [])
                .map(e => {
                  const s = Number(e?.start ?? e?.seq_region_start ?? e?.begin ?? e?.location_start);
                  const en = Number(e?.end ?? e?.seq_region_end ?? e?.finish ?? e?.location_end);
                  if (!Number.isFinite(s) || !Number.isFinite(en)) return null;
                  return { start: Math.min(s, en), end: Math.max(s, en) };
                })
                .filter(Boolean)
                .sort((a, b) => a.start - b.start)
            : null;
          if (exonCount == null) exonCount = exons?.length > 0 ? exons.length : null;
          const translation = parseTranslation(t?.Translation ?? t?.translation);
          return { id, displayName, biotype, isCanonical, colour, exonCount, exons, translation };
        }).filter(Boolean);
        setTxList(items);
        // Ensure all biotypes are selected immediately upon data load
        const allBiotypes = new Set(items.map(it => it.biotype));
        setActiveBiotypes(allBiotypes);
        setLoading(false);
      })
      .catch(err => {
        if (!active) return;
        if (err.name !== "AbortError") {
          console.error("TranscriptVis Ensembl lookup failed", err);
          setFetchError(err.message);
        }
        setTxList([]);
        setLoading(false);
      });
    return () => { active = false; controller.abort(); };
  }, [geneID]);

  const legendItems = useMemo(() => {
    const map = new Map();
    txList.forEach(t => {
      if (!map.has(t.biotype)) map.set(t.biotype, t.colour);
    });
    return Array.from(map.entries());
  }, [txList]);

  // Compute genomic domain across ALL transcripts for consistent scaling
  const coordDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    txList.forEach(t => {
      (t.exons || []).forEach(e => {
        if (Number.isFinite(e.start) && Number.isFinite(e.end)) {
          if (e.start < min) min = e.start;
          if (e.end > max) max = e.end;
        }
      });
    });
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    return { min, max, span: Math.max(1, max - min) };
  }, [txList]);

  // Backfill exon coordinates per transcript if gene-level lookup omitted them
  useEffect(() => {
    if (!geneID || txList.length === 0) return;
    const missing = txList
      .filter(t => t.exons == null)
      .map(t => t.id);
    if (missing.length === 0) return;

    const controller = new AbortController();
    const headers = { Accept: "application/json" };

    const parseExons = (raw) => {
      let arr = raw;
      if (!arr) return [];
      if (!Array.isArray(arr) && typeof arr === "object") arr = Object.values(arr);
      if (!Array.isArray(arr)) return [];
      return arr
        .map(e => {
          const s = Number(e?.start ?? e?.seq_region_start ?? e?.begin ?? e?.location_start);
          const en = Number(e?.end ?? e?.seq_region_end ?? e?.finish ?? e?.location_end);
          if (!Number.isFinite(s) || !Number.isFinite(en)) return null;
          return { start: Math.min(s, en), end: Math.max(s, en) };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
    };

    Promise.allSettled(
      missing.map(id =>
        fetch(`https://rest.ensembl.org/lookup/id/${encodeURIComponent(id)}?content-type=application/json;expand=1`, { signal: controller.signal, headers })
          .then(r => (r.ok ? r.json() : null))
          .then(d => {
            const raw = d?.Exon ?? d?.exon ?? d?.exons;
            const exons = parseExons(raw);
            const translation = parseTranslation(d?.Translation ?? d?.translation);
            return { id, exons, translation };
          })
          .catch(() => ({ id, exons: [], translation: null }))
      )
    )
      .then(results => {
        const byId = new Map();
        results.forEach((r, i) => {
          if (r.status === "fulfilled" && r.value) {
            byId.set(r.value.id, { exons: r.value.exons || [], translation: r.value.translation || null });
          } else {
            byId.set(missing[i], { exons: [], translation: null });
          }
        });
        setTxList(prev => prev.map(t => {
          if (Array.isArray(t.exons) && t.exons.length > 0) return t;
          const backfilled = byId.get(t.id);
          if (!backfilled) return t;
          const exonCount = t.exonCount != null ? t.exonCount : (backfilled.exons.length > 0 ? backfilled.exons.length : null);
          return { ...t, exons: backfilled.exons, exonCount, translation: t.translation ?? backfilled.translation };
        }));
      })
      .catch(() => {});

    return () => controller.abort();
  }, [geneID, txList]);
 
  // Resets the biotype selection to "all" whenever the available legend
  // items change. Done during render, comparing against the legendItems
  // seen on the previous render, rather than as a setState call inside an
  // effect.
  const [prevLegendItems, setPrevLegendItems] = useState(legendItems);
  if (legendItems !== prevLegendItems) {
    setPrevLegendItems(legendItems);
    if (legendItems.length === 0) {
      setActiveBiotypes(new Set());
      setCanonicalOnly(false);
    } else {
      const available = new Set(legendItems.map(([bio]) => bio));
      let differs = activeBiotypes.size !== available.size;
      if (!differs) {
        for (const b of available) { if (!activeBiotypes.has(b)) { differs = true; break; } }
      }
      if (differs) {
        setActiveBiotypes(available);
        setCanonicalOnly(false);
      }
    }
  }


  const toggleBio = (bio) => {
    setActiveBiotypes((prev) => {
      const next = new Set(prev);
      if (next.has(bio)) next.delete(bio); else next.add(bio);
      return next;
    });
  };

  const visible = useMemo(() => {
    const noBiotype = activeBiotypes.size === 0;
    const filtered = txList.filter(t =>
      (canonicalOnly && t.isCanonical) ||
      (noBiotype ? !canonicalOnly : activeBiotypes.has(t.biotype))
    );
    // Canonical first, then ascending by the -201 number in displayName (same order as GeneModelGtex)
    return [...filtered].sort((a, b) => {
      if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
      const numOf = (name) => { const m = (/-(\d+)$/).exec(name || ""); return m ? Number(m[1]) : null; };
      const na = numOf(a.displayName), nb = numOf(b.displayName);
      if (na !== null && nb !== null) return na - nb;
      if (na !== null) return -1;
      if (nb !== null) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [txList, activeBiotypes, canonicalOnly]);

  // The junction's transcript, from all transcripts (not just the visible ones).
  // Matched by Ensembl ID with the version stripped, which survives renamed or
  // prefixed names (e.g. "novel_donor:NT5C2-201"); falls back to the display name
  // parsed from junction_name when there is no ID or Ensembl no longer has it.
  // For a junction spanning two transcripts ("A;B"), the first ID found is used.
  const junctionTx = useMemo(() => {
    const ids = (highlightedTranscriptId ?? "").split(";").map(stripVersion).filter(Boolean);
    for (const id of ids) {
      const t = txList.find(t => stripVersion(t.id) === id);
      if (t) return t;
    }
    return highlightedTranscript ? txList.find(t => t.displayName === highlightedTranscript) ?? null : null;
  }, [txList, highlightedTranscriptId, highlightedTranscript]);

  // Exon indices in the highlighted transcript that bracket the junction of interest,
  // computed here so zoomDomain can be derived without re-running inside renderArcRow.
  const junctionExonIndices = useMemo(() => {
    const ht = junctionTx;
    if (!ht?.exons?.length || !junctionCoords) return { leftExonIdx: -1, rightExonIdx: -1 };
    if (junctionCoords.eventType === "intron retention") return retainedIntronExons(ht.exons, junctionCoords.donorSite);
    const MAX_DIST = 2000;
    const lm = ht.exons.reduce((b, e, i) => { const d = Math.abs(e.end   - junctionCoords.donorSite);    return d < b.d ? { idx: i, d } : b; }, { idx: -1, d: Infinity });
    const rm = ht.exons.reduce((b, e, i) => { const d = Math.abs(e.start - junctionCoords.acceptorSite); return d < b.d ? { idx: i, d } : b; }, { idx: -1, d: Infinity });
    return {
      leftExonIdx:  lm.d <= MAX_DIST ? lm.idx : -1,
      rightExonIdx: rm.d <= MAX_DIST ? rm.idx : -1,
    };
  }, [junctionTx, junctionCoords]);

  // Genomic window covering the red region (flanking exons + padding) used for zoom mode.
  // Falls back to raw junction coordinates when exon boundary matching fails (non-annotated
  // junctions or when the highlighted transcript doesn't span the junction region).
  const zoomDomain = useMemo(() => {
    if (!coordDomain || !junctionCoords) return null;

    const { leftExonIdx, rightExonIdx } = junctionExonIndices;
    if (leftExonIdx >= 0 && rightExonIdx >= 0) {
      const ht = junctionTx;
      const leftExon  = ht?.exons?.[leftExonIdx];
      const rightExon = ht?.exons?.[rightExonIdx];
      if (leftExon && rightExon) {
        const pad = Math.max(500, (rightExon.end - leftExon.start) * 0.25);
        const min = Math.max(coordDomain.min, leftExon.start - pad);
        const max = Math.min(coordDomain.max, rightExon.end  + pad);
        if (max > min) return { min, max, span: max - min };
      }
    }

    // Fallback: derive zoom window directly from splice site coordinates.
    const lo  = Math.min(junctionCoords.donorSite, junctionCoords.acceptorSite);
    const hi  = Math.max(junctionCoords.donorSite, junctionCoords.acceptorSite);
    const pad = Math.max(500, (hi - lo) * 0.25);
    const min = Math.max(coordDomain.min, lo - pad);
    const max = Math.min(coordDomain.max, hi + pad);
    if (max <= min) return null;
    return { min, max, span: max - min };
  }, [junctionExonIndices, coordDomain, junctionTx, junctionCoords]);

  const [zoomed, setZoomed] = useState(false);

  // Reset zoom whenever the selected junction changes.
  const [prevJunctionCoords, setPrevJunctionCoords] = useState(junctionCoords);
  if (junctionCoords !== prevJunctionCoords) {
    setPrevJunctionCoords(junctionCoords);
    setZoomed(false);
  }

  const theme = useTheme();
  const canonicalColor = theme.palette.mode === "dark" ? "#ffffff" : "#000000";
  const containerRef = useRef(null);

  // Track width in px (the panel minus the row label), for placing fixed-size
  // chevrons over the tracks' stretched SVGs.
  const [trackPx, setTrackPx] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setTrackPx(Math.max(0, entry.contentRect.width - ROW_LABEL_PX)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [hoveredExon, setHoveredExon] = useState(null);

  const effStrand = apiStrand ?? strand ?? "+";
  const strandLabel = effStrand === "+" ? "+" : effStrand === "-" ? "−" : "?";

  const exonMouseMove = (e, t, exonIdx) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !t.exons?.[exonIdx]) return;
    const exon = t.exons[exonIdx];
    setHoveredDomain(null);
    setHoveredExon({
      transcriptLabel: `${t.displayName} (${t.id})`,
      exonNumber: effStrand === "-" ? t.exons.length - exonIdx : exonIdx + 1,
      chromStart: exon.start,
      chromEnd: exon.end,
      length: exon.end - exon.start,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };
  const highlightedTx = junctionTx && visible.includes(junctionTx) ? junctionTx : null;
  const otherTx = visible;

  // UniProt protein-domain lookup for the gene, used to draw a domain track
  // under the reference transcript (UniProt's canonical isoform).
  const [uniprotData, setUniprotData] = useState(null);
  const [hoveredDomain, setHoveredDomain] = useState(null);

  useEffect(() => {
    if (!geneName) { setUniprotData(null); return; }
    const controller = new AbortController();
    let active = true;
    setUniprotData(null);
    fetchUniProtDomains(geneName, { signal: controller.signal })
      .then(data => { if (active) setUniprotData(data); })
      .catch(err => {
        if (!active) return;
        if (err.name !== "AbortError") console.error("UniProt domain lookup failed", err);
        setUniprotData(null);
      });
    return () => { active = false; controller.abort(); };
  }, [geneName]);

  // UniProt's canonical isoform among this gene's Ensembl transcripts: a
  // transcript UniProt maps to the canonical isoform (by ENST or ENSP). Domain
  // coordinates refer to this isoform, so the domain track is drawn on it.
  // When several transcripts match, prefers one whose protein length matches
  // UniProt's, then Ensembl's canonical transcript. null when none match.
  const referenceTx = useMemo(() => {
    if (!uniprotData?.ensemblIds?.size) return null;
    const matches = txList.filter(t =>
      uniprotData.ensemblIds.has(stripVersion(t.id)) ||
      (t.translation?.id != null && uniprotData.ensemblIds.has(stripVersion(t.translation.id))));
    if (!matches.length) return null;
    const lengthOk = (t) => t.translation?.length == null || uniprotData.length == null || t.translation.length === uniprotData.length;
    return [...matches].sort((a, b) => (lengthOk(b) - lengthOk(a)) || (b.isCanonical - a.isCanonical))[0];
  }, [uniprotData, txList]);

  // AA-coordinate domains mapped onto the reference transcript's coding exons.
  const domainSegments = useMemo(() => {
    if (!uniprotData?.domains?.length || !referenceTx) return [];
    return mapDomainsToGenomicSegments(uniprotData.domains, referenceTx, effStrand);
  }, [uniprotData, referenceTx, effStrand]);

  // Whether the reference transcript's protein length matches UniProt's
  // canonical isoform (true when either length is unknown); null with no reference.
  const isoformVerified = useMemo(() => {
    if (!referenceTx) return null;
    const txLength = referenceTx.translation?.length;
    return txLength == null || uniprotData?.length == null || txLength === uniprotData.length;
  }, [uniprotData, referenceTx]);

  const domainMouseMove = (e, d) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoveredExon(null);
    setHoveredDomain({
      description: d.description,
      aaStart: d.aaStart,
      aaEnd: d.aaEnd,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const renderDomainRow = () => {
    if (!domainSegments.length) return null;
    const trackH = 14;
    const W = 1000;
    const domain = zoomed && zoomDomain ? zoomDomain : coordDomain;
    if (!domain) return null;

    // One solid rect per domain, spanning from the start of its first coding
    // segment to the end of its last — covering any introns in between — rather
    // than a separate rect per exon the domain touches. A domain is a contiguous
    // stretch of the protein, so this reads as a single cohesive block.
    const items = domainSegments
      .map((d, i) => {
        const gStart = Math.min(...d.segments.map(s => s.start));
        const gEnd   = Math.max(...d.segments.map(s => s.end));
        const l = ((gStart - domain.min) / domain.span) * W;
        const r = ((gEnd   - domain.min) / domain.span) * W;
        const left = l;
        const rects = [{ left, width: Math.max(2, r - l) }]
          .filter(rect => rect.left + rect.width > 0 && rect.left < W);
        return { ...d, colour: colourForDomainIndex(i), rects };
      })
      .filter(d => d.rects.length > 0);

    if (items.length === 0) return null;

    return (
      <Box sx={{ display: "flex", alignItems: "center", mt: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ fontSize: 11, color: "text.secondary", width: 200, flexShrink: 0, mr: 1 }}
          title={isoformVerified === false ? "This transcript's protein length differs from UniProt's canonical isoform — domain positions may not align exactly." : undefined}
        >
          Domains{isoformVerified === false ? " *" : ""}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <svg width="100%" height={trackH} viewBox={`0 0 ${W} ${trackH}`} preserveAspectRatio="none">
            {items.flatMap((d, di) =>
              d.rects.map((r, ri) => (
                <rect
                  key={`${di}-${ri}`}
                  x={r.left}
                  y={0}
                  width={r.width}
                  height={trackH}
                  rx={2}
                  ry={2}
                  fill={d.colour}
                  style={{ cursor: "pointer" }}
                  onMouseMove={(ev) => domainMouseMove(ev, d)}
                  onMouseLeave={() => setHoveredDomain(null)}
                />
              ))
            )}
          </svg>
        </Box>
      </Box>
    );
  };

  // roles: "reference" and/or "junction", shown as tags on the label. The
  // junction is only drawn on rows with the "junction" role.
  // Chevron positions (px from the track's left edge) for one row: the shared
  // columns that lie on the row's intron line and clear of all its exons.
  const chevronPositions = (exonsSvg, W) => {
    if (!trackPx || strandLabel === "?" || exonsSvg.length < 2) return [];
    const scale = trackPx / W;
    const ex = exonsSvg.map(e => ({ l: e.left * scale, r: (e.left + e.width) * scale }));
    const lo = Math.min(...ex.map(e => e.l));
    const hi = Math.max(...ex.map(e => e.r));
    const xs = [];
    for (let x = CHEVRON_STEP_PX / 2; x + CHEVRON_SIZE_PX <= trackPx; x += CHEVRON_STEP_PX) {
      if (x < lo || x + CHEVRON_SIZE_PX > hi) continue;
      if (ex.some(e => x + CHEVRON_SIZE_PX + CHEVRON_PAD_PX > e.l && x - CHEVRON_PAD_PX < e.r)) continue;
      xs.push(x);
    }
    return xs;
  };
  // ‹ on the minus strand, › on the plus strand.
  const renderChevrons = (xs, centerY, colour) => xs.map(x => (
    <Box key={x} component="svg" aria-hidden="true" viewBox="0 0 8 8"
      sx={{ position: "absolute", left: x, top: centerY - CHEVRON_SIZE_PX / 2, width: CHEVRON_SIZE_PX, height: CHEVRON_SIZE_PX, opacity: 0.6, pointerEvents: "none" }}>
      <path d={effStrand === "-" ? "M6 1L3 4l3 3" : "M2 1l3 3-3 3"} fill="none" stroke={colour}
        strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </Box>
  ));

  const renderArcRow = (t, roles = ["junction"]) => {
    const jc = roles.includes("junction") ? junctionCoords : null;
    const TRACK_H = 18;
    const W = 1000;
    // 2 px expressed in viewBox units, the minimum width of a kept-intron or
    // spliced-out mark so short ones stay visible at full-gene zoom.
    const minMarkW = trackPx ? (2 * W) / trackPx : 2;
    const hlColour = theme.palette.error.main;
    const domain = zoomed && zoomDomain ? zoomDomain : coordDomain;

    // Drawn in genomic order (coordinates increase left to right) on both
    // strands, matching junction_name and the Junction Expression gene model.
    const exonsSvg = domain && t.exons?.length
      ? t.exons.map((e) => {
          const l = ((e.start - domain.min) / domain.span) * W;
          const r = ((e.end   - domain.min) / domain.span) * W;
          const left = l;
          return { left, width: Math.max(2, r - l) };
        })
      : [];

    // Match junction donor/acceptor to nearest exon boundary (within 2000 bp)
    let leftExonIdx = -1;
    let rightExonIdx = -1;
    if (jc?.eventType === "intron retention" && t.exons?.length) {
      ({ leftExonIdx, rightExonIdx } = retainedIntronExons(t.exons, jc.donorSite));
    } else if (jc && t.exons?.length) {
      const MAX_DIST = 2000;
      const lm = t.exons.reduce((b, e, i) => { const d = Math.abs(e.end   - jc.donorSite);    return d < b.d ? { idx: i, d } : b; }, { idx: -1, d: Infinity });
      const rm = t.exons.reduce((b, e, i) => { const d = Math.abs(e.start - jc.acceptorSite); return d < b.d ? { idx: i, d } : b; }, { idx: -1, d: Infinity });
      leftExonIdx  = lm.d <= MAX_DIST ? lm.idx : -1;
      rightExonIdx = rm.d <= MAX_DIST ? rm.idx : -1;
    }
    const hasJunction = leftExonIdx >= 0 && rightExonIdx >= 0;
    const isIR = jc?.eventType === "intron retention";
    const isSE = jc?.eventType === "exon skipping";

    // Coordinate-based junction positions derived directly from the junction string —
    // used as a fallback when exon boundary matching fails (non-annotated junctions).
    let junctionX1 = null, junctionX2 = null;
    if (jc && domain) {
      const rawDonor    = ((jc.donorSite    - domain.min) / domain.span) * W;
      const rawAcceptor = ((jc.acceptorSite - domain.min) / domain.span) * W;
      junctionX1 = rawDonor;
      junctionX2 = rawAcceptor;
    }
    const hasCoordJunction = junctionX1 !== null && Math.abs(junctionX2 - junctionX1) >= 2;

    // Give SE events a taller arc area so the skipping arc has room to tower
    // above the regular adjacent arcs.
    const ARC_H = isSE && (hasJunction || hasCoordJunction) ? 50 : 30;
    const svgH = ARC_H + TRACK_H;

    // Retained-intron highlight rectangle — spans the full canonical intron
    // (leftExon.end → rightExon.start) so the entire retained intron is coloured,
    // not just the junction-read anchor region reported in the junction string.
    let irX = 0, irW = 0;
    if (isIR && hasJunction && domain) {
      const canonEnd   = t.exons[leftExonIdx]?.end;
      const canonStart = t.exons[rightExonIdx]?.start;
      if (canonEnd != null && canonStart != null) {
        const r1 = ((canonEnd   - domain.min) / domain.span) * W;
        const r2 = ((canonStart - domain.min) / domain.span) * W;
        irX = r1;
        irW = Math.max(2, r2 - r1);
      }
    }

    const intronicRects = [];
    if (hasJunction && !isIR && domain) {
      const canonEnd   = t.exons[leftExonIdx]?.end;
      const canonStart = t.exons[rightExonIdx]?.start;
      if (canonEnd != null && jc.donorSite > canonEnd + 5) {
        const r1 = ((canonEnd - domain.min) / domain.span) * W;
        const r2 = ((jc.donorSite - domain.min) / domain.span) * W;
        intronicRects.push({ x: r1, width: Math.max(minMarkW, r2 - r1) });
      }
      if (canonStart != null && jc.acceptorSite < canonStart - 5) {
        const r1 = ((jc.acceptorSite - domain.min) / domain.span) * W;
        const r2 = ((canonStart - domain.min) / domain.span) * W;
        intronicRects.push({ x: r1, width: Math.max(minMarkW, r2 - r1) });
      }
    }

    // Exonic material the junction splices out: a site more than 5 bp inside a
    // flanking exon (exon shortened). Hatched over the exon, from the site to the
    // annotated edge; at least 2 px wide, growing from the exon edge into the exon.
    const shortenedMarks = [];
    if (hasJunction && !isIR && rightExonIdx > leftExonIdx && domain && trackPx) {
      const scale = trackPx / W;
      const toPx = (pos) => ((pos - domain.min) / domain.span) * W * scale;
      const canonEnd   = t.exons[leftExonIdx]?.end;
      const canonStart = t.exons[rightExonIdx]?.start;
      if (canonEnd != null && jc.donorSite < canonEnd - 5 && jc.donorSite >= t.exons[leftExonIdx].start) {
        const edge = toPx(canonEnd), w = Math.max(2, edge - toPx(jc.donorSite));
        shortenedMarks.push({ left: edge - w, width: w });
      }
      if (canonStart != null && jc.acceptorSite > canonStart + 5 && jc.acceptorSite <= t.exons[rightExonIdx].end) {
        const edge = toPx(canonStart), w = Math.max(2, toPx(jc.acceptorSite) - edge);
        shortenedMarks.push({ left: edge, width: w });
      }
    }

    const displayColor = t.isCanonical ? canonicalColor : t.colour;
    const isReference = roles.includes("reference");
    const aaLength = isReference ? (t.translation?.length ?? uniprotData?.length) : t.translation?.length;
    const subtitle = [isReference ? "UniProt canonical" : t.biotype, aaLength ? `${aaLength.toLocaleString()} aa` : null]
      .filter(Boolean)
      .join(" · ");
    return (
      <Box key={t.id} sx={{ display: "flex", alignItems: "center" }}>
        <Box sx={{ width: 200, flexShrink: 0, mr: 1 }}>
          <Stack direction="row" spacing={0.5}>
            {roles.map(role => (
              <Box key={role} component="span" sx={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", lineHeight: 1.5, color: "common.white", bgcolor: role === "reference" ? REFERENCE_TAG_COLOR : "error.main", borderRadius: 0.5, px: 0.625 }}>
                {role === "reference" ? "REFERENCE" : "JUNCTION"}
              </Box>
            ))}
          </Stack>
          <Typography variant="caption" sx={{ display: "block", fontSize: 12, lineHeight: 1.3, mt: 0.25, color: displayColor, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }} title={`${t.displayName} (${t.id})`}>
            {t.displayName} ({t.id})
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 11, lineHeight: 1.3 }}>
            {subtitle}
          </Typography>
        </Box>
        {exonsSvg.length > 0 ? (
          <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
            <svg width="100%" height={svgH} viewBox={`0 0 ${W} ${svgH}`} preserveAspectRatio="none">

              {/* Intron backbone line — drawn first so everything renders on top */}
              {exonsSvg.length >= 2 && (() => {
                const minLeft = Math.min(...exonsSvg.map(e => e.left));
                const maxRight = Math.max(...exonsSvg.map(e => e.left + e.width));
                return (
                  <line
                    x1={minLeft} y1={ARC_H + TRACK_H / 2}
                    x2={maxRight} y2={ARC_H + TRACK_H / 2}
                    stroke={displayColor} strokeWidth={2} strokeOpacity={0.4}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })()}

              {/* Retained intron / intronic material — drawn before exon rects */}
              {isIR && hasJunction && (
                <rect x={irX} y={ARC_H} width={irW} height={TRACK_H} fill={hlColour} opacity={0.3} />
              )}
              {intronicRects.map((r, i) => (
                <rect key={`intron-${i}`} x={r.x} y={ARC_H} width={r.width} height={TRACK_H} fill={hlColour} opacity={0.3} />
              ))}

              {/* Junction arcs (skipped for intron retention) — all visible, junction-of-interest in red. */}
              {!isIR && exonsSvg.slice(0, -1).map((e, i) => {
                const next = exonsSvg[i + 1];
                // For SE the skipping arc is drawn separately below; adjacent arcs use normal colour.
                // The junction's own arc runs between its real splice sites.
                const isJunctionArc = hasJunction && !isSE && i === leftExonIdx && i + 1 === rightExonIdx;
                const x1 = isJunctionArc ? junctionX1 : e.left + e.width;
                const x2 = isJunctionArc ? junctionX2 : next.left;
                if (Math.abs(x2 - x1) < 2) return null;
                const midX = (x1 + x2) / 2;
                const peakY = isJunctionArc ? ARC_H * 0.2 : ARC_H * 0.6;
                const d = `M ${x1},${ARC_H} Q ${midX},${peakY} ${x2},${ARC_H}`;
                return (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={isJunctionArc ? hlColour : displayColor}
                    strokeWidth={isJunctionArc ? 4 : 2}
                    strokeOpacity={1}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {/* Exon-skipping arc — endpoints, peaks near the top of the taller arc area */}
              {isSE && hasJunction && exonsSvg[leftExonIdx] && exonsSvg[rightExonIdx] && (() => {
                const x1 = junctionX1;
                const x2 = junctionX2;
                if (Math.abs(x2 - x1) < 2) return null;
                const midX = (x1 + x2) / 2;
                const d = `M ${x1},${ARC_H} Q ${midX},${ARC_H * 0.1} ${x2},${ARC_H}`;
                return (
                  <path d={d} fill="none" stroke={hlColour} strokeWidth={4}
                    strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                );
              })()}

              {/* Fallback junction arc — coordinate-based, drawn when exon boundary matching
                  fails (non-annotated junctions). Renders in red between the raw splice sites. */}
              {!isIR && !hasJunction && hasCoordJunction && (() => {
                const midX = (junctionX1 + junctionX2) / 2;
                const peakY = isSE ? ARC_H * 0.1 : ARC_H * 0.2;
                const d = `M ${junctionX1},${ARC_H} Q ${midX},${peakY} ${junctionX2},${ARC_H}`;
                return (
                  <path d={d} fill="none" stroke={hlColour} strokeWidth={4}
                    strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                );
              })()}

              {/* Exon rects — junction exons red (not for IR/SE); skipped exons red for SE */}
              {exonsSvg.map((e, i) => {
                const isJunctionExon = hasJunction && !isIR && !isSE && (i === leftExonIdx || i === rightExonIdx);
                const isSkippedExon  = isSE && hasJunction && i > leftExonIdx && i < rightExonIdx;
                return (
                  <rect
                    key={i}
                    x={e.left}
                    y={ARC_H}
                    width={e.width}
                    height={TRACK_H}
                    fill={(isJunctionExon || isSkippedExon) ? hlColour : displayColor}
                    opacity={1}
                    style={{ cursor: "pointer" }}
                    onMouseMove={(ev) => exonMouseMove(ev, t, i)}
                    onMouseLeave={() => setHoveredExon(null)}
                  />
                );
              })}
            </svg>
            {renderChevrons(chevronPositions(exonsSvg, W), ARC_H + TRACK_H / 2, displayColor)}
            {/* Spliced-out part of a shortened exon — white stripes over the exon */}
            {shortenedMarks.map((m, i) => (
              <Box key={`short-${i}`} aria-hidden="true"
                sx={{ position: "absolute", left: m.left, width: m.width, top: ARC_H, height: TRACK_H, pointerEvents: "none",
                  background: `repeating-linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.85)} 0 3px, transparent 3px 6px)` }} />
            ))}
          </Box>
        ) : (
          <Box sx={{ display: "inline-block", ml: 1, px: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 0.5, fontSize: 11, lineHeight: 1.4, color: "text.secondary", bgcolor: "background.paper" }}>
            NA
          </Box>
        )}
      </Box>
    );
  };

  const renderCssRow = (t) => {
    const trackH = 14;
    const W = 1000;
    const domain = zoomed && zoomDomain ? zoomDomain : coordDomain;

    const displayColor = t.isCanonical ? canonicalColor : t.colour;
    const exonsSvg = domain && t.exons?.length
      ? t.exons.map(e => {
          const l = ((e.start - domain.min) / domain.span) * W;
          const r = ((e.end   - domain.min) / domain.span) * W;
          const left = l;
          return { left, width: Math.max(2, r - l) };
        })
      : [];

    return (
      <Box key={t.id} sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontSize: 12, lineHeight: 1.2, color: displayColor, width: 200, flexShrink: 0, mr: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={`${t.displayName} (${t.id})`}>
          {t.displayName} ({t.id})
        </Typography>
        {exonsSvg.length > 0 ? (
          <Box sx={{ flex: 1, minWidth: 0, position: "relative" }}>
            <svg width="100%" height={trackH} viewBox={`0 0 ${W} ${trackH}`} preserveAspectRatio="none">
              {exonsSvg.length >= 2 && (() => {
                const minLeft = Math.min(...exonsSvg.map(e => e.left));
                const maxRight = Math.max(...exonsSvg.map(e => e.left + e.width));
                return (
                  <line
                    x1={minLeft} y1={trackH / 2}
                    x2={maxRight} y2={trackH / 2}
                    stroke={displayColor} strokeWidth={2} strokeOpacity={0.4}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })()}
              {exonsSvg.map((e, idx) => (
                <rect
                  key={idx}
                  x={e.left} y={1}
                  width={e.width}
                  height={trackH - 2}
                  fill={hexToRgba(displayColor, 0.9)}
                  style={{ cursor: "pointer" }}
                  onMouseMove={(ev) => exonMouseMove(ev, t, idx)}
                  onMouseLeave={() => setHoveredExon(null)}
                />
              ))}
            </svg>
            {/* The inline svg sits ~3px below the Box top (text baseline); offset to match. */}
            {renderChevrons(chevronPositions(exonsSvg, W), trackH / 2 + 3, displayColor)}
          </Box>
        ) : (
          <Box sx={{ display: "inline-block", ml: 1, px: 0.5, border: "1px solid", borderColor: "divider", borderRadius: 0.5, fontSize: 11, lineHeight: 1.4, color: "text.secondary", bgcolor: "background.paper" }}>
            NA
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box ref={containerRef} sx={{ mt: 2, position: "relative" }}>

      {/* Junction info header — zoom button floats right inline with the title */}
      {(junctionName || junctionCoords?.eventType) && (
        <Stack direction="row" alignItems="flex-start" sx={{ mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ flexWrap: "wrap" }}>
              {junctionName && (
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {junctionName}
                </Typography>
              )}
              {junctionCoords?.eventType && (
                <Typography variant="body2" color="text.secondary">
                  {junctionCoords.eventType}
                </Typography>
              )}
              {strandLabel !== "?" && (
                <Tooltip arrow title={effStrand === "-"
                  ? "Minus strand: transcribed right to left in this view, so exon 1 is on the right."
                  : "Plus strand: transcribed left to right, so exon 1 is on the left."}>
                  <Chip size="small" label={`strand: ${strandLabel}`}
                    sx={{ alignSelf: "center", fontWeight: 500, bgcolor: hexToRgba(theme.palette.primary.main, 0.12), color: theme.palette.mode === "dark" ? "primary.light" : "primary.dark", cursor: "help" }} />
                </Tooltip>
              )}
            </Stack>
            {junctionString && (
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace", display: "block", mt: 0.25 }}>
                {junctionString}
              </Typography>
            )}
          </Box>
          {!loading && zoomDomain && (
            <Button size="small" variant="outlined" onClick={() => setZoomed(z => !z)} sx={{ ml: 2, flexShrink: 0, alignSelf: "center" }}>
              {zoomed ? "View full transcript" : "Zoom to area of interest"}
            </Button>
          )}
        </Stack>
      )}

      {/* Transcript of interest */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (referenceTx || highlightedTx) ? (
        <Box sx={{ mb: 1.5 }}>
          {referenceTx && renderArcRow(referenceTx, referenceTx.id === highlightedTx?.id ? ["reference", "junction"] : ["reference"])}
          {referenceTx && renderDomainRow()}
          {highlightedTx && highlightedTx.id !== referenceTx?.id && (
            <Box sx={{ mt: referenceTx ? 1.5 : 0 }}>{renderArcRow(highlightedTx, ["junction"])}</Box>
          )}
        </Box>
      ) : null}

      <Divider sx={{ mb: 1.5 }} />

      {!loading && fetchError && (
        <Alert severity="warning" sx={{ mb: 1.5 }}>
          Transcripts are temporarily unavailable — Ensembl's API isn't responding ({fetchError}).
        </Alert>
      )}

      {/* Transcript section — header always visible; rows appear once data loads */}
      {(geneID || geneName) && (
        <>
          <Box sx={{ mb: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {geneName ? <><em>{geneName}</em> Transcripts</> : "Transcripts"}
            </Typography>
            {geneID && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                {geneID}{!(junctionName || junctionCoords?.eventType) && ` (strand: ${strandLabel})`}
              </Typography>
            )}
            {(legendItems.length > 0 || txList.some(t => t.isCanonical)) && (
              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center", mt: 0.75 }}>
                {txList.some(t => t.isCanonical) && (
                  <Chip
                    label="canonical"
                    size="small"
                    onClick={() => setCanonicalOnly(c => !c)}
                    sx={{
                      bgcolor: canonicalOnly ? canonicalColor : hexToRgba(canonicalColor, 0.15),
                      color: canonicalOnly
                        ? (theme.palette.mode === "dark" ? "common.black" : "common.white")
                        : "text.primary",
                      fontWeight: canonicalOnly ? 700 : 400,
                      border: "1px solid",
                      borderColor: canonicalOnly ? "transparent" : "divider",
                      cursor: "pointer",
                    }}
                  />
                )}
                {legendItems.map(([bio, colour]) => {
                  const selected = activeBiotypes.has(bio);
                  const bg = selected ? colour : hexToRgba(colour, 0.5);
                  return (
                    <Chip key={bio} label={bio} size="small" onClick={() => toggleBio(bio)} sx={{ bgcolor: bg, color: "common.white", fontWeight: selected ? 700 : 400, border: "1px solid", borderColor: selected ? "transparent" : "divider", cursor: "pointer" }} />
                  );
                })}
              </Stack>
            )}
          </Box>
          {!loading && (
            <Stack direction="column" spacing={0.25}>
              {otherTx.map(renderCssRow)}
            </Stack>
          )}
        </>
      )}

      {hoveredExon && (
        <Box
          sx={{
            position: "absolute",
            left: hoveredExon.x,
            top: hoveredExon.y,
            transform: "translate(12px, -12px)",
            pointerEvents: "none",
            bgcolor: "background.paper",
            color: "text.primary",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            px: 1,
            py: 0.5,
            fontSize: 12,
            boxShadow: 2,
            whiteSpace: "nowrap",
            zIndex: 1,
          }}
        >
          {hoveredExon.transcriptLabel}<br />
          <b>Exon {hoveredExon.exonNumber}</b><br />
          start: {hoveredExon.chromStart.toLocaleString()}<br />
          end: {hoveredExon.chromEnd.toLocaleString()}<br />
          length: {hoveredExon.length.toLocaleString()} bp
        </Box>
      )}

      {hoveredDomain && (
        <Box
          sx={{
            position: "absolute",
            left: hoveredDomain.x,
            top: hoveredDomain.y,
            transform: "translate(12px, -12px)",
            pointerEvents: "none",
            bgcolor: "background.paper",
            color: "text.primary",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 1,
            px: 1,
            py: 0.5,
            fontSize: 12,
            boxShadow: 2,
            whiteSpace: "nowrap",
            zIndex: 1,
          }}
        >
          <b>{hoveredDomain.description}</b><br />
          aa {hoveredDomain.aaStart.toLocaleString()}–{hoveredDomain.aaEnd.toLocaleString()}
        </Box>
      )}
    </Box>
  );
}
