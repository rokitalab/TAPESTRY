import { useEffect, useMemo, useState } from "react";
import { Box, Paper, Skeleton, Tooltip, Typography, Stack } from "@mui/material";
import { alpha } from "@mui/material/styles";
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
  "A3SS-":            "Alternative 3'SS (short)",
  "A3SS+":            "Alternative 3'SS (long)",
  "A5SS-":            "Alternative 5'SS (short)",
  "A5SS+":            "Alternative 5'SS (long)",
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

const HISTOLOGY_TABLE_TH_SX = {
  textAlign: "left",
  fontWeight: 700,
  color: "text.secondary",
  fontSize: "0.62rem",
  textTransform: "uppercase",
  letterSpacing: "0.03em",
  pb: "2px",
  borderBottom: "1px solid",
  borderColor: "divider",
  position: "sticky",
  top: 0,
  bgcolor: "background.paper",
};

function HistologiesCard({ data, total, visibleCount = 7 }) {
  const [expanded, setExpanded] = useState(false);
  const visible = data.slice(0, visibleCount);
  const rest = data.slice(visibleCount);
  const restTotal = rest.reduce((s, d) => s + d.value, 0);

  const nameSx = (isLast) => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    py: "3px",
    borderBottom: isLast ? "none" : "1px solid",
    borderColor: "divider",
  });
  const numSx = (isLast) => ({
    textAlign: "right",
    py: "3px",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
    borderBottom: isLast ? "none" : "1px solid",
    borderColor: "divider",
  });

  const samplesCell = (value) => (
    <>
      {value.toLocaleString()}{" "}
      <Box component="span" sx={{ color: "text.disabled" }}>
        ({((value / total) * 100).toFixed(1)}%)
      </Box>
    </>
  );

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, pb: 2, borderRadius: 2, flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}
    >
      <Typography
        variant="subtitle2"
        sx={{ fontWeight: 700, mb: "-18px", position: "relative", zIndex: 2 }}
      >
        Histologies
      </Typography>
      <Box sx={{ overflowY: "auto", maxHeight: expanded ? 230 : "none" }}>
        <Box component="table" sx={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "0.73rem" }}>
          <Box component="thead">
            <Box component="tr">
              <Box component="th" sx={HISTOLOGY_TABLE_TH_SX} />
              <Box component="th" sx={{ ...HISTOLOGY_TABLE_TH_SX, textAlign: "right", width: 92 }}>Samples</Box>
              <Box component="th" sx={{ ...HISTOLOGY_TABLE_TH_SX, textAlign: "right", width: 48 }}>TEJs</Box>
            </Box>
          </Box>
          <Box component="tbody">
            {visible.map((d, i) => {
              const isLast = !expanded && rest.length === 0 && i === visible.length - 1;
              return (
                <Box component="tr" key={d.label}>
                  <Box component="td" sx={nameSx(isLast)}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: d.color, flexShrink: 0 }} />
                    {d.label}
                  </Box>
                  <Box component="td" sx={numSx(isLast)}>{samplesCell(d.value)}</Box>
                  <Box component="td" sx={numSx(isLast)}>{d.tejs.toLocaleString()}</Box>
                </Box>
              );
            })}
            {!expanded && rest.length > 0 && (
              <Box
                component="tr"
                onClick={() => setExpanded(true)}
                sx={{
                  cursor: "pointer",
                  fontStyle: "italic",
                  color: "text.disabled",
                  "&:hover": { color: "text.primary" },
                }}
              >
                <Box component="td" sx={nameSx(true)}>
                  Other ({rest.length} histologies) <Box component="span" sx={{ fontStyle: "normal" }}>&#8250;</Box>
                </Box>
                <Box component="td" sx={numSx(true)}>{samplesCell(restTotal)}</Box>
                {/* Distinct TEJs can't be summed across histologies without double counting */}
                <Box component="td" sx={numSx(true)} />
              </Box>
            )}
          </Box>
          {expanded && (
            <Box component="tbody">
              {rest.map((d, i) => (
                <Box component="tr" key={d.label}>
                  <Box component="td" sx={nameSx(i === rest.length - 1)}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: d.color, flexShrink: 0 }} />
                    {d.label}
                  </Box>
                  <Box component="td" sx={numSx(i === rest.length - 1)}>{samplesCell(d.value)}</Box>
                  <Box component="td" sx={numSx(i === rest.length - 1)}>{d.tejs.toLocaleString()}</Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

function HorizBarChart({ data, labelWidth = 160, labelSx, formatValue = (v) => v.toLocaleString() }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <Box>
      {data.map((d, i) => (
        <Tooltip key={i} title={`${d.label}: ${formatValue(d.value)}`} placement="right" arrow>
          <Stack direction="row" alignItems="center" spacing="5px" sx={{ mb: 0.5, cursor: "default" }}>
            <Typography
              variant="caption"
              noWrap
              sx={{ width: labelWidth, flexShrink: 0, textAlign: "right", lineHeight: 1.2, pr: 0.75, ...labelSx }}
            >
              {d.label}
            </Typography>
            <Box sx={{ flex: 1, height: 14, bgcolor: "action.hover", borderRadius: 0.5, overflow: "hidden" }}>
              <Box
                sx={{
                  height: "100%",
                  width: `${(d.value / max) * 100}%`,
                  bgcolor: d.color,
                  borderRadius: 0.5,
                }}
              />
            </Box>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ width: 38, flexShrink: 0, textAlign: "right" }}
            >
              {formatValue(d.value)}
            </Typography>
          </Stack>
        </Tooltip>
      ))}
    </Box>
  );
}

function SpecificityCard({ total, oncofetal }) {
  const pct = total > 0 ? Math.round((oncofetal / total) * 1000) / 10 : 0;
  const oncofetalColor = SPECIFICITY_COLORS["Oncofetal"];
  const trackColor = SPECIFICITY_COLORS["Tumor-specific"];

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        pb: 2,
        borderRadius: 2,
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        Oncofetal Share of TEJs
      </Typography>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <Box>
          <Typography sx={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1 }}>
            {total.toLocaleString()}
          </Typography>
          <Typography sx={{ fontSize: "1.05rem", fontWeight: 500, color: "text.secondary", mt: 0.5 }}>
            Tumor-enriched Junctions
          </Typography>
        </Box>

        <Box
          sx={{
            position: "relative",
            height: 12,
            bgcolor: alpha(trackColor, 0.18),
            borderRadius: 999,
            overflow: "hidden",
            my: 2,
          }}
        >
          <Box
            sx={{
              position: "absolute",
              right: 0,
              top: 0,
              height: "100%",
              width: `${pct}%`,
              bgcolor: oncofetalColor,
              borderRadius: "0 999px 999px 0",
            }}
          />
        </Box>

        <Box sx={{ textAlign: "right" }}>
          <Typography sx={{ fontSize: "2rem", fontWeight: 800, lineHeight: 1, color: oncofetalColor }}>
            {oncofetal.toLocaleString()}
          </Typography>
          <Typography sx={{ fontSize: "1.05rem", fontWeight: 500, color: oncofetalColor, mt: 0.5 }}>
            Oncofetal ({pct}%)
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

function SpliceEventsCard({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, pb: 2, borderRadius: 2, flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column" }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
        TEJ Splice Events
      </Typography>

      <Stack direction="row" sx={{ height: 20, borderRadius: 1, overflow: "hidden", mb: 2.25 }}>
        {data.map((d, i) => (
          <Box
            key={i}
            sx={{
              width: `${(d.value / total) * 100}%`,
              bgcolor: d.color,
              borderRight: i < data.length - 1 ? "2px solid" : "none",
              borderColor: "background.paper",
            }}
          />
        ))}
      </Stack>

      <Stack spacing={0}>
        {data.map((d, i) => (
          <Stack key={i} direction="row" alignItems="center" spacing={1}>
            <Box sx={{ width: 9, height: 9, borderRadius: "2px", bgcolor: d.color, flexShrink: 0 }} />
            <Typography sx={{ fontSize: "0.8rem", flex: 1, minWidth: 0 }} noWrap>
              {d.label}
            </Typography>
            <Typography sx={{ fontSize: "0.8rem", color: "text.secondary", flexShrink: 0 }}>
              {d.value.toLocaleString()}{" "}
              <Box component="span" sx={{ color: "text.disabled" }}>
                ({((d.value / total) * 100).toFixed(1)}%)
              </Box>
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}

function BarChartCard({ title, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, flex: "1 1 0", minWidth: 0 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
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
    Promise.allSettled([
      fetchJson("/summary-histology-view/"),
      fetchJson("/summary-gene-view/"),
      fetchJson("/tej-view/"),
    ])
      .then(([histResult, geneResult, tejResult]) => {
        if (histResult.status === "fulfilled") setHistologyData(histResult.value);
        if (geneResult.status === "fulfilled") setGeneData(geneResult.value);
        if (tejResult.status  === "fulfilled") setTejData(tejResult.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(
    () => ({
      histologies: histologyData.length,
      junctions: tejData.length,
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
          tejs: r.num_junctions,
          color: HISTOLOGY_COLORS[r.plot_group] ?? "#b5b5b5",
        })),
    [histologyData]
  );

  const oncofetalCount = useMemo(
    () =>
      tejData.filter((row) => String(row.consensus_specificity).toLowerCase() === "oncofetal")
        .length,
    [tejData]
  );

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

  const tejsPerSample = useMemo(
    () =>
      [...histologyData]
        .filter((r) => r.num_samples > 0)
        .map((r) => ({
          label: r.plot_group,
          value: r.num_junctions / r.num_samples,
          color: HISTOLOGY_COLORS[r.plot_group] ?? "#b5b5b5",
        }))
        .sort((a, b) => b.value - a.value),
    [histologyData]
  );

  const topGenes = useMemo(
    () =>
      [...geneData]
        .filter((r) => r.num_junctions >= 10)
        .sort((a, b) => b.num_junctions - a.num_junctions)
        .map((r) => ({ label: r.gene, value: r.num_junctions, color: "#4e79a7" })),
    [geneData]
  );

  const header = (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>
        TEJ Landscape
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Tumor-enriched junctions across pediatric CNS tumor histologies.
      </Typography>
    </Box>
  );

  if (loading) return (
    <Box sx={{ mt: 5 }}>
      {header}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} variant="rounded" height={72} sx={{ flex: "1 1 0", borderRadius: 2 }} />
        ))}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} variant="rounded" height={220} sx={{ flex: "1 1 0", borderRadius: 2 }} />
        ))}
      </Stack>
      <Stack direction="row" spacing={2}>
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} variant="rounded" height={300} sx={{ flex: "1 1 0", borderRadius: 2 }} />
        ))}
      </Stack>
    </Box>
  );

  if (histologyData.length === 0) return null;

  return (
    <Box sx={{ mt: 5 }}>
      {header}

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <StatCard label="Histologies" value={totals.histologies} />
        <StatCard label="TEJs"        value={totals.junctions} />
        <StatCard label="Genes"       value={totals.genes} />
        <StatCard label="Samples"     value={totals.samples} />
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <HistologiesCard data={samplesByHistology} total={totals.samples} />
        <SpecificityCard total={totals.junctions} oncofetal={oncofetalCount} />
        <SpliceEventsCard data={tejByEventType} />
      </Stack>

      <Stack direction="row" spacing={2}>
        <BarChartCard title="TEJs per Sample by Histology">
          <HorizBarChart
            data={tejsPerSample}
            labelWidth={190}
            formatValue={(v) => v.toFixed(1)}
          />
        </BarChartCard>
        <BarChartCard title="Top Genes by TEJ Count">
          <Box sx={{ overflowY: "auto", maxHeight: 400 }}>
            <HorizBarChart data={topGenes} labelWidth={80} labelSx={{ fontStyle: "italic" }} />
          </Box>
        </BarChartCard>
      </Stack>
    </Box>
  );
}
