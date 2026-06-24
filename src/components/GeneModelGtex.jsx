import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Box, Chip, CircularProgress, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import * as d3 from "d3";
import GtexGeneModel from "./lib/GtexGeneModel";
import { colourForBiotype, hexToRgba } from "./lib/biotypeColors";
import { selectExpressedJunctionIds, metricValueGetter, filterHiddenGroups } from "./lib/junctionExpressionFilter";

const SVG_HEIGHT = 200;
const PADDING = { top: 10, right: 20, bottom: 10, left: 120 };

// Per-transcript isoform rows, stacked below the main model -- shorter and
// more tightly packed than the main model's 15px exon bar, since these are
// meant to be scanned as a compact stack rather than read individually.
// GtexGeneModel always draws the exon bar's top edge at y = h/2 and its own
// hardcoded 15px height; TX_EXON_BAR_HEIGHT overrides that height after the
// fact (see drawGeneModel), and TX_ROW_INNER_H is sized so the bar still
// fits within the row (h/2 + TX_EXON_BAR_HEIGHT <= h => h >= 20).
const TX_EXON_BAR_HEIGHT = 10;
const TX_ROW_INNER_H = 20;
const TX_ROW_PITCH = 24;
const TX_SECTION_TOP_GAP = 12;

function geneModelSvgHeight(visibleTranscriptCount) {
  return SVG_HEIGHT + (visibleTranscriptCount > 0 ? TX_SECTION_TOP_GAP + visibleTranscriptCount * TX_ROW_PITCH : 0);
}

// GENCODE/Ensembl's "degraded transcript" quality flags -- these transcripts
// are predicted to be non-functional (retained intron, nonsense-mediated
// decay, missing stop codon), so their exon structure would distort the
// gene model's exon footprint away from real biology. Excluded from the
// exon union below, but not from the canonical-transcript lookup used for
// the gene ID label.
const EXCLUDED_TRANSCRIPT_BIOTYPES = new Set(["retained_intron", "nonsense_mediated_decay", "non_stop_decay"]);

// GtexGeneModel.js's defaults for junction arcs/dots (see its render()) --
// duplicated here so hover highlighting can fall back to them.
const JUNC_CURVE_COLOR = "#92bcc9";
const JUNC_DOT_COLOR = "rgb(86, 98, 107)";

// GtexGeneModel.js bakes the junctionId into each junction element's class
// as `junc-curve junc${junctionId}` (path) / `junc junc${junctionId}`
// (dot) -- pulls it back out so hover handlers know which junction an
// element represents without modifying the vendored lib.
function junctionIdOf(node, ownClass) {
  const token = (node.getAttribute("class") || "")
    .split(/\s+/)
    .find((c) => c !== ownClass && c.startsWith("junc"));
  return token ? token.slice(4) : null;
}

// Ensembl's transcript exons don't come with an exonNumber, and
// GtexGeneModel only uses exonNumber to measure exon-to-exon distance for
// junction arc height -- genomic order (regardless of strand, per the
// class's own header comment) is sufficient for that. exonId is unused by
// GtexGeneModel.render() itself (only its unused addData() reads it), so
// it's repurposed here to carry the real Ensembl exon ID for the tooltip.
function toGeneModelExons(mergedExons) {
  return mergedExons
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((e, i) => ({
      chromStart: e.start,
      chromEnd: e.end,
      exonNumber: i + 1,
      exonId: e.exonId ?? null,
    }));
}

// Collapses every transcript's exons into one non-overlapping set so the
// gene model shows the full exon footprint of the gene, not just whichever
// exons happen to belong to the canonical transcript. Each merged interval
// keeps one representative Ensembl exon ID for the hover tooltip: the
// transcript exon that exactly matches the merged span if one exists,
// otherwise the longest contributing exon.
function mergeExonIntervals(rawExons) {
  const sorted = rawExons.slice().sort((a, b) => a.start - b.start);
  const merged = [];
  sorted.forEach((e) => {
    const last = merged[merged.length - 1];
    if (last && e.start <= last.end + 1) {
      last.end = Math.max(last.end, e.end);
      last.members.push(e);
    } else {
      merged.push({ start: e.start, end: e.end, members: [e] });
    }
  });
  return merged.map((m) => {
    const exact = m.members.find((e) => e.start === m.start && e.end === m.end);
    const longest = exact ?? m.members.reduce((best, e) => (
      !best || (e.end - e.start) > (best.end - best.start) ? e : best
    ), null);
    return { start: m.start, end: m.end, exonId: longest?.id ?? null };
  });
}

// Renders exons/junction arcs into `dom` (a d3 selection of an <svg>) --
// shared by the live render effect and buildExportSvg below so the download
// produces exactly what's on screen.
function drawGeneModel(dom, { width, exons, junctions, strand, gene, geneId, transcriptRows, textColor, primaryColor, hoveredJunctionId, onHoverJunction, onHoverExon }) {
  dom.selectAll("*").remove();
  const g = dom.append("g").attr("transform", `translate(${PADDING.left},${PADDING.top})`);

  const model = new GtexGeneModel(
    { strand, geneSymbol: gene },
    exons.map((e) => ({ ...e })),
    exons.map((e) => ({ ...e })),
    junctions.map((j) => ({ ...j }))
  );

  model.render(g, {
    w: Math.max(width - PADDING.left - PADDING.right, 0),
    h: SVG_HEIGHT - PADDING.top - PADDING.bottom,
    labelOn: "left",
  });

  g.selectAll(".exon").style("fill", textColor);
  g.selectAll(".exon-curated").style("fill", primaryColor);

  // Hovering an exon rect shows a tooltip with its number/ID/coordinates --
  // coordinates are reported relative to the outer <svg> (dom), matching
  // the coordinate space the tooltip overlay in the component is
  // positioned in.
  g.selectAll(".exon-curated")
    .style("cursor", "pointer")
    .on("mousemove", function (event) {
      const d = d3.select(this).datum();
      const [x, y] = d3.pointer(event, dom.node());
      onHoverExon?.({
        exonNumber: d.exonNumber,
        exonId: d.exonId,
        chromStart: d.chromStart,
        chromEnd: d.chromEnd,
        length: d.length,
        x,
        y,
      });
    })
    .on("mouseleave", () => onHoverExon?.(null));
  // GtexGeneModel.js's render() places "Gene Model" (#modelInfo) just above
  // the exon row and the gene name (#modelLabel) beside it -- moved up and
  // enlarged here, with a third line for the gene ID, so all three stack
  // above the exon row instead of crowding it.
  const exonY = (SVG_HEIGHT - PADDING.top - PADDING.bottom) / 2;
  const stackX = g.select("#modelLabel").attr("x");
  g.select("#modelInfo")
    .attr("x", stackX)
    .attr("y", exonY - 38)
    .style("font-size", "15px")
    .attr("font-family", "sans-serif")
    .attr("fill", textColor);
  g.select("#modelLabel")
    .attr("y", exonY - 22)
    .style("font-size", "13px")
    .attr("font-family", "sans-serif")
    .attr("fill", textColor)
    .text(`${gene} (${strand})`);
  if (geneId) {
    g.append("text")
      .attr("id", "modelGeneId")
      .attr("text-anchor", "end")
      .attr("x", stackX)
      .attr("y", exonY - 8)
      .style("font-size", "11px")
      .attr("font-family", "sans-serif")
      .attr("fill", textColor)
      .text(geneId);
  }
  // gtex-viz's own stylesheet sets junc-curve's fill to none; without it the
  // browser fills the area the arc implicitly closes over with black.
  g.selectAll(".junc-curve").style("fill", "none");

  // Hovering a junction's arc/dot here, or a column in the heatmap (via
  // hoveredJunctionId), highlights the same junction in both places.
  g.selectAll(".junc-curve").each(function () {
    const junctionId = junctionIdOf(this, "junc-curve");
    const isHovered = junctionId !== null && junctionId === hoveredJunctionId;
    d3.select(this)
      .style("stroke", isHovered ? primaryColor : JUNC_CURVE_COLOR)
      .style("stroke-width", isHovered ? 3 : 1)
      .style("cursor", junctionId ? "pointer" : null)
      .on("mouseover", () => onHoverJunction?.(junctionId))
      .on("mouseout", () => onHoverJunction?.(null));
  });
  g.selectAll(".junc").each(function () {
    const junctionId = junctionIdOf(this, "junc");
    const isHovered = junctionId !== null && junctionId === hoveredJunctionId;
    d3.select(this)
      .attr("r", isHovered ? 6 : 4)
      .style("fill", isHovered ? primaryColor : JUNC_DOT_COLOR)
      .style("cursor", junctionId ? "pointer" : null)
      .on("mouseover", () => onHoverJunction?.(junctionId))
      .on("mouseout", () => onHoverJunction?.(null));
  });

  // Per-transcript isoform rows below the main model -- no junction arcs
  // (isIsoform skips that branch in GtexGeneModel.render() entirely).
  // Each row gets its own GtexGeneModel instance built from the SAME merged
  // exon list and the same inner width as the main model above, so
  // setXscale() recomputes an identical scale every time and each
  // transcript's exons land at the same x as the matching exon up top.
  const innerWidth = Math.max(width - PADDING.left - PADDING.right, 0);
  const txExonY = TX_ROW_INNER_H / 2;
  const txBarCenter = txExonY + TX_EXON_BAR_HEIGHT / 2;
  let rowTop = (SVG_HEIGHT - PADDING.top - PADDING.bottom) + TX_SECTION_TOP_GAP;
  (transcriptRows ?? []).forEach((t) => {
    const rowG = g.append("g").attr("transform", `translate(0, ${rowTop})`);
    const txModel = new GtexGeneModel(
      { strand },
      exons.map((e) => ({ ...e })),
      toGeneModelExons(t.exons),
      [],
      true
    );
    txModel.render(rowG, { w: innerWidth, h: TX_ROW_INNER_H });

    // GtexGeneModel hardcodes the exon bar's own height at 15px (and the
    // intron line's y at the center of that 15px bar) -- shrunk and
    // re-centered here for a more compact row than the main model's.
    rowG.selectAll(".exon-curated")
      .attr("height", TX_EXON_BAR_HEIGHT)
      .style("fill", colourForBiotype(t.biotype))
      .style("cursor", "default");
    rowG.select(".intron")
      .attr("y1", txBarCenter)
      .attr("y2", txBarCenter)
      .attr("stroke", textColor);

    // Vertically centered on the row's (shrunk) exon bar, same convention
    // GtexGeneModel.js itself uses for #modelLabel.
    rowG.append("text")
      .attr("text-anchor", "end")
      .attr("x", stackX)
      .attr("y", txBarCenter)
      .style("font-size", "10px")
      .attr("font-family", "sans-serif")
      .attr("fill", textColor)
      .text(`${t.displayName} (${t.id})`);

    rowTop += TX_ROW_PITCH;
  });
}

const GeneModelGtex = forwardRef(function GeneModelGtex(
  { gene, junctionData, width, hoveredJunctionId = null, onHoverJunction, metric, minExpressionValue, hiddenGroups },
  ref
) {
  const theme = useTheme();
  const svgRef = useRef(null);
  const [exons, setExons] = useState(null);
  const [strand, setStrand] = useState("+");
  const [geneId, setGeneId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [hoveredExon, setHoveredExon] = useState(null);
  const [transcriptRows, setTranscriptRows] = useState([]);
  const [activeBiotypes, setActiveBiotypes] = useState(new Set());

  // Same Ensembl lookup ExonVis.jsx uses for transcript exon coordinates --
  // this app has no internal exon-coordinate endpoint. Unlike ExonVis,
  // exons come from every transcript (merged into one non-overlapping set
  // below) so the model shows the gene's full exon footprint rather than
  // just the canonical transcript's.
  useEffect(() => {
    if (!gene) {
      setExons(null);
      setGeneId(null);
      setHoveredExon(null);
      setTranscriptRows([]);
      return;
    }
    const controller = new AbortController();
    const headers = { Accept: "application/json" };
    setLoading(true);
    setFetchError(null);
    setHoveredExon(null);
    (async () => {
      try {
        const idUrl = `https://rest.ensembl.org/xrefs/symbol/homo_sapiens/${encodeURIComponent(gene)}?content-type=application/json;expand=1`;
        const idRes = await fetch(idUrl, { signal: controller.signal, headers });
        if (!idRes.ok) throw new Error(`HTTP ${idRes.status}`);
        const idData = await idRes.json();
        const ensg = idData.find((e) => e.type === "gene" && e.id.startsWith("ENSG"))?.id;
        if (!ensg) throw new Error("No ENSG ID found");

        const lookupUrl = `https://rest.ensembl.org/lookup/id/${encodeURIComponent(ensg)}?content-type=application/json;expand=1`;
        const res = await fetch(lookupUrl, { signal: controller.signal, headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geneData = await res.json();

        const strandVal = geneData?.strand === -1 ? "-" : "+";
        const transcripts = Array.isArray(geneData.Transcript) ? geneData.Transcript : [];

        // Falls back to every transcript if the exclusion would leave none
        // (e.g. a gene whose only annotated transcripts are all flagged) --
        // showing a degraded-transcript exon footprint beats showing none.
        const exonTranscripts = transcripts.filter((t) => !EXCLUDED_TRANSCRIPT_BIOTYPES.has(t?.biotype));
        const rawExons = (exonTranscripts.length > 0 ? exonTranscripts : transcripts)
          .flatMap((t) => (Array.isArray(t?.Exon) ? t.Exon : []))
          .map((e) => ({ start: Number(e.start), end: Number(e.end), id: e.id }))
          .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end));
        if (rawExons.length === 0) throw new Error("No exon coordinates returned for transcripts");

        setStrand(strandVal);
        setExons(toGeneModelExons(mergeExonIntervals(rawExons)));
        setGeneId(ensg);

        // Per-transcript rows, sorted by genomic position -- unlike the
        // merged exon union above, every transcript is shown here (the
        // biotype Chip filter below is the user-facing control for this).
        const txRows = transcripts
          .map((t) => {
            const txExons = (Array.isArray(t?.Exon) ? t.Exon : [])
              .map((e) => ({ start: Number(e.start), end: Number(e.end) }))
              .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end))
              .sort((a, b) => a.start - b.start);
            if (txExons.length === 0) return null;
            return { id: t.id, displayName: t.display_name || t.id, biotype: t?.biotype || "unknown", exons: txExons };
          })
          .filter(Boolean)
          .sort((a, b) => a.exons[0].start - b.exons[0].start);
        setTranscriptRows(txRows);
      } catch (e) {
        if (e.name !== "AbortError") {
          setFetchError(e.message);
          setExons(null);
          setGeneId(null);
          setTranscriptRows([]);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [gene]);

  // GtexGeneModel only needs chromStart/chromEnd/junctionId per junction --
  // reuses the same gene-junction-expression rows the heatmap renders,
  // filtered down to the same expressed junctions the heatmap shows (see
  // selectExpressedJunctionIds, given the same metric/threshold/hidden-group
  // state) and deduped to one entry per junction.
  const junctions = useMemo(() => {
    const visibleData = filterHiddenGroups(junctionData, hiddenGroups);
    const expressedIds = selectExpressedJunctionIds(visibleData, {
      getValue: metricValueGetter(metric),
      minValue: minExpressionValue,
    });
    const seen = new Map();
    visibleData.forEach((d) => {
      if (!expressedIds.has(d.junctionId) || seen.has(d.junctionId)) return;
      const [, start, end] = d.junctionId.split("_");
      seen.set(d.junctionId, { junctionId: d.junctionId, chromStart: Number(start), chromEnd: Number(end) });
    });
    return Array.from(seen.values());
  }, [junctionData, metric, minExpressionValue, hiddenGroups]);

  // Distinct biotypes among this gene's transcripts, for the Chip filter
  // bar below -- mirrors TranscriptVis.jsx's legendItems.
  const txBiotypes = useMemo(() => {
    const set = new Set();
    transcriptRows.forEach((t) => set.add(t.biotype));
    return Array.from(set);
  }, [transcriptRows]);

  // Selects every biotype by default whenever a new gene's transcripts
  // load (txBiotypes only changes once per gene fetch, so this doesn't
  // fight with the user's own toggles) -- same default TranscriptVis.jsx
  // uses. Done during render rather than as a setState call inside an
  // effect, comparing against the txBiotypes seen on the previous render.
  const [prevTxBiotypes, setPrevTxBiotypes] = useState(txBiotypes);
  if (txBiotypes !== prevTxBiotypes) {
    setPrevTxBiotypes(txBiotypes);
    setActiveBiotypes(new Set(txBiotypes));
  }

  const toggleBiotype = (bio) => {
    setActiveBiotypes((prev) => {
      const next = new Set(prev);
      if (next.has(bio)) next.delete(bio); else next.add(bio);
      return next;
    });
  };

  const visibleTranscriptRows = useMemo(
    () => transcriptRows.filter((t) => activeBiotypes.has(t.biotype)),
    [transcriptRows, activeBiotypes]
  );

  const svgHeight = geneModelSvgHeight(visibleTranscriptRows.length);

  useEffect(() => {
    if (!svgRef.current || !exons || exons.length === 0) return;
    drawGeneModel(d3.select(svgRef.current), {
      width,
      exons,
      junctions,
      strand,
      gene,
      geneId,
      transcriptRows: visibleTranscriptRows,
      textColor: theme.palette.text.primary,
      primaryColor: theme.palette.primary.main,
      hoveredJunctionId,
      onHoverJunction,
      onHoverExon: setHoveredExon,
    });
  }, [exons, junctions, strand, gene, geneId, visibleTranscriptRows, width, hoveredJunctionId, onHoverJunction,
      theme.palette.text.primary, theme.palette.primary.main]);

  // Lets JunctionExpressionHeatmap.jsx's download button pull in a
  // matching, export-sized copy of the gene model to stack under the
  // heatmap on the same canvas.
  useImperativeHandle(ref, () => ({
    buildExportSvg({ width: exportWidth }) {
      if (!exons || exons.length === 0) return null;
      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.setAttribute("width", exportWidth);
      svgEl.setAttribute("height", geneModelSvgHeight(visibleTranscriptRows.length));
      drawGeneModel(d3.select(svgEl), {
        width: exportWidth,
        exons,
        junctions,
        strand,
        gene,
        geneId,
        transcriptRows: visibleTranscriptRows,
        textColor: theme.palette.text.primary,
        primaryColor: theme.palette.primary.main,
        hoveredJunctionId: null,
        onHoverJunction: () => {},
      });
      return svgEl;
    },
  }), [exons, junctions, strand, gene, geneId, visibleTranscriptRows, theme.palette.text.primary, theme.palette.primary.main]);

  if (!gene) return null;

  return (
    <Box sx={{ position: "relative" }}>
      {txBiotypes.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap", alignItems: "center" }}>
          {txBiotypes.map((bio) => {
            const selected = activeBiotypes.has(bio);
            const colour = colourForBiotype(bio);
            return (
              <Chip
                key={bio}
                label={bio}
                size="small"
                onClick={() => toggleBiotype(bio)}
                sx={{
                  bgcolor: selected ? colour : hexToRgba(colour, 0.5),
                  color: "common.white",
                  fontWeight: selected ? 700 : 400,
                  border: "1px solid",
                  borderColor: selected ? "transparent" : "divider",
                  cursor: "pointer",
                }}
              />
            );
          })}
        </Stack>
      )}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : fetchError ? (
        <Alert severity="error">Failed to load gene model: {fetchError}</Alert>
      ) : !exons ? null : (
        <svg ref={svgRef} width={width} height={svgHeight} style={{ display: "block" }} />
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
          <b>Exon {hoveredExon.exonNumber}</b><br />
          {hoveredExon.exonId && <>{hoveredExon.exonId}<br /></>}
          start: {hoveredExon.chromStart}<br />
          end: {hoveredExon.chromEnd}<br />
          length: {hoveredExon.length} bp
        </Box>
      )}
    </Box>
  );
});

export default GeneModelGtex;
