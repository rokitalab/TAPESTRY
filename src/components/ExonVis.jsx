import { useRef, useState, useEffect, useMemo } from "react";
import { Paper, Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import TranscriptVis from "./TranscriptVis";

export default function ExonBlocksSvg({
  gene,
  count,
  exonWidth = 10,
  exonHeight = 20,
  gap = 10,
  arcHeight = 30,           // vertical space above the exons for junction curves
  junctionStroke = "#8c8c8c",
  junctionWidth = 1,
  junctionRise = 12,        // fixed apex height above exon tops (in SVG units)
  coordWidth = 2,
  widths,
  cornerRadius = 1,
  eventType = null,
  exonID = null,
  strand = "+",
}) {
  const theme = useTheme();

  // Canonical transcript exons and genomic domain across transcripts
  const [canonExons, setCanonExons] = useState(null); // [{ start, end }]
  const [coordDomain, setCoordDomain] = useState(null); // { min, max, span }
  const [apiStrand, setApiStrand] = useState(null); // '+' | '-' | null
  const [geneID, setGeneID] = useState(null);

  // Fetch canonical transcript exons and shared genomic domain across transcripts
  useEffect(() => {
  if (!gene) {
    setCanonExons(null);
    setCoordDomain(null);
    return;
  }

  const controller = new AbortController();
  const headers = { Accept: "application/json" };

  const parseExons = (raw) => {
    let arr = raw;
    if (!arr) return [];
    if (!Array.isArray(arr) && typeof arr === "object") arr = Object.values(arr);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(e => {
        const s = Number(e?.start ?? e?.seq_region_start ?? e?.begin);
        const en = Number(e?.end ?? e?.seq_region_end ?? e?.finish);
        if (!Number.isFinite(s) || !Number.isFinite(en)) return null;
        return { start: Math.min(s, en), end: Math.max(s, en) };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
  };

  (async () => {
    try {
      /* -------- STEP 1: symbol → ENSG -------- */
      const idUrl =
        `https://rest.ensembl.org/xrefs/symbol/homo_sapiens/${encodeURIComponent(gene)}` +
        `?content-type=application/json;expand=1`;

      const idRes = await fetch(idUrl, { signal: controller.signal, headers });
      if (!idRes.ok) throw new Error(`HTTP ${idRes.status}`);
      const idData = await idRes.json();

      const ensg = idData.find(
        e => e.type === "gene" && e.id.startsWith("ENSG")
      )?.id;

      if (!ensg) throw new Error("No ENSG ID found");
      setGeneID(ensg);

      /* -------- STEP 2: ENSG → gene lookup -------- */
      const lookupUrl =
        `https://rest.ensembl.org/lookup/id/${encodeURIComponent(ensg)}` +
        `?content-type=application/json;expand=1`;

      const res = await fetch(lookupUrl, { signal: controller.signal, headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      /* -------- strand -------- */
      const strand =
        data?.strand === 1 ? "+" :
        data?.strand === -1 ? "-" :
        null;

      setApiStrand(strand);

      /* -------- transcripts -------- */
      const transcripts = Array.isArray(data.Transcript)
        ? data.Transcript
        : Array.isArray(data.transcripts)
        ? data.transcripts
        : [];

      const canonicalId = data?.canonical_transcript ?? null;

      let canon =
        transcripts.find(
          t => (t?.id || t?.stable_id) === canonicalId
        ) ||
        transcripts.find(t => t?.is_canonical);

      if (canon) {
        setCanonExons(parseExons(canon?.Exon ?? canon?.exon));
      } else {
        setCanonExons(null);
      }

      /* -------- global domain -------- */
      let min = Infinity, max = -Infinity;
      transcripts.forEach(t => {
        parseExons(t?.Exon ?? t?.exon).forEach(e => {
          min = Math.min(min, e.start);
          max = Math.max(max, e.end);
        });
      });

      setCoordDomain(
          Number.isFinite(min) && Number.isFinite(max) && max > min
            ? { min, max, span: max - min }
            : null
        );
      } catch {
        setCanonExons(null);
        setCoordDomain(null);
      }
    })();

    return () => controller.abort();
  }, [gene]);

  function getExonCountForGene(name) {
    const g = (name || "").trim().toUpperCase();
    const LUT = {
      CLK1: 13,
      PTEN: 9,
      BRCA1: 24,
      BRCA2: 27,
      TP53: 11,
      EGFR: 28,
    };
    return LUT[g] ?? 12;
  }

  // Build either coordinate-based exons from canonical transcript or fallback synthetic ones
  const fallbackN = typeof count === "number" && count > 0 ? count : getExonCountForGene(gene);
  const fallbackWidthsArr = Array.from({ length: fallbackN }, (_, i) => (
    Array.isArray(widths) && typeof widths[i] === "number" ? widths[i] : exonWidth
  ));

  let exons = [];
  let totalWidth = 0;
  const totalHeight = arcHeight + exonHeight;
  const SVGHeight = totalHeight + 30; // height added for strand direction

  if (coordDomain && Array.isArray(canonExons) && canonExons.length > 0) {
    // Coordinate-based layout aligned to genomic domain
    exons = canonExons.map(e => ({ x: e.start - coordDomain.min, w: Math.max(1, e.end - e.start) }));
    totalWidth = coordDomain.span;
  } else {
    // Fallback synthetic layout spanning fixed widths and gaps
    let x = 0;
    for (let i = 0; i < fallbackN; i++) {
      const w = fallbackWidthsArr[i];
      exons.push({ x, w });
      x += w + (i < fallbackN - 1 ? gap : 0);
    }
    totalWidth = fallbackWidthsArr.reduce((s, w) => s + w, 0) + Math.max(0, fallbackN - 1) * gap;
  }

  // Build display coordinates respecting strand orientation
  const effStrand = apiStrand ?? strand;
  const displayExons = [];
  for (let j = 0; j < exons.length; j++) {
    const k = effStrand === "-" ? exons.length - 1 - j : j; // base index
    const base = exons[k];
    const xDisp = effStrand === "-" ? totalWidth - (base.x + base.w) : base.x;
    displayExons.push({ x: xDisp, w: base.w, baseIdx: k });
  }

  const svgRef = useRef(null);
  const [hovered, setHovered] = useState(null); // { dispIndex, baseIndex }
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });

  const computeAnchorPx = (dispIdx) => {
    const svg = svgRef.current;
    if (!svg) return;
    const cw = svg.clientWidth || 1;
    const ch = svg.clientHeight || 1;
    const sx = cw / totalWidth;
    const sy = ch / totalHeight;
    const e = displayExons[dispIdx];
    if (!e) return;
    const ax = (e.x + e.w / 2) * sx; // center of exon in px (display coords)
    const ay = arcHeight * sy;       // top of exon in px
    setAnchor({ x: ax, y: ay });
  };

  // Helper to format tooltip coordinates from canonical model
  const tooltipCoords = useMemo(() => {
    if (!hovered || !Array.isArray(canonExons) || !canonExons.length) return "NA";
    const idx = hovered.baseIndex;
    if (!Number.isFinite(idx) || idx < 0 || idx >= canonExons.length) return "NA";
    const c = canonExons[idx];
    return `${c.start}–${c.end}`;
  }, [hovered, canonExons]);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
      <Box sx={{ position: "relative", width: "100%" }}>
        {geneID ? (
          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary', mb: 0.5 }}>
            {geneID}
          </Typography>
        ) : null}
        <Typography sx={{ fontWeight: 800, mb: 1 }}>
          {gene}
          {typeof effStrand === "string" && effStrand.length
            ? ` (${effStrand === "-" ? "\u2212" : "+"} strand)`
            : ""}
        </Typography>
        <svg
          ref={svgRef}
          width="100%"
          height={SVGHeight}
          viewBox={`0 0 ${totalWidth} ${SVGHeight}`}
          preserveAspectRatio="none"
        >

          {/* Strand display */}
          {(() => {
            const d = `M 0,70 Q 10,70 ${totalWidth},70`;
            return (
              <path
                d={d}
                fill="none"
                stroke={junctionStroke}
                strokeWidth={coordWidth}
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}

          {/* Junction arcs drawn above exons (display order) */}
          {displayExons.slice(0, -1).map((e, i) => {
            const x1 = e.x + e.w;              // right edge of exon i (display coords)
            const x2 = displayExons[i + 1].x;  // left edge of exon i+1 (display coords)
            const baseY = arcHeight;           // top of exons
            const maxRise = arcHeight - 2;     // small padding at the top of the SVG
            const rise = Math.min(junctionRise, maxRise);
            const midX = (x1 + x2) / 2;
            const controlY = baseY - 2 * rise;
            const d = `M ${x1},${baseY} Q ${midX},${controlY} ${x2},${baseY}`;
            return (
              <path
                key={`j-${i}`}
                d={d}
                fill="none"
                stroke={junctionStroke}
                strokeWidth={junctionWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* Disrupted SE skip junction (connect exon before and after the skipped exon) */}
          {Number.isFinite(exonID) && eventType == "SE" && (() => {
            const k = Math.floor(exonID);
            const idx = k - 1; // convert 1-based exon number to 0-based index
            const prev = idx - 1;
            const next = idx + 1;
            if (prev < 0 || next >= exons.length) return null;
            // Use strand-aware display coordinates so the skip junction mirrors on '-' strand
            const prevDisp = displayExons.find(d => d.baseIdx === prev);
            const nextDisp = displayExons.find(d => d.baseIdx === next);
            if (!prevDisp || !nextDisp) return null;
            const x1 = effStrand === "-" ? (nextDisp.x + nextDisp.w) : (prevDisp.x + prevDisp.w); // end of next on '-' strand, end of prev on '+'
            const x2 = effStrand === "-" ? prevDisp.x : nextDisp.x;                                // start of prev on '-' strand, start of next on '+'
            const baseY = arcHeight;
            const maxRise = arcHeight - 2;
            const rise = Math.min(junctionRise * 2.5, maxRise); // slightly higher dome
            const midX = (x1 + x2) / 2;
            const controlY = baseY - 2 * rise;
            const d = `M ${x1},${baseY} Q ${midX},${controlY} ${x2},${baseY}`;
            return (
              <path
                d={d}
                fill="none"
                stroke={theme.palette.error.main}
                strokeWidth={Math.max(junctionWidth * 2, 2)}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}

          {/* A3SS junction (connect exon before to mid-exon) */}
          {Number.isFinite(exonID) && eventType == "A3SS" && (() => {
            const k = Math.floor(exonID);
            const idx = k - 1; // convert 1-based exon number to 0-based index
            const prev = idx - 1;
            const next = idx + 1;
            if (prev < 0 && next >= exons.length) return null;
            // Use strand-aware display coordinates so the skip junction mirrors on '-' strand
            const currentDisp = displayExons.find(d => d.baseIdx === idx);
            const prevDisp = displayExons.find(d => d.baseIdx === prev);
            const nextDisp = displayExons.find(d => d.baseIdx === next);
            if (!prevDisp && !nextDisp) return null;
            const x1 = effStrand === "-" ? (currentDisp.x + (currentDisp.w)/2) : (prevDisp.x + prevDisp.w); // middle of current on '-', end of prev on '+' strand,
            const x2 = effStrand === "-" ? prevDisp.x : (currentDisp.x + (currentDisp.w)/2);                                // start of prev on '-' strand, middle of current on '+'
            const baseY = arcHeight;
            const maxRise = arcHeight - 2;
            const rise = Math.min(junctionRise * 2, maxRise); // slightly higher dome
            const midX = (x1 + x2) / 2;
            const controlY = baseY - 2 * rise;
            const d = `M ${x1},${baseY} Q ${midX},${controlY} ${x2},${baseY}`;
            return (
              <path
                d={d}
                fill="none"
                stroke={theme.palette.error.main}
                strokeWidth={Math.max(junctionWidth * 2, 2)}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })()}

          {/* Exon rectangles (display order) */}
          {displayExons.map((e, i) => {
            const isSkipped = Number.isFinite(exonID) && e.baseIdx === Math.floor(exonID) - 1;
            const fillColor = isSkipped
              ? theme.palette.error.main
              : hovered?.dispIndex === i
              ? theme.palette.secondary.main
              : "currentColor";
            return (
              <rect
                key={i}
                x={e.x}
                y={arcHeight}
                width={e.w}
                height={exonHeight}
                rx={cornerRadius}
                ry={cornerRadius}
                fill={fillColor}
                onMouseEnter={() => { setHovered({ dispIndex: i, baseIndex: e.baseIdx }); computeAnchorPx(i);}}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>
        {hovered && (
          <Box
            sx={{
              position: "absolute",
              left: anchor.x,
              top: anchor.y,
              transform: "translate(-50%, calc(100% + 20px))",
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
            }}
          >
            <b>Exon {Number.isFinite(hovered?.baseIndex) ? hovered.baseIndex + 1 : ""}</b><br />
            Coordinates: {tooltipCoords}
          </Box>
        )}

        <TranscriptVis geneID={geneID} strand={effStrand} />
      </Box>
    </Paper>
  );
}
