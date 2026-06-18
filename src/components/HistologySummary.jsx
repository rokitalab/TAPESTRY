import { useEffect, useMemo, useState } from "react";
import { Box, Grid, Paper, Typography, Stack } from "@mui/material";

const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");

const STATUS_COLORS = ["#4e79a7", "#f28e2b", "#e15759"];
const SPLICE_COLORS = ["#4e79a7", "#76b7b2", "#f28e2b", "#e15759", "#59a14f", "#edc948", "#b07aa1"];

function StatCard({ label, value }) {
  return (
    <Paper
      variant="outlined"
      sx={{ px: 3, py: 2, borderRadius: 2, textAlign: "center", flex: "1 1 0" }}
    >
      <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
        {value.toLocaleString()}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}

export default function HistologySummary() {
  const [histologyData, setHistologyData] = useState([]);
  const [geneData, setGeneData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchJson = (path) =>
    fetch(`${API_BASE}${path}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

  useEffect(() => {
    Promise.all([fetchJson("/summary-histology-view/"), fetchJson("/summary-gene-view/")])
      .then(([histologyRows, geneRows]) => {
        setHistologyData(histologyRows);
        setGeneData(geneRows);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => ({
    histologies: histologyData.length,
    // A junction can recur across multiple histologies, so summing
    // num_junctions from the per-histology view double-counts it. Each
    // junction belongs to exactly one gene, so summing from the per-gene
    // view instead gives the correct distinct total. Same reasoning for
    // genes: count distinct genes directly (one row per gene) rather than
    // summing num_genes per histology.
    junctions: geneData.reduce((s, r) => s + r.num_junctions, 0),
    genes: geneData.length,
    samples: histologyData.reduce((s, r) => s + r.num_samples, 0),
  }), [histologyData, geneData]);

  if (loading || histologyData.length === 0) return null;

  return (
    <Box sx={{ mt: 5 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
        TEJ Landscape
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Tumor-exclusive junctions across pediatric CNS tumor histologies.
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <StatCard label="Histologies" value={totals.histologies} />
        <StatCard label="TEJs"        value={totals.junctions} />
        <StatCard label="Genes"       value={totals.genes} />
        <StatCard label="Samples"     value={totals.samples} />
      </Stack>
    </Box>
  );
}

