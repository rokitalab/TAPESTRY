import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Paper, Typography, Stack } from "@mui/material";
import * as d3 from "d3";
import { HISTOLOGY_COLORS } from "../histologyColors";

const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");

// Wong (2011) colorblind-safe palette, matching preference_palette in
// 04-summarize-TEJs/01-summary.Rmd
const EVENT_TYPE_COLORS = {
  "exon inclusion":   "#56B4E9",
  "exon skipping":    "#0072B2",
  "intron retention": "#009E73",
  "A3SS-":            "#E69F00",
  "A3SS+":            "#F0E442",
  "A5SS-":            "#D55E00",
  "A5SS+":            "#CC79A7",
};

const EVENT_TYPE_LABELS = {
  "exon inclusion":   "Exon Inclusion",
  "exon skipping":    "Exon Skipping",
  "intron retention": "Intron Retention",
  "A3SS-":            "Alt 3'SS (short)",
  "A3SS+":            "Alt 3'SS (long)",
  "A5SS-":            "Alt 5'SS (short)",
  "A5SS+":            "Alt 5'SS (long)",
};
const EVENT_TYPE_FALLBACK = ["#4e79a7", "#f28e2b", "#b07aa1", "#ff9da7"];

// NPG palette (scale_fill_npg), matching specificity barplot in 01-summary.Rmd
const SPECIFICITY_COLORS = {
  "Oncofetal":      "#E64B35",
  "Tumor-specific": "#4DBBD5",
  "oncofetal":      "#E64B35",
  "tumor-specific": "#4DBBD5",
};

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

function DonutChart({ data, size = 160 }) {
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);
  const r = size / 2 - 2;
  const ir = r * 0.55;

  const arcs = useMemo(() => {
    if (!data.length) return [];
    const pie = d3.pie().value((d) => d.value).sort(null);
    const arc = d3.arc().innerRadius(ir).outerRadius(r);
    return pie(data).map((slice) => ({
      path: arc(slice),
      color: slice.data.color,
      datum: slice.data,
    }));
  }, [data, r, ir]);

  const onMove = (e, datum) => {
    const rect = containerRef.current.getBoundingClientRect();
    setTooltip({ ...datum, x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 36 });
  };

  return (
    <Box ref={containerRef} sx={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      <svg width={size} height={size}>
        <g transform={`translate(${size / 2},${size / 2})`}>
          {arcs.map((a, i) => (
            <path
              key={i}
              d={a.path}
              fill={a.color}
              stroke="white"
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onMouseMove={(e) => onMove(e, a.datum)}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </g>
      </svg>
      {tooltip && (
        <Paper
          elevation={3}
          sx={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            px: 1.5,
            py: 0.75,
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <Typography variant="caption" display="block" sx={{ fontWeight: 600 }}>
            {tooltip.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            n = {tooltip.value.toLocaleString()}
          </Typography>
        </Paper>
      )}
    </Box>
  );
}

function ChartCard({ title, data, size = 160 }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, flex: "1 1 0", minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      <Stack direction="row" alignItems="flex-start" spacing={2}>
        <DonutChart data={data} size={size} />
        <Box sx={{ overflowY: "auto", maxHeight: size, flex: 1, minWidth: 0 }}>
          {data.map((d, i) => (
            <Stack key={i} direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <Box
                sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: d.color, flexShrink: 0 }}
              />
              <Typography variant="caption" sx={{ lineHeight: 1.3, flex: 1, minWidth: 0 }} noWrap>
                {d.label}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                {d.value.toLocaleString()}
              </Typography>
            </Stack>
          ))}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function HistologySummary() {
  const [histologyData, setHistologyData] = useState([]);
  const [geneData, setGeneData] = useState([]);
  const [tejData, setTejData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchJson = (path) =>
    fetch(`${API_BASE}${path}`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

  useEffect(() => {
    Promise.all([
      fetchJson("/summary-histology-view/"),
      fetchJson("/summary-gene-view/"),
      fetchJson("/tej-view/"),
    ])
      .then(([histologyRows, geneRows, tejRows]) => {
        setHistologyData(histologyRows);
        setGeneData(geneRows);
        setTejData(tejRows);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(
    () => ({
      histologies: histologyData.length,
      junctions: geneData.reduce((s, r) => s + r.num_junctions, 0),
      genes: geneData.length,
      samples: histologyData.reduce((s, r) => s + r.num_samples, 0),
    }),
    [histologyData, geneData]
  );

  const samplesByHistology = useMemo(
    () =>
      [...histologyData]
        .sort((a, b) => b.num_samples - a.num_samples)
        .map((r) => ({
          label: r.plot_group,
          value: r.num_samples,
          color: HISTOLOGY_COLORS[r.plot_group] ?? "#b5b5b5",
        })),
    [histologyData]
  );

  const tejBySpecificity = useMemo(() => {
    const counts = {};
    for (const row of tejData) {
      const key = row.consensus_specificity;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value], i) => ({
        label: `${label} TEJs`,
        value,
        color: SPECIFICITY_COLORS[label] ?? EVENT_TYPE_FALLBACK[i % EVENT_TYPE_FALLBACK.length],
      }));
  }, [tejData]);

  const tejByEventType = useMemo(() => {
    const counts = {};
    for (const row of tejData) {
      counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([label, value], i) => ({
        label: EVENT_TYPE_LABELS[label] ?? label,
        value,
        color: EVENT_TYPE_COLORS[label] ?? EVENT_TYPE_FALLBACK[i % EVENT_TYPE_FALLBACK.length],
      }));
  }, [tejData]);

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

      <Stack direction="row" spacing={2}>
        <ChartCard title="Histologies" data={samplesByHistology} />
        <ChartCard title="Oncofetal vs Tumor-Specific" data={tejBySpecificity} />
        <ChartCard title="TEJ Splice Events" data={tejByEventType} />
      </Stack>
    </Box>
  );
}
