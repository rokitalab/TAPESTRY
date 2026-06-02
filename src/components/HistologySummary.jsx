import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Grid, Paper, Typography, Stack, useTheme } from "@mui/material";
import { histologyColor } from "../histologyColors";

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
  const theme = useTheme();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/summary-histology-view/`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(
    () => [...data].sort((a, b) => b.num_junctions - a.num_junctions),
    [data]
  );

  const totals = useMemo(() => ({
    histologies: data.length,
    junctions: data.reduce((s, r) => s + r.num_junctions, 0),
    genes:      data.reduce((s, r) => s + r.num_genes, 0),
    samples:    data.reduce((s, r) => s + r.num_samples, 0),
  }), [data]);

  if (loading || data.length === 0) return null;

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

