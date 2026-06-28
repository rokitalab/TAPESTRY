import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Box, Chip, CircularProgress, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import * as d3 from "d3";
import GtexGeneModel from "./lib/GtexGeneModel";
import { colourForBiotype, hexToRgba } from "./lib/biotypeColors";
import { selectExpressedJunctionIds, metricValueGetter, filterHiddenGroups } from "./lib/junctionExpressionFilter";

const SVG_HEIGHT = 200;
// 20px less than JunctionExpressionHeatmap's MARGIN.left (200) -- keeps the
// gene model's exon row aligned under the heatmap's row labels while still
// reading as its own (slightly inset) plot.
const PADDING = { top: 10, right: 20, bottom: 10, left: 180 };

// Per-transcript isoform rows, stacked below the main model -- shorter and
// more tightly packed than the main model's 15px exon bar, since these are
// meant to be scanned as a compact stack rather than read individually.
// GtexGeneModel always draws the exon bar's top edge at y = h/2 (see its
// render()); drawTranscriptRows overrides both the height AND the y of each
// bar afterward so it sits flush at the row's top instead of leaving dead
// space above it, letting TX_ROW_PITCH (bar height + the gap below) be the
// only thing controlling row spacing.
const TX_EXON_BAR_HEIGHT = 10;
const TX_ROW_GAP = 4;
const TX_ROW_PITCH = TX_EXON_BAR_HEIGHT + TX_ROW_GAP;
// Top padding for the transcript-rows <svg> specifically -- kept separate
// from PADDING.top (which the main model's vertical centering depends on)
// so it can be trimmed down without shifting the main model's exon row.
const TX_TOP_PAD = 4;

// Height of the standalone transcript-rows <svg> (rendered separately from
// the main model now that the biotype Chip filter sits between them) --
// zero when every transcript is filtered out so no empty svg is shown.
function txSvgHeight(visibleTranscriptCount) {
  return visibleTranscriptCount > 0 ? TX_TOP_PAD + PADDING.bottom + visibleTranscriptCount * TX_ROW_PITCH : 0;
}

// SVG_HEIGHT (200) reserves room for the main model's junction arcs, which
// peak well above the exon row, but nothing else fills the space below the
// exon row -- on screen that's fine since the Chip filter's own box-model
// spacing sits below the fixed-height <svg> regardless, but the export has
// no Chips to justify carrying that empty space forward, so it stacks the
// transcript rows right under the model's actual visible bottom edge
// (the exon bar, GtexGeneModel's hardcoded 15px height) instead of at the
// full SVG_HEIGHT.
function mainModelContentHeight() {
  const exonY = (SVG_HEIGHT - PADDING.top - PADDING.bottom) / 2;
  return PADDING.top + exonY + 15 + 10;
}

// GENCODE/Ensembl's "degraded transcript" quality flags -- these transcripts
// are predicted to be non-functional (retained intron, nonsense-mediated
// decay, missing stop codon, or without a defined CDS), so their exon
// structure would distort the gene model's exon footprint away from real
// biology. Excluded from the exon union below and from the biotype Chip
// filter's default selection, but not from the canonical-transcript lookup
// used for the gene ID label.
const EXCLUDED_TRANSCRIPT_BIOTYPES = new Set([
  "retained_intron",
  "nonsense_mediated_decay",
  "non_stop_decay",
  "protein_coding_CDS_not_defined",
]);

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

// Pulls the "-201" out of Ensembl's "GENE-201"-style display_name, for
// sorting transcript rows -- null for names that don't follow that
// convention (e.g. when display_name fell back to the raw transcript ID).
function transcriptNumber(displayName) {
  const m = /-(\d+)$/.exec(displayName || "");
  return m ? Number(m[1]) : null;
}

// Ensembl's transcript exons don't come with an exonNumber. exonId is
// unused by GtexGeneModel.render() itself (only its unused addData() reads
// it), so it's repurposed here to carry the real Ensembl exon ID for the
// tooltip. exonNumber drives the displayed exon order: transcription runs
// 5'->3', which is ascending genomic position on the "+" strand but
// descending on the "-" strand, so exon 1 is the highest-coordinate exon
// there -- numbering is reversed accordingly (GtexGeneModel only uses
// exonNumber's relative differences for junction arc height, which are
// unaffected by this since the reversal is still strictly monotonic).
function toGeneModelExons(mergedExons, strand) {
  const sorted = mergedExons.slice().sort((a, b) => a.start - b.start);
  return sorted.map((e, i) => ({
    chromStart: e.start,
    chromEnd: e.end,
    exonNumber: strand === "-" ? sorted.length - i : i + 1,
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

// Renders the main exon/junction model into `dom` (a d3 selection of an
// <svg> or <g>) -- shared by the live render effect and buildExportSvg below
// so the download produces exactly what's on screen. Transcript isoform
// rows are drawn separately by drawTranscriptRows so the biotype Chip
// filter can sit between the two in the DOM.
function drawMainModel(dom, { width, exons, junctions, strand, gene, geneId, textColor, primaryColor, hoveredJunctionId, onHoverJunction, onHoverExon, container }) {
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
  // coordinates are reported relative to `container` (the component's outer
  // Box), matching the coordinate space the tooltip overlay is positioned
  // in. Falls back to dom's own node when no container is given (e.g. the
  // detached export svg, which has no tooltip overlay to align with).
  g.selectAll(".exon-curated")
    .style("cursor", "pointer")
    .on("mousemove", function (event) {
      const d = d3.select(this).datum();
      const [x, y] = d3.pointer(event, container ?? dom.node());
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
  // above the exon row instead of crowding it. The whole stack is then
  // nudged down 20px (keeping relative spacing) from that original position.
  const exonY = (SVG_HEIGHT - PADDING.top - PADDING.bottom) / 2;
  const stackX = g.select("#modelLabel").attr("x");
  g.select("#modelInfo")
    .attr("x", stackX)
    .attr("y", exonY - 18)
    .style("font-size", "15px")
    .attr("font-family", "sans-serif")
    .attr("fill", textColor);
  g.select("#modelLabel")
    .attr("y", exonY - 2)
    .style("font-size", "13px")
    .attr("font-family", "sans-serif")
    .attr("fill", textColor)
    .text(`${gene} (${strand})`);
  if (geneId) {
    g.append("text")
      .attr("id", "modelGeneId")
      .attr("text-anchor", "end")
      .attr("x", stackX)
      .attr("y", exonY + 12)
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
}

// Per-transcript isoform rows, drawn into their own <svg>/<g> below the main
// model's biotype Chip filter -- no junction arcs (isIsoform skips that
// branch in GtexGeneModel.render() entirely). Each row gets its own
// GtexGeneModel instance built from the SAME merged exon list and the same
// inner width as drawMainModel above, so setXscale() recomputes an
// identical scale every time and each transcript's exons land at the same x
// as the matching exon in the main model.
function drawTranscriptRows(dom, { width, exons, strand, transcriptRows, textColor, onHoverExon, container }) {
  dom.selectAll("*").remove();
  const g = dom.append("g").attr("transform", `translate(${PADDING.left},${TX_TOP_PAD})`);

  const innerWidth = Math.max(width - PADDING.left - PADDING.right, 0);
  const txBarCenter = TX_EXON_BAR_HEIGHT / 2;
  // GtexGeneModel.js's own #modelLabel convention: text-anchor "end" at
  // xScale.range()[0] - 5, and the range always starts at 0 (see
  // setXscale), so this is a fixed offset rather than something to read
  // back off a rendered label.
  const stackX = -5;
  let rowTop = 0;
  (transcriptRows ?? []).forEach((t) => {
    const rowG = g.append("g").attr("transform", `translate(0, ${rowTop})`);
    const txModel = new GtexGeneModel(
      { strand },
      exons.map((e) => ({ ...e })),
      toGeneModelExons(t.exons, strand),
      [],
      true
    );
    txModel.render(rowG, { w: innerWidth, h: TX_EXON_BAR_HEIGHT });

    // GtexGeneModel positions the exon bar's top edge at y = h/2 with its
    // own hardcoded 15px height -- overridden here to flush the (shrunk)
    // bar against the row's top edge so TX_ROW_PITCH alone controls the gap
    // between rows, instead of leaving dead space above each bar.
    // Hover wiring mirrors drawMainModel's exon tooltip, with the
    // transcript's own name/ID added so the tooltip says which transcript
    // the exon belongs to.
    rowG.selectAll(".exon-curated")
      .attr("y", 0)
      .attr("height", TX_EXON_BAR_HEIGHT)
      .style("fill", colourForBiotype(t.biotype))
      .style("cursor", "pointer")
      .on("mousemove", function (event) {
        const d = d3.select(this).datum();
        const [x, y] = d3.pointer(event, container ?? dom.node());
        onHoverExon?.({
          exonNumber: d.exonNumber,
          exonId: d.exonId,
          chromStart: d.chromStart,
          chromEnd: d.chromEnd,
          length: d.length,
          transcriptLabel: `${t.displayName} (${t.id})`,
          x,
          y,
        });
      })
      .on("mouseleave", () => onHoverExon?.(null));
    rowG.select(".intron")
      .attr("y1", txBarCenter)
      .attr("y2", txBarCenter)
      .attr("stroke", textColor);

    // Vertically centered on the row's exon bar. dominant-baseline="middle"
    // centers the glyphs themselves rather than the text baseline, so it's
    // accurate regardless of font metrics -- transcript names/IDs are all
    // caps/digits with no descenders, which would otherwise sit visibly
    // high of center if centered by baseline alone.
    rowG.append("text")
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
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
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const txSvgRef = useRef(null);
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
        setExons(toGeneModelExons(mergeExonIntervals(rawExons), strandVal));
        setGeneId(ensg);

        // Per-transcript rows, canonical first then ascending by the
        // "-201"-style transcript number Ensembl bakes into display_name --
        // unlike the merged exon union above, every transcript is shown here
        // (the biotype Chip filter below is the user-facing control for
        // that). geneData.canonical_transcript carries a version suffix
        // (e.g. "ENST00000357654.9") that t.id never does, hence the
        // startsWith check rather than a direct equality.
        const canonicalId = geneData?.canonical_transcript ?? null;
        const isCanonicalTranscript = (t) => (
          Boolean(t?.is_canonical) || t.id === canonicalId || Boolean(canonicalId?.startsWith(`${t.id}.`))
        );
        const txRows = transcripts
          .map((t) => {
            const txExons = (Array.isArray(t?.Exon) ? t.Exon : [])
              .map((e) => ({ start: Number(e.start), end: Number(e.end) }))
              .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end))
              .sort((a, b) => a.start - b.start);
            if (txExons.length === 0) return null;
            return {
              id: t.id,
              displayName: t.display_name || t.id,
              biotype: t?.biotype || "unknown",
              exons: txExons,
              isCanonical: isCanonicalTranscript(t),
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
            const numA = transcriptNumber(a.displayName);
            const numB = transcriptNumber(b.displayName);
            if (numA !== null && numB !== null) return numA - numB;
            if (numA !== null) return -1;
            if (numB !== null) return 1;
            return a.displayName.localeCompare(b.displayName);
          });
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
  // load, except the degraded-transcript biotypes excluded from the main
  // model's exon footprint (see EXCLUDED_TRANSCRIPT_BIOTYPES) -- those start
  // toggled off so the isoform rows match the main model's footprint until
  // the user opts back in. txBiotypes only changes once per gene fetch, so
  // this doesn't fight with the user's own toggles afterward. Done during
  // render rather than as a setState call inside an effect, comparing
  // against the txBiotypes seen on the previous render.
  const [prevTxBiotypes, setPrevTxBiotypes] = useState(txBiotypes);
  if (txBiotypes !== prevTxBiotypes) {
    setPrevTxBiotypes(txBiotypes);
    setActiveBiotypes(new Set(txBiotypes.filter((b) => !EXCLUDED_TRANSCRIPT_BIOTYPES.has(b))));
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

  const txHeight = txSvgHeight(visibleTranscriptRows.length);

  useEffect(() => {
    if (!svgRef.current || !exons || exons.length === 0) return;
    drawMainModel(d3.select(svgRef.current), {
      width,
      exons,
      junctions,
      strand,
      gene,
      geneId,
      textColor: theme.palette.text.primary,
      primaryColor: theme.palette.primary.main,
      hoveredJunctionId,
      onHoverJunction,
      onHoverExon: setHoveredExon,
      container: containerRef.current,
    });
  }, [exons, junctions, strand, gene, geneId, width, hoveredJunctionId, onHoverJunction,
      theme.palette.text.primary, theme.palette.primary.main]);

  useEffect(() => {
    if (!txSvgRef.current || !exons || exons.length === 0) return;
    drawTranscriptRows(d3.select(txSvgRef.current), {
      width,
      exons,
      strand,
      transcriptRows: visibleTranscriptRows,
      textColor: theme.palette.text.primary,
      onHoverExon: setHoveredExon,
      container: containerRef.current,
    });
  }, [exons, strand, width, visibleTranscriptRows, theme.palette.text.primary]);

  // Lets JunctionExpressionHeatmap.jsx's download button pull in a
  // matching, export-sized copy of the gene model (main model stacked above
  // the transcript rows, same as on screen minus the interactive Chips) to
  // stack under the heatmap on the same canvas.
  useImperativeHandle(ref, () => ({
    buildExportSvg({ width: exportWidth }) {
      if (!exons || exons.length === 0) return null;
      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const txOffset = mainModelContentHeight();
      svgEl.setAttribute("width", exportWidth);
      svgEl.setAttribute("height", txOffset + txSvgHeight(visibleTranscriptRows.length));
      const root = d3.select(svgEl);
      drawMainModel(root.append("g"), {
        width: exportWidth,
        exons,
        junctions,
        strand,
        gene,
        geneId,
        textColor: theme.palette.text.primary,
        primaryColor: theme.palette.primary.main,
        hoveredJunctionId: null,
        onHoverJunction: () => {},
      });
      if (visibleTranscriptRows.length > 0) {
        drawTranscriptRows(root.append("g").attr("transform", `translate(0, ${txOffset})`), {
          width: exportWidth,
          exons,
          strand,
          transcriptRows: visibleTranscriptRows,
          textColor: theme.palette.text.primary,
        });
      }
      return svgEl;
    },
  }), [exons, junctions, strand, gene, geneId, visibleTranscriptRows, theme.palette.text.primary, theme.palette.primary.main]);

  if (!gene) return null;

  return (
    <Box ref={containerRef} sx={{ position: "relative" }}>
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : fetchError ? (
        <Alert severity="error">Failed to load gene model: {fetchError}</Alert>
      ) : !exons ? null : (
        <>
          <svg ref={svgRef} width={width} height={SVG_HEIGHT} style={{ display: "block" }} />
          {txBiotypes.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ my: 0.5, flexWrap: "wrap", alignItems: "center" }}>
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
          {visibleTranscriptRows.length > 0 && (
            <svg ref={txSvgRef} width={width} height={txHeight} style={{ display: "block" }} />
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
          {hoveredExon.transcriptLabel && <>{hoveredExon.transcriptLabel}<br /></>}
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
