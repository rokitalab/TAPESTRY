import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Alert, Box, CircularProgress, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import * as d3 from "d3";
import GtexGeneModel from "./lib/GtexGeneModel";
import { selectExpressedJunctionIds } from "./lib/junctionExpressionFilter";

const SVG_HEIGHT = 200;
const PADDING = { top: 10, right: 20, bottom: 10, left: 100 };

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

// Ensembl's canonical-transcript exons don't come with an exonNumber, and
// GtexGeneModel only uses exonNumber to measure exon-to-exon distance for
// junction arc height -- genomic order (regardless of strand, per the
// class's own header comment) is sufficient for that.
function toGeneModelExons(canonExons) {
  return canonExons
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((e, i) => ({
      chromStart: e.start,
      chromEnd: e.end,
      exonNumber: i + 1,
      exonId: `exon${i + 1}`,
    }));
}

// Renders exons/junction arcs into `dom` (a d3 selection of an <svg>) --
// shared by the live render effect and buildExportSvg below so the download
// produces exactly what's on screen.
function drawGeneModel(dom, { width, exons, junctions, strand, gene, textColor, primaryColor, hoveredJunctionId, onHoverJunction }) {
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
  g.selectAll("#modelInfo, #modelLabel").attr("fill", textColor);
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

const GeneModelGtex = forwardRef(function GeneModelGtex(
  { gene, junctionData, width, hoveredJunctionId = null, onHoverJunction },
  ref
) {
  const theme = useTheme();
  const svgRef = useRef(null);
  const [exons, setExons] = useState(null);
  const [strand, setStrand] = useState("+");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Same Ensembl lookup ExonVis.jsx uses for canonical-transcript exon
  // coordinates -- this app has no internal exon-coordinate endpoint.
  useEffect(() => {
    if (!gene) {
      setExons(null);
      return;
    }
    const controller = new AbortController();
    const headers = { Accept: "application/json" };
    setLoading(true);
    setFetchError(null);
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
        const canonicalId = geneData?.canonical_transcript ?? null;
        const canon =
          transcripts.find((t) => (t?.id || t?.stable_id) === canonicalId) ||
          transcripts.find((t) => t?.is_canonical) ||
          transcripts[0];
        const rawExons = Array.isArray(canon?.Exon) ? canon.Exon : [];

        const canonExons = rawExons
          .map((e) => ({ start: Number(e.start), end: Number(e.end) }))
          .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end));
        if (canonExons.length === 0) throw new Error("No exon coordinates returned for canonical transcript");

        setStrand(strandVal);
        setExons(toGeneModelExons(canonExons));
      } catch (e) {
        if (e.name !== "AbortError") {
          setFetchError(e.message);
          setExons(null);
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
  // selectExpressedJunctionIds) and deduped to one entry per junction.
  const junctions = useMemo(() => {
    const expressedIds = selectExpressedJunctionIds(junctionData);
    const seen = new Map();
    junctionData.forEach((d) => {
      if (!expressedIds.has(d.junctionId) || seen.has(d.junctionId)) return;
      const [, start, end] = d.junctionId.split("_");
      seen.set(d.junctionId, { junctionId: d.junctionId, chromStart: Number(start), chromEnd: Number(end) });
    });
    return Array.from(seen.values());
  }, [junctionData]);

  useEffect(() => {
    if (!svgRef.current || !exons || exons.length === 0) return;
    drawGeneModel(d3.select(svgRef.current), {
      width,
      exons,
      junctions,
      strand,
      gene,
      textColor: theme.palette.text.primary,
      primaryColor: theme.palette.primary.main,
      hoveredJunctionId,
      onHoverJunction,
    });
  }, [exons, junctions, strand, gene, width, hoveredJunctionId, onHoverJunction,
      theme.palette.text.primary, theme.palette.primary.main]);

  // Lets JunctionExpressionHeatmap.jsx's download button pull in a
  // matching, export-sized copy of the gene model to stack under the
  // heatmap on the same canvas.
  useImperativeHandle(ref, () => ({
    buildExportSvg({ width: exportWidth }) {
      if (!exons || exons.length === 0) return null;
      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.setAttribute("width", exportWidth);
      svgEl.setAttribute("height", SVG_HEIGHT);
      drawGeneModel(d3.select(svgEl), {
        width: exportWidth,
        exons,
        junctions,
        strand,
        gene,
        textColor: theme.palette.text.primary,
        primaryColor: theme.palette.primary.main,
        hoveredJunctionId: null,
        onHoverJunction: () => {},
      });
      return svgEl;
    },
  }), [exons, junctions, strand, gene, theme.palette.text.primary, theme.palette.primary.main]);

  if (!gene) return null;

  return (
    <Box>
      <Typography sx={{ fontWeight: 800, mb: 1 }}>
        Gene Model of {gene} (GTEx style)
      </Typography>
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
          <CircularProgress size={24} />
        </Box>
      ) : fetchError ? (
        <Alert severity="error">Failed to load gene model: {fetchError}</Alert>
      ) : !exons ? null : (
        <svg ref={svgRef} width={width} height={SVG_HEIGHT} style={{ display: "block" }} />
      )}
    </Box>
  );
});

export default GeneModelGtex;
