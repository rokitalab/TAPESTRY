import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Box, CircularProgress, Paper, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import * as d3 from "d3";
import GtexGeneModel from "./lib/GtexGeneModel";

const SVG_HEIGHT = 200;
const PADDING = { top: 10, right: 60, bottom: 10, left: 60 };

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

export default function GeneModelGtex({ gene, junctionData }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [exons, setExons] = useState(null);
  const [strand, setStrand] = useState("+");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

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
  // deduped down to one entry per junction.
  const junctions = useMemo(() => {
    const seen = new Map();
    junctionData.forEach((d) => {
      if (seen.has(d.junctionId)) return;
      const [, start, end] = d.junctionId.split("_");
      seen.set(d.junctionId, { junctionId: d.junctionId, chromStart: Number(start), chromEnd: Number(end) });
    });
    return Array.from(seen.values());
  }, [junctionData]);

  useEffect(() => {
    if (!svgRef.current || !exons || exons.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const dom = svg.append("g").attr("transform", `translate(${PADDING.left},${PADDING.top})`);

    const model = new GtexGeneModel(
      { strand, geneSymbol: gene },
      exons.map((e) => ({ ...e })),
      exons.map((e) => ({ ...e })),
      junctions.map((j) => ({ ...j }))
    );

    model.render(dom, {
      w: Math.max(containerWidth - PADDING.left - PADDING.right, 0),
      h: SVG_HEIGHT - PADDING.top - PADDING.bottom,
      labelOn: "left",
    });

    dom.selectAll(".exon").style("fill", theme.palette.text.primary);
    dom.selectAll(".exon-curated").style("fill", theme.palette.primary.main);
    dom.selectAll("#modelInfo, #modelLabel").attr("fill", theme.palette.text.primary);
  }, [exons, junctions, strand, gene, containerWidth, theme.palette.text.primary, theme.palette.primary.main]);

  if (!gene) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
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
        <Box ref={containerRef} sx={{ width: "100%", overflowX: "auto" }}>
          <svg ref={svgRef} width={containerWidth} height={SVG_HEIGHT} style={{ display: "block" }} />
        </Box>
      )}
    </Paper>
  );
}
