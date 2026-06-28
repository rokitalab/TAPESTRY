import { useEffect, useMemo, useRef, useState } from "react";
import { Box, CircularProgress, Divider, Typography, Stack, Chip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { colourForBiotype, hexToRgba } from "./lib/biotypeColors";

export default function TranscriptVis({ geneID, geneName = null, strand = "+", highlightedTranscript = null, junctionCoords = null }) {
  const [txList, setTxList] = useState([]);
  const [loading, setLoading] = useState(false);
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
          // Extract exon coordinates and normalize to { start, end }
          let rawExons = [];
          for (const c of candidates) {
            if (Array.isArray(c)) { rawExons = c; break; }
            if (c && typeof c === 'object') { rawExons = Object.values(c); break; }
          }
          const exons = (rawExons || [])
            .map(e => {
              const s = Number(e?.start ?? e?.seq_region_start ?? e?.begin ?? e?.location_start);
              const en = Number(e?.end ?? e?.seq_region_end ?? e?.finish ?? e?.location_end);
              if (!Number.isFinite(s) || !Number.isFinite(en)) return null;
              return { start: Math.min(s, en), end: Math.max(s, en) };
            })
            .filter(Boolean)
            .sort((a, b) => a.start - b.start);
          if (exonCount == null) exonCount = exons.length > 0 ? exons.length : null;
          return { id, displayName, biotype, isCanonical, colour, exonCount, exons };
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
            return { id, exons };
          })
          .catch(() => ({ id, exons: [] }))
      )
    )
      .then(results => {
        const byId = new Map();
        results.forEach((r, i) => {
          if (r.status === "fulfilled" && r.value) {
            byId.set(r.value.id, r.value.exons || []);
          } else {
            byId.set(missing[i], []);
          }
        });
        setTxList(prev => prev.map(t => {
          if (Array.isArray(t.exons) && t.exons.length > 0) return t;
          const xs = byId.get(t.id);
          if (!xs) return t;
          const exonCount = t.exonCount != null ? t.exonCount : (xs.length > 0 ? xs.length : null);
          return { ...t, exons: xs, exonCount };
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
    const base = (activeBiotypes.size === 0) ? txList : txList.filter(t => activeBiotypes.has(t.biotype));
    const filtered = canonicalOnly ? base.filter(t => t.isCanonical) : base;
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

  const theme = useTheme();
  const containerRef = useRef(null);
  const [hoveredExon, setHoveredExon] = useState(null);

  const effStrand = apiStrand ?? strand ?? "+";
  const strandLabel = effStrand === "+" ? "+" : effStrand === "-" ? "−" : "?";

  const exonMouseMove = (e, t, exonIdx) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !t.exons?.[exonIdx]) return;
    const exon = t.exons[exonIdx];
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
  const highlightedTx = highlightedTranscript
    ? visible.find((t) => t.displayName === highlightedTranscript) ?? null
    : null;
  const otherTx = visible;

  const renderArcRow = (t) => {
    const ARC_H = 30;
    const TRACK_H = 18;
    const W = 1000;
    const svgH = ARC_H + TRACK_H;
    const hlColour = theme.palette.error.main;

    const exonsSvg = coordDomain && t.exons?.length
      ? t.exons.map((e) => {
          const l = ((e.start - coordDomain.min) / coordDomain.span) * W;
          const r = ((e.end - coordDomain.min) / coordDomain.span) * W;
          const left = effStrand === "-" ? W - r : l;
          return { left, width: Math.max(2, r - l) };
        })
      : [];

    // Match junction donor/acceptor to nearest exon boundary (within 2000 bp)
    let leftExonIdx = -1;
    let rightExonIdx = -1;
    if (junctionCoords && t.exons?.length) {
      const MAX_DIST = 2000;
      const lm = t.exons.reduce((b, e, i) => { const d = Math.abs(e.end   - junctionCoords.donorSite);    return d < b.d ? { idx: i, d } : b; }, { idx: -1, d: Infinity });
      const rm = t.exons.reduce((b, e, i) => { const d = Math.abs(e.start - junctionCoords.acceptorSite); return d < b.d ? { idx: i, d } : b; }, { idx: -1, d: Infinity });
      leftExonIdx  = lm.d <= MAX_DIST ? lm.idx : -1;
      rightExonIdx = rm.d <= MAX_DIST ? rm.idx : -1;
    }
    const hasJunction = leftExonIdx >= 0 && rightExonIdx >= 0;
    const isIR = junctionCoords?.eventType === "intron retention";

    // Retained-intron highlight rectangle (SVG coords)
    let irX = 0, irW = 0;
    if (isIR && hasJunction && coordDomain) {
      const donorRaw    = ((junctionCoords.donorSite    - coordDomain.min) / coordDomain.span) * W;
      const acceptorRaw = ((junctionCoords.acceptorSite - coordDomain.min) / coordDomain.span) * W;
      irX = effStrand === "-" ? W - acceptorRaw : donorRaw;
      irW = Math.max(2, acceptorRaw - donorRaw);
    }

    // Intronic-material rectangles for alternative splice sites:
    // if the junction coordinate overshoots the canonical exon boundary into the intron,
    // highlight that overshoot region.
    const intronicRects = [];
    if (hasJunction && !isIR && coordDomain) {
      const canonEnd   = t.exons[leftExonIdx]?.end;
      const canonStart = t.exons[rightExonIdx]?.start;
      // Donor side extends into intron (donorSite past canonical exon end)
      if (canonEnd != null && junctionCoords.donorSite > canonEnd + 5) {
        const r1 = ((canonEnd - coordDomain.min) / coordDomain.span) * W;
        const r2 = ((junctionCoords.donorSite - coordDomain.min) / coordDomain.span) * W;
        intronicRects.push({ x: effStrand === "-" ? W - r2 : r1, width: Math.max(2, r2 - r1) });
      }
      // Acceptor side extends into intron (acceptorSite before canonical exon start)
      if (canonStart != null && junctionCoords.acceptorSite < canonStart - 5) {
        const r1 = ((junctionCoords.acceptorSite - coordDomain.min) / coordDomain.span) * W;
        const r2 = ((canonStart - coordDomain.min) / coordDomain.span) * W;
        intronicRects.push({ x: effStrand === "-" ? W - r2 : r1, width: Math.max(2, r2 - r1) });
      }
    }

    return (
      <Box key={t.id} sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontSize: 12, color: t.colour, fontWeight: 700, minWidth: 200, mr: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={`${t.displayName} (${t.id})`}>
          {t.displayName} ({t.id})
        </Typography>
        {exonsSvg.length > 0 ? (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <svg width="100%" height={svgH} viewBox={`0 0 ${W} ${svgH}`} preserveAspectRatio="none">

              {/* Intron backbone line — drawn first so everything renders on top */}
              {exonsSvg.length >= 2 && (() => {
                const minLeft = Math.min(...exonsSvg.map(e => e.left));
                const maxRight = Math.max(...exonsSvg.map(e => e.left + e.width));
                return (
                  <line
                    x1={minLeft} y1={ARC_H + TRACK_H / 2}
                    x2={maxRight} y2={ARC_H + TRACK_H / 2}
                    stroke={t.colour} strokeWidth={2} strokeOpacity={0.4}
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

              {/* Junction arcs (skipped for intron retention) — all visible, junction-of-interest in red */}
              {!isIR && exonsSvg.slice(0, -1).map((e, i) => {
                const next = exonsSvg[i + 1];
                const x1 = e.left + e.width;
                const x2 = next.left;
                if (Math.abs(x2 - x1) < 2) return null;
                const isJunctionArc = hasJunction && i === leftExonIdx && i + 1 === rightExonIdx;
                const midX = (x1 + x2) / 2;
                const d = `M ${x1},${ARC_H} Q ${midX},${ARC_H * 0.08} ${x2},${ARC_H}`;
                return (
                  <path
                    key={i}
                    d={d}
                    fill="none"
                    stroke={isJunctionArc ? hlColour : t.colour}
                    strokeWidth={isJunctionArc ? 4 : 2}
                    strokeOpacity={1}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {/* Exon rects — full opacity; junction exons in red */}
              {exonsSvg.map((e, i) => {
                const isJunctionExon = hasJunction && (i === leftExonIdx || i === rightExonIdx);
                return (
                  <rect
                    key={i}
                    x={e.left}
                    y={ARC_H}
                    width={e.width}
                    height={TRACK_H}
                    rx={4}
                    ry={4}
                    fill={isJunctionExon ? hlColour : t.colour}
                    opacity={1}
                    style={{ cursor: "pointer" }}
                    onMouseMove={(ev) => exonMouseMove(ev, t, i)}
                    onMouseLeave={() => setHoveredExon(null)}
                  />
                );
              })}
            </svg>
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
    const trackH = 20;
    return (
      <Box key={t.id} sx={{ display: "flex", alignItems: "center" }}>
        <Typography variant="caption" sx={{ fontSize: 12, color: t.colour, minWidth: 200, mr: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={`${t.displayName} (${t.id})`}>
          {t.displayName} ({t.id})
        </Typography>
        {coordDomain && t.exons?.length > 0 ? (
          <Box sx={{ position: "relative", flex: 1, minWidth: 0, height: trackH, bgcolor: "background.default" }}>
            {t.exons.slice(0, -1).map((e, idx) => {
              const next = t.exons[idx + 1];
              if (!next) return null;
              const intronStart = Math.max(e.end, coordDomain.min);
              const intronEnd = Math.min(next.start, coordDomain.max);
              if (!Number.isFinite(intronStart) || !Number.isFinite(intronEnd) || intronEnd <= intronStart) return null;
              const l = Math.max(0, ((intronStart - coordDomain.min) / coordDomain.span) * 100);
              const r = Math.min(100, ((intronEnd - coordDomain.min) / coordDomain.span) * 100);
              const leftPct = effStrand === "-" ? Math.max(0, 100 - r) : l;
              return (
                <Box key={`intron-${idx}`} sx={{ position: "absolute", left: `${leftPct}%`, top: `${Math.round(trackH / 2)}px`, width: `${Math.max(0, r - l)}%`, height: "1px", bgcolor: "text.disabled" }} />
              );
            })}
            {t.exons.map((e, idx) => {
              const l = Math.max(0, ((e.start - coordDomain.min) / coordDomain.span) * 100);
              const r = Math.min(100, ((e.end - coordDomain.min) / coordDomain.span) * 100);
              const leftPct = effStrand === "-" ? Math.max(0, 100 - r) : l;
              return (
                <Box key={`exon-${idx}`} onMouseMove={(ev) => exonMouseMove(ev, t, idx)} onMouseLeave={() => setHoveredExon(null)} sx={{ position: "absolute", left: `${leftPct}%`, top: "1px", width: `${Math.max(0.2, r - l)}%`, height: trackH - 2, bgcolor: hexToRgba(t.colour, 0.9), border: "1px solid", borderColor: "divider", borderRadius: 0.5, cursor: "pointer" }} />
              );
            })}
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
      <Box sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Typography sx={{ fontWeight: 700 }}>
            {geneName ? <><em>{geneName}</em> Transcripts</> : "Transcripts"}
          </Typography>
          {!loading && legendItems.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", alignItems: "center" }}>
              {legendItems.map(([bio, colour]) => {
                const selected = activeBiotypes.has(bio);
                const bg = selected ? colour : hexToRgba(colour, 0.5);
                return (
                  <Chip key={bio} label={bio} size="small" onClick={() => toggleBio(bio)} sx={{ bgcolor: bg, color: "common.white", fontWeight: selected ? 700 : 400, border: "1px solid", borderColor: selected ? "transparent" : "divider", cursor: "pointer" }} />
                );
              })}
            </Stack>
          )}
        </Stack>
        {geneID && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            {geneID} (strand: {strandLabel})
          </Typography>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : txList.length > 0 ? (
        <Stack direction="column" spacing={0.5}>
          {highlightedTx && renderArcRow(highlightedTx)}
          {highlightedTx && otherTx.length > 0 && <Divider sx={{ my: 0.5 }} />}
          {otherTx.map(renderCssRow)}
        </Stack>
      ) : null}

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
    </Box>
  );
}
