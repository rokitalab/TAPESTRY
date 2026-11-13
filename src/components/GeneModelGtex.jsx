import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Box, Chip, CircularProgress, Stack } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import * as d3 from "d3";
import GtexGeneModel from "./lib/GtexGeneModel";
import { colourForBiotype, hexToRgba } from "./lib/biotypeColors";
import { fetchEnsemblGeneId, fetchEnsemblGene } from "./lib/ensembl";
import { selectExpressedJunctionIds, metricValueGetter, filterHiddenGroups } from "./lib/junctionExpressionFilter";
import { junctionIdToIntron, junctionIdToDisplayCoords } from "./lib/junctionCoords";

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

// Shared default for tejsByJunctionId, so an omitted prop doesn't produce a
// new Map (and a redraw) on every render.
const NO_TEJS = new Map();

// Strand-direction chevrons in the gaps between exons, matching
// TranscriptVis.jsx's: one candidate column every CHEVRON_STEP_PX, skipped
// wherever the chevron would come within CHEVRON_PAD_PX of an exon -- ›
// on the plus strand, ‹ on the minus strand.
const CHEVRON_STEP_PX = 40;
const CHEVRON_SIZE_PX = 8;
const CHEVRON_PAD_PX = 3;

// Draws chevrons into `g` along y = centerY, between the leftmost and
// rightmost of `exonData` (GtexGeneModel's rendered exon data, carrying
// pixel x/w). Exons GtexGeneModel couldn't map have no x and are ignored.
function drawStrandChevrons(g, { exonData, innerWidth, centerY, strand, color }) {
  if (strand !== "+" && strand !== "-") return;
  const ex = exonData
    .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.w))
    .map((d) => ({ l: d.x, r: d.x + d.w }));
  if (ex.length < 2) return;
  const lo = d3.min(ex, (e) => e.l);
  const hi = d3.max(ex, (e) => e.r);
  const xs = [];
  for (let x = CHEVRON_STEP_PX / 2; x + CHEVRON_SIZE_PX <= innerWidth; x += CHEVRON_STEP_PX) {
    if (x < lo || x + CHEVRON_SIZE_PX > hi) continue;
    if (ex.some((e) => x + CHEVRON_SIZE_PX + CHEVRON_PAD_PX > e.l && x - CHEVRON_PAD_PX < e.r)) continue;
    xs.push(x);
  }
  // Same 8x8 paths as TranscriptVis's chevrons, placed with their box
  // vertically centered on centerY.
  const d = strand === "-" ? "M6 1L3 4l3 3" : "M2 1l3 3-3 3";
  g.append("g")
    .attr("class", "strand-chevrons")
    .attr("pointer-events", "none")
    .selectAll("path")
    .data(xs)
    .join("path")
    .attr("transform", (x) => `translate(${x},${centerY - CHEVRON_SIZE_PX / 2})`)
    .attr("d", d)
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.3)
    .attr("stroke-linecap", "round")
    .attr("stroke-linejoin", "round")
    .attr("opacity", 0.6);
}

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

// A junction's name in each transcript that splices exactly its intron --
// two consecutive exons ending at intron_start - 1 and starting at
// intron_end + 1 -- grouped by name, e.g.
//   [{ name: "exon5:exon4", transcripts: ["GENE-201", "GENE-204"] }, ...]
// Exons are numbered 5'->3' per transcript (descending genomic position on
// the "-" strand, as in toGeneModelExons) and listed in genomic order,
// matching the tej table's junction_name format. Transcript exons are
// ascending by start (see lib/ensembl.js).
function junctionNameGroups(junctionId, transcripts, strand) {
  const { intronStart, intronEnd } = junctionIdToIntron(junctionId);
  const groups = new Map();
  transcripts.forEach((t) => {
    const n = t.exons.length;
    const k = t.exons.findIndex((e, i) => (
      e.end === intronStart - 1 && t.exons[i + 1]?.start === intronEnd + 1
    ));
    if (k === -1) return;
    const num = (i) => (strand === "-" ? n - i : i + 1);
    const name = `exon${num(k)}:exon${num(k + 1)}`;
    groups.set(name, [...(groups.get(name) ?? []), t.displayName]);
  });
  return Array.from(groups, ([name, txs]) => ({ name, transcripts: txs }));
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
//
// Draws no hover state: the hovered junction's arc/dot styling is applied
// by applyMainModelHover, which restyles the existing elements. Redrawing on
// every hover would delete the element under the pointer before its
// mouseout ran, leaving its tooltip and highlight stuck on screen.
function drawMainModel(dom, { width, exons, junctions, strand, gene, geneId, textColor, primaryColor, tejsByJunctionId = NO_TEJS, onHoverJunction, onHoverExon, onJunctionTip, container }) {
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

  // Intron backbone from the first exon to the last, centered on the exon
  // bar (GtexGeneModel's hardcoded 15px height) -- GtexGeneModel only draws
  // this line for isoform rows, not the main model. Inserted before the
  // first exon rect so it renders behind the exons.
  const mainExonData = g.selectAll(".exon-curated").data()
    .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.w));
  if (mainExonData.length > 1) {
    g.insert("line", ".exon")
      .attr("class", "intron")
      .attr("x1", d3.min(mainExonData, (d) => d.x))
      .attr("x2", d3.max(mainExonData, (d) => d.x + d.w))
      .attr("y1", exonY + 15 / 2)
      .attr("y2", exonY + 15 / 2)
      .attr("stroke", textColor)
      .attr("pointer-events", "none");
  }

  // Centered on the exon bar (GtexGeneModel's hardcoded 15px height).
  drawStrandChevrons(g, {
    exonData: g.selectAll(".exon-curated").data(),
    innerWidth: Math.max(width - PADDING.left - PADDING.right, 0),
    centerY: exonY + 15 / 2,
    strand,
    color: textColor,
  });

  // gtex-viz's own stylesheet sets junc-curve's fill to none; without it the
  // browser fills the area the arc implicitly closes over with black.
  g.selectAll(".junc-curve").style("fill", "none");

  // Hovering a junction's arc/dot here, or a column in the heatmap (via
  // hoveredJunctionId), highlights the same junction in both places.
  // Hovering it here also reports the pointer position (relative to
  // `container`, like the exon tooltip) via onJunctionTip, for the junction
  // name tooltip -- on mousemove, so the tooltip follows the pointer.
  const tipHandlers = (sel, junctionId) => sel
    .on("mouseover", () => onHoverJunction?.(junctionId))
    .on("mousemove", (event) => {
      if (!junctionId) return;
      const [x, y] = d3.pointer(event, container ?? dom.node());
      onJunctionTip?.({ junctionId, x, y });
    })
    .on("mouseout", () => {
      onHoverJunction?.(null);
      onJunctionTip?.(null);
    });
  g.selectAll(".junc-curve").each(function () {
    const junctionId = junctionIdOf(this, "junc-curve");
    d3.select(this)
      .style("cursor", junctionId ? "pointer" : null)
      .call(tipHandlers, junctionId);
  });
  g.selectAll(".junc").each(function () {
    const junctionId = junctionIdOf(this, "junc");
    d3.select(this)
      .style("cursor", junctionId ? "pointer" : null)
      .call(tipHandlers, junctionId);
  });

  applyMainModelHover(dom, { hoveredJunctionId: null, tejsByJunctionId, primaryColor });
}

// Styles the main model's junction arcs/dots for the hovered junction (or
// none, for the base look) on a model already drawn by drawMainModel,
// without redrawing it. A TEJ's dot (junctions in the tej table) is always
// filled primaryColor, the same blue as the heatmap's TEJ labels/bars; its
// arc and hover styling are otherwise the same as any junction's.
function applyMainModelHover(dom, { hoveredJunctionId, tejsByJunctionId = NO_TEJS, primaryColor }) {
  dom.selectAll(".junc-curve").each(function () {
    const junctionId = junctionIdOf(this, "junc-curve");
    const isHovered = junctionId !== null && junctionId === hoveredJunctionId;
    d3.select(this)
      .style("stroke", isHovered ? primaryColor : JUNC_CURVE_COLOR)
      .style("stroke-width", isHovered ? 3 : 1);
  });
  dom.selectAll(".junc").each(function () {
    const junctionId = junctionIdOf(this, "junc");
    const isHovered = junctionId !== null && junctionId === hoveredJunctionId;
    const isTej = junctionId !== null && tejsByJunctionId.has(junctionId);
    d3.select(this)
      .attr("r", isHovered ? 6 : 4)
      .style("fill", isHovered || isTej ? primaryColor : JUNC_DOT_COLOR);
  });
}

// Per-transcript isoform rows, drawn into their own <svg>/<g> below the main
// model's biotype Chip filter -- no junction arcs (isIsoform skips that
// branch in GtexGeneModel.render() entirely). Each row gets its own
// GtexGeneModel instance built from the SAME merged exon list and the same
// inner width as drawMainModel above, so setXscale() recomputes an
// identical scale every time and each transcript's exons land at the same x
// as the matching exon in the main model.
//
// The hovered junction's intron highlight is applied afterwards by
// applyTranscriptRowsHover, without redrawing the rows.
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
    const rowG = g.append("g").attr("class", "tx-row").attr("transform", `translate(0, ${rowTop})`);
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

    const exonData = rowG.selectAll(".exon-curated").data();
    drawStrandChevrons(rowG, { exonData, innerWidth, centerY: txBarCenter, strand, color: textColor });

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

// While a junction is hovered (hoveredJunctionId, shared with the heatmap
// and the main model's arcs), every row whose transcript splices exactly
// that intron -- two consecutive exons ending at intron_start - 1 and
// starting at intron_end + 1 -- gets the intron highlighted. The junction's
// name in each transcript is shown in the main model's arc tooltip (see
// junctionNameGroups) rather than on the rows. Works on rows already drawn
// by drawTranscriptRows: replaces only the highlight lines, which ignore
// the pointer, so the exons under the mouse are never touched.
function applyTranscriptRowsHover(dom, { hoveredJunctionId, primaryColor }) {
  dom.selectAll(".tx-junction-hl").remove();
  if (!hoveredJunctionId) return;
  const { intronStart, intronEnd } = junctionIdToIntron(hoveredJunctionId);
  const txBarCenter = TX_EXON_BAR_HEIGHT / 2;
  dom.selectAll(".tx-row").each(function () {
    const rowG = d3.select(this);
    const exonData = rowG.selectAll(".exon-curated").data();
    const left = exonData.find((d) => d.chromEnd === intronStart - 1);
    const right = exonData.find((d) => d.chromStart === intronEnd + 1);
    if (!left || !right || Math.abs(left.exonNumber - right.exonNumber) !== 1
        || !Number.isFinite(left.x) || !Number.isFinite(right.x)) return;
    rowG.append("line")
      .attr("class", "tx-junction-hl")
      .attr("x1", left.x + left.w)
      .attr("x2", right.x)
      .attr("y1", txBarCenter)
      .attr("y2", txBarCenter)
      .attr("stroke", primaryColor)
      .attr("stroke-width", 3)
      .attr("pointer-events", "none");
  });
}

const GeneModelGtex = forwardRef(function GeneModelGtex(
  { gene, junctionData, width, hoveredJunctionId = null, onHoverJunction, metric, minExpressionValue, hiddenGroups, tejsByJunctionId = NO_TEJS },
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
  // { junctionId, x, y } while a main-model arc/dot is hovered, for the
  // junction name tooltip.
  const [junctionTip, setJunctionTip] = useState(null);
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
      setJunctionTip(null);
      setTranscriptRows([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFetchError(null);
    setHoveredExon(null);
    setJunctionTip(null);
    (async () => {
      try {
        const ensg = await fetchEnsemblGeneId(gene, controller.signal);
        if (!ensg) throw new Error("No ENSG ID found");

        const geneData = await fetchEnsemblGene(ensg, controller.signal);
        if (!geneData) throw new Error("Gene not found in Ensembl");

        const strandVal = geneData.strand === "-" ? "-" : "+";
        const { transcripts } = geneData;

        // Falls back to every transcript if the exclusion would leave none
        // (e.g. a gene whose only annotated transcripts are all flagged) --
        // showing a degraded-transcript exon footprint beats showing none.
        const exonTranscripts = transcripts.filter((t) => !EXCLUDED_TRANSCRIPT_BIOTYPES.has(t.biotype));
        const rawExons = (exonTranscripts.length > 0 ? exonTranscripts : transcripts).flatMap((t) => t.exons);
        if (rawExons.length === 0) throw new Error("No exon coordinates returned for transcripts");

        setStrand(strandVal);
        setExons(toGeneModelExons(mergeExonIntervals(rawExons), strandVal));
        setGeneId(ensg);

        // Per-transcript rows, canonical first then ascending by the
        // "-201"-style transcript number Ensembl bakes into the transcript
        // symbol -- unlike the merged exon union above, every transcript is
        // shown here (the biotype Chip filter below is the user-facing
        // control for that).
        const txRows = transcripts
          .filter((t) => t.exons.length > 0)
          .map((t) => ({
            id: t.id,
            displayName: t.symbol,
            biotype: t.biotype,
            exons: t.exons.map(({ start, end }) => ({ start, end })),
            isCanonical: t.isCanonical,
          }))
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

  // Junction name tooltip content, from the transcripts currently shown
  // (biotype Chip filter), so it matches the rows highlighted below.
  const junctionTipContent = useMemo(() => {
    if (!junctionTip) return null;
    const groups = junctionNameGroups(junctionTip.junctionId, visibleTranscriptRows, strand);
    return {
      coords: junctionIdToDisplayCoords(junctionTip.junctionId),
      groups,
      used: groups.reduce((n, g) => n + g.transcripts.length, 0),
    };
  }, [junctionTip, visibleTranscriptRows, strand]);

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
      tejsByJunctionId,
      onHoverJunction,
      onHoverExon: setHoveredExon,
      onJunctionTip: setJunctionTip,
      container: containerRef.current,
    });
  }, [exons, junctions, strand, gene, geneId, width, onHoverJunction, tejsByJunctionId,
      theme.palette.text.primary, theme.palette.primary.main]);

  // Hover styling only -- runs after the draw effect above. Lists the draw
  // effect's dependencies too, so it re-applies after every redraw (which
  // resets the arcs/dots), not just when the hovered junction changes.
  useEffect(() => {
    if (!svgRef.current || !exons || exons.length === 0) return;
    applyMainModelHover(d3.select(svgRef.current), {
      hoveredJunctionId,
      tejsByJunctionId,
      primaryColor: theme.palette.primary.main,
    });
  }, [hoveredJunctionId, exons, junctions, strand, gene, geneId, width, onHoverJunction, tejsByJunctionId,
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

  // Same pattern as the main model's hover effect above, for the rows.
  useEffect(() => {
    if (!txSvgRef.current || !exons || exons.length === 0) return;
    applyTranscriptRowsHover(d3.select(txSvgRef.current), {
      hoveredJunctionId,
      primaryColor: theme.palette.primary.main,
    });
  }, [hoveredJunctionId, exons, strand, width, visibleTranscriptRows,
      theme.palette.text.primary, theme.palette.primary.main]);

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
        tejsByJunctionId,
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
  }), [exons, junctions, strand, gene, geneId, visibleTranscriptRows, tejsByJunctionId, theme.palette.text.primary, theme.palette.primary.main]);

  if (!gene) return null;

  return (
    // Leaving the gene model always clears its tooltips and the hovered
    // junction -- a fallback in case an element's own mouseout didn't fire.
    <Box
      ref={containerRef}
      sx={{ position: "relative" }}
      onMouseLeave={() => {
        setHoveredExon(null);
        setJunctionTip(null);
        onHoverJunction?.(null);
      }}
    >
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
      {junctionTip && junctionTipContent && (
        <Box
          sx={{
            position: "absolute",
            left: junctionTip.x,
            top: junctionTip.y,
            // Flips to the pointer's left on the right half of the plot so
            // it doesn't run past the panel's edge.
            transform: junctionTip.x > width / 2 ? "translate(calc(-100% - 12px), -12px)" : "translate(12px, -12px)",
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
            maxWidth: 380,
            zIndex: 1,
          }}
        >
          <b>
            {junctionTipContent.coords.chr}:{junctionTipContent.coords.start.toLocaleString()}–{junctionTipContent.coords.end.toLocaleString()}
          </b>
          <Box sx={{ color: "text.secondary" }}>
            {junctionTipContent.used > 0
              ? `In ${junctionTipContent.used} of ${visibleTranscriptRows.length} shown transcripts`
              : "Not in any shown transcript"}
          </Box>
          {junctionTipContent.groups.length > 0 && (
            <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 1.25 }}>
              {junctionTipContent.groups.map((g) => (
                <Fragment key={g.name}>
                  <Box sx={{ fontFamily: "monospace", fontWeight: 700, color: "primary.main", whiteSpace: "nowrap" }}>
                    {g.name}
                  </Box>
                  <Box>{g.transcripts.join(", ")}</Box>
                </Fragment>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
});

export default GeneModelGtex;
