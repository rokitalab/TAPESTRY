import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Alert, Box, CircularProgress, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import JunctionExpressionHeatmap from "../components/JunctionExpressionHeatmap";
import ExonVis from "../components/ExonVis";
import GeneModelGtex from "../components/GeneModelGtex";

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

  // Clears stale data when the gene is cleared, mirroring TranscriptVis's
  // geneID-cleared handling: done during render (comparing against the gene
  // seen on the previous render) rather than as a setState call inside the
  // fetch effect below.
  const [prevGene, setPrevGene] = useState(gene);
  if (gene !== prevGene) {
    setPrevGene(gene);
    if (!gene) setData([]);
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
          <JunctionExpressionHeatmap gene={gene} data={data} />
          <GeneModelGtex gene={gene} junctionData={data} />
          <ExonVis gene={gene} exonID={null} eventType="" strand="+" />
        </>
      ) : (
        <Alert severity="info">Enter a gene symbol to view its junction expression heatmap.</Alert>
      )}
    </Stack>
  );
}
