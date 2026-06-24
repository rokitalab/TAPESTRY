import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Alert, Box, CircularProgress, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import JunctionExpressionHeatmap from "../components/JunctionExpressionHeatmap";
import GeneModelGtex from "../components/GeneModelGtex";
import { MIN_MEDIAN_CPM } from "../components/lib/junctionExpressionFilter";

const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");

export default function JunctionExpression() {
  const location = useLocation();
  const initialGene = useMemo(
    () => new URLSearchParams(location.search).get("gene") || "",
    [location.search]
  );

  const [geneInput, setGeneInput] = useState(initialGene);
  const [gene, setGene] = useState(initialGene);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  // Shared between the heatmap and the gene model so hovering a junction in
  // either one highlights the matching column/arc in the other.
  const [hoveredJunctionId, setHoveredJunctionId] = useState(null);

  // Shared between the heatmap and the gene model so toggling the metric,
  // the min-CPM slider, or a sample group in Configure Samples changes which
  // junctions count as "expressed" identically in both -- otherwise the
  // heatmap's columns and the gene model's arcs could disagree.
  const [metric, setMetric] = useState("median");
  const [minExpressionValue, setMinExpressionValue] = useState(MIN_MEDIAN_CPM);
  const [hiddenGroups, setHiddenGroups] = useState(new Set());

  // Shared between the heatmap and the gene model so both SVGs measure off
  // the same container and always agree on width. Tracked as state (rather
  // than a plain ref read in a mount-only effect) because the Box unmounts
  // and remounts across the loading/error/gene ternary below -- a ref
  // wouldn't reattach the observer to the new node.
  const [plotContainerEl, setPlotContainerEl] = useState(null);
  // Lets the heatmap's download button pull in a matching export of the
  // gene model and stack both on one canvas (see JunctionExpressionHeatmap's
  // buildExportSvg).
  const geneModelRef = useRef(null);
  const [plotWidth, setPlotWidth] = useState(900);
  useEffect(() => {
    if (!plotContainerEl) return;
    const ro = new ResizeObserver(([entry]) => setPlotWidth(entry.contentRect.width));
    ro.observe(plotContainerEl);
    return () => ro.disconnect();
  }, [plotContainerEl]);

  // Clears stale data when the gene is cleared, mirroring TranscriptVis's
  // geneID-cleared handling: done during render (comparing against the gene
  // seen on the previous render) rather than as a setState call inside the
  // fetch effect below.
  const [prevGene, setPrevGene] = useState(gene);
  if (gene !== prevGene) {
    setPrevGene(gene);
    if (!gene) setData([]);
    setHoveredJunctionId(null);
  }

  useEffect(() => {
    if (!gene) return;
    let active = true;
    // Kicking off loading/error state for an in-flight fetch -- the canonical
    // "fetch data in an effect" pattern from React's own docs. There's no
    // render-derivable substitute for "a request is currently in flight",
    // so this rule is intentionally not satisfiable here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setFetchError(null);
    fetch(`${API_BASE}/gene-junction-expression/?gene=${encodeURIComponent(gene)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (active) setData(json.medianJunctionExpression ?? []);
      })
      .catch((e) => {
        if (active) setFetchError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [gene]);

  const submitGene = () => setGene(geneInput.trim());

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
          Junction Expression
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Median junction CPM per histology/cohort group for every splice junction in a gene.
        </Typography>
        <Divider sx={{ mb: 2 }} />
        <TextField
          label="Gene"
          placeholder='e.g. "EGFR"'
          value={geneInput}
          size="small"
          onChange={(e) => setGeneInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") submitGene(); }}
          sx={{ maxWidth: 320 }}
        />
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
          <CircularProgress />
        </Box>
      ) : fetchError ? (
        <Alert severity="error">Failed to load junction expression: {fetchError}</Alert>
      ) : gene ? (
        <>
          <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
            <Box ref={setPlotContainerEl} sx={{ width: "100%" }}>
              <JunctionExpressionHeatmap
                gene={gene}
                data={data}
                width={plotWidth}
                geneModelRef={geneModelRef}
                hoveredJunctionId={hoveredJunctionId}
                onHoverJunction={setHoveredJunctionId}
                metric={metric}
                onMetricChange={setMetric}
                minExpressionValue={minExpressionValue}
                onMinExpressionValueChange={setMinExpressionValue}
                hiddenGroups={hiddenGroups}
                onHiddenGroupsChange={setHiddenGroups}
              />
              {/* Pulls the gene model up into the heatmap's bottom margin,
                  which is sized for its rotated junction-coordinate labels
                  and has slack below them -- closes the visual gap between
                  the two plots without touching that margin (and risking
                  clipping the labels). */}
              <Box sx={{ mt: "-20px" }}>
                <GeneModelGtex
                  ref={geneModelRef}
                  gene={gene}
                  junctionData={data}
                  width={plotWidth}
                  hoveredJunctionId={hoveredJunctionId}
                  onHoverJunction={setHoveredJunctionId}
                  metric={metric}
                  minExpressionValue={minExpressionValue}
                  hiddenGroups={hiddenGroups}
                />
              </Box>
            </Box>
          </Paper>
        </>
      ) : (
        <Alert severity="info">Enter a gene symbol to view its junction expression heatmap.</Alert>
      )}
    </Stack>
  );
}
