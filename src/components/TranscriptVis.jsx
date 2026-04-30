import { useEffect, useMemo, useState } from "react";
import { Box, Typography, Stack, Chip } from "@mui/material";

const BIO_COLOURS = {
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

function colourForBiotype(bt) {
  const key = String(bt || "other").toLowerCase();
  // Normalize common variants
  if (key == "protein_coding") return BIO_COLOURS.protein_coding;
  if (key.includes("lncrna")) return BIO_COLOURS.lncRNA;
  if (key.includes("mirna")) return BIO_COLOURS.miRNA;
  if (key.includes("snrna")) return BIO_COLOURS.snRNA;
  if (key.includes("snorna")) return BIO_COLOURS.snoRNA;
  if (key.includes("processed_transcript")) return BIO_COLOURS.processed_transcript;
  if (key.includes("retained_intron")) return BIO_COLOURS.retained_intron;
  if (key.includes("nonsense") || key.includes("decay")) return BIO_COLOURS.nonsense_mediated_decay;
  if (key.includes("pseudogene")) return BIO_COLOURS.pseudogene;
  return BIO_COLOURS.other;
}

function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex; // fallback
  const r = parseInt(h.slice(0,2), 16);
  const g = parseInt(h.slice(2,4), 16);
  const b = parseInt(h.slice(4,6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function TranscriptVis({ geneID, strand = "+" }) {
  const [txList, setTxList] = useState([]);
  const [activeBiotypes, setActiveBiotypes] = useState(new Set());
  const [canonicalOnly, setCanonicalOnly] = useState(false);
  const [apiStrand, setApiStrand] = useState(null);

  useEffect(() => {
    if (!geneID) { setTxList([]); return; }
    const controller = new AbortController();
    const url = `https://rest.ensembl.org/lookup/id/${encodeURIComponent(geneID)}?content-type=application/json;expand=1`;
    fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        console.log("[TranscriptVis Ensembl lookup]", data);
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
          console.log('[TranscriptVis] exon debug', {
            id,
            counts: { exonCount, inferredFromCoords: exons.length },
          });
          return { id, biotype, isCanonical, colour, exonCount, exons };
        }).filter(Boolean);
        setTxList(items);
        // Ensure all biotypes are selected immediately upon data load
        const allBiotypes = new Set(items.map(it => it.biotype));
        setActiveBiotypes(allBiotypes);
      })
      .catch(err => {
        if (err.name !== "AbortError") {
          console.error("TranscriptVis Ensembl lookup failed", err);
        }
        setTxList([]);
      });
    return () => controller.abort();
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
 
  // Initialize selection to include all available biotypes when data changes
  useEffect(() => {
    if (legendItems.length === 0) { setActiveBiotypes(new Set()); setCanonicalOnly(false); return; }
    // If current active set doesn't match available biotypes, reset to all
    const available = new Set(legendItems.map(([bio]) => bio));
    let differs = false;
    if (activeBiotypes.size !== available.size) {
      differs = true;
    } else {
      for (const b of available) { if (!activeBiotypes.has(b)) { differs = true; break; } }
    }
    if (differs) { setActiveBiotypes(available); setCanonicalOnly(false); }
  }, [legendItems]);


  const toggleBio = (bio) => {
    setActiveBiotypes((prev) => {
      const next = new Set(prev);
      if (next.has(bio)) next.delete(bio); else next.add(bio);
      return next;
    });
  };

  const visible = useMemo(() => {
    // Base filtering by selected biotypes (or all if selection empty)
    const base = (activeBiotypes.size === 0) ? txList : txList.filter(t => activeBiotypes.has(t.biotype));
    // Further restrict to canonical only if toggled
    return canonicalOnly ? base.filter(t => t.isCanonical) : base;
  }, [txList, activeBiotypes, canonicalOnly]);

  // After all hooks are declared, safely early-return when no data
  if (!txList.length) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Transcripts</Typography>
        {legendItems.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            {legendItems.map(([bio, colour]) => {
              const selected = activeBiotypes.has(bio);
              const bg = selected ? colour : hexToRgba(colour, 0.5);
              return (
                <Chip
                  key={bio}
                  label={bio}
                  size="small"
                  onClick={() => toggleBio(bio)}
                  sx={{
                    bgcolor: bg,
                    color: 'common.white',
                    fontWeight: selected ? 700 : 400,
                    border: '1px solid',
                    borderColor: selected ? 'transparent' : 'divider',
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          </Stack>
        )}
      </Stack>

      <Stack direction="column" spacing={0.5}>
        {visible.map((t) => {
          const trackH = 20;
          const fill = t.colour;
          const effStrand = apiStrand ?? strand ?? "+";
          return (
            <Box key={t.id} sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ fontSize: 12, color: t.colour, minWidth: 140, mr: 1, overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.id}>
                {t.id}
              </Typography>
              {coordDomain && (t.exons && t.exons.length > 0) ? (
                <Box
                  sx={{
                    position: 'relative',
                    flex: 1,
                    minWidth: 0,
                    height: trackH,
                    bgcolor: 'background.default',
                  }}
                >
                  {/* Intronic segments: thin line centered between exon boxes */}
                  {(t.exons || []).slice(0, -1).map((e, idx) => {
                    const next = (t.exons || [])[idx + 1];
                    if (!next) return null;
                    const intronStart = Math.max(e.end, coordDomain.min);
                    const intronEnd = Math.min(next.start, coordDomain.max);
                    if (!Number.isFinite(intronStart) || !Number.isFinite(intronEnd) || intronEnd <= intronStart) return null;
                    const l = Math.max(0, ((intronStart - coordDomain.min) / coordDomain.span) * 100);
                    const r = Math.min(100, ((intronEnd - coordDomain.min) / coordDomain.span) * 100);
                    const leftPct = effStrand === '-' ? Math.max(0, 100 - r) : l;
                    const widthPct = Math.max(0, r - l);
                    return (
                      <Box
                        key={`intron-${idx}`}
                        sx={{
                          position: 'absolute',
                          left: `${leftPct}%`,
                          top: `${Math.round(trackH / 2)}px`,
                          width: `${widthPct}%`,
                          height: '1px',
                          bgcolor: 'text.disabled',
                        }}
                      />
                    );
                  })}

                  {/* Exon rectangles */}
                  {(t.exons || []).map((e, idx) => {
                    const l = Math.max(0, ((e.start - coordDomain.min) / coordDomain.span) * 100);
                    const r = Math.min(100, ((e.end - coordDomain.min) / coordDomain.span) * 100);
                    const leftPct = effStrand === '-' ? Math.max(0, 100 - r) : l;
                    const widthPct = Math.max(0.2, r - l);
                    return (
                      <Box
                        key={`exon-${idx}`}
                        sx={{
                          position: 'absolute',
                          left: `${leftPct}%`,
                          top: '1px',
                          width: `${widthPct}%`,
                          height: trackH - 2,
                          bgcolor: hexToRgba(fill, 0.9),
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 0.5,
                        }}
                      />
                    );
                  })}
                </Box>
              ) : (
                <Box sx={{ display: 'inline-block', ml: 1, px: 0.5, py: 0, border: '1px solid', borderColor: 'divider', borderRadius: 0.5, fontSize: 11, lineHeight: 1.4, color: 'text.secondary', bgcolor: 'background.paper' }}>
                  NA
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
