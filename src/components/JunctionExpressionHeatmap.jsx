import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import * as d3 from "d3";
import { HISTOLOGY_COLORS, histologyColor, controlCohortColor } from "../histologyColors";

const MARGIN = { top: 10, right: 20, bottom: 140, left: 220 };
const ROW_HEIGHT = 18;
const MAX_PLOT_HEIGHT = 600;
const MIN_TOTAL_READS = 10;

// Mirrors PlotArea.jsx's evo-devo timepoint progression, so heatmap rows
// follow the same developmental ordering as the rest of the app.
const EVODEVO_TIMEPOINTS = [
  "4 Week Post Conception", "5 Week Post Conception", "6 Week Post Conception",
  "7 Week Post Conception", "8 Week Post Conception", "9 Week Post Conception",
  "10 Week Post Conception", "11 Week Post Conception", "12 Week Post Conception",
  "13 Week Post Conception", "16 Week Post Conception", "18 Week Post Conception",
  "19 Week Post Conception",
  "Neonate", "Infant", "Toddler", "School Age Child", "Adolescent", "Young Adult",
];

// Mirrors PlotArea.jsx's control-cohort facet order, minus Primary Tumors and
// Evo-devo, which are ordered separately in classifyGroup below.
const CONTROL_FACET_ORDER = ["Cell of Origin", "Pediatric Brain", "GTEx <40"];

// Maps a control facet's display name (the parenthetical suffix on
// tissueSiteDetailId, e.g. "Amygdala (GTEx <40)") back to the cohort name
// controlCohortColor expects.
const FACET_TO_COHORT = {
  "Cell of Origin": "Pediatric brain cell type",
  "Pediatric Brain": "Pediatric brain",
  "GTEx <40": "GTEx",
};

// Classifies a tissueSiteDetailId into the same tumor / evo-devo / control
// ordering PlotArea.jsx uses for its groups, working off the string alone
// since the heatmap API has no separate cohort field. Evo-devo's broad
// (Prenatal)/(Postnatal) rollups are dropped (return null) -- the
// per-timepoint rows already cover that ground.
function classifyGroup(id) {
  if (id in HISTOLOGY_COLORS) {
    return { rank: 0, sortA: 0, sortB: 0, label: id, swatchColor: null };
  }

  const evoMatch = id.match(/^(Forebrain|Hindbrain)-(.+)$/);
  if (evoMatch) {
    const [, region, timepoint] = evoMatch;
    const tIdx = EVODEVO_TIMEPOINTS.indexOf(timepoint);
    return {
      rank: 1,
      sortA: tIdx === -1 ? EVODEVO_TIMEPOINTS.length : tIdx,
      sortB: region === "Forebrain" ? 0 : 1,
      label: id,
      swatchColor: null,
    };
  }

  const facetMatch = id.match(/^(.*)\s\(([^()]+)\)$/);
  if (facetMatch) {
    const [, label, facet] = facetMatch;
    if (facet === "Evo-devo") return null;
    const facetIdx = CONTROL_FACET_ORDER.indexOf(facet);
    return {
      rank: 2,
      sortA: facetIdx === -1 ? CONTROL_FACET_ORDER.length : facetIdx,
      sortB: 0,
      label,
      swatchColor: controlCohortColor(FACET_TO_COHORT[facet]),
    };
  }

  return { rank: 3, sortA: 0, sortB: 0, label: id, swatchColor: null };
}

// Row labels sit flush against the left edge of the SVG; the color swatch
// (replacing the "(facet)" suffix for control rows) sits flush against the
// plot's left edge.
const LABEL_X = -MARGIN.left + 8;
const SWATCH_SIZE = 10;
const SWATCH_X = -(SWATCH_SIZE + 10);

// Metrics available for cell coloring/tooltip emphasis, keyed the same as
// the toggle value. `get` reads the field off a gene_junction_summary row
// (median_cpm/mean_cpm/total_reads), defaulting to 0 for group/junction
// combos absent from the API response (never detected in any sample).
const METRICS = {
  median: { label: "Median CPM", get: (rec) => rec?.median ?? 0, fmt: (v) => v.toFixed(3) },
  mean: { label: "Mean CPM", get: (rec) => rec?.mean_cpm ?? 0, fmt: (v) => v.toFixed(3) },
  total: { label: "Total Reads", get: (rec) => rec?.total_reads ?? 0, fmt: (v) => v.toLocaleString() },
};

// Splits a 'chr_start_end' junctionId (the format gtex-viz's parseJunctions
// expects) back into its parts for sorting/display.
function parseJunctionId(junctionId) {
  const [chr, start, end] = junctionId.split("_");
  return { chr, start: Number(start), end: Number(end) };
}

// Ported from gtex-viz's TranscriptBrowser.js: junction cells are colored on
// a log10(value+1) Reds scale. Unlike the GTEx heatmap, rows are plain
// plot_group names ordered alphabetically (as returned by the API) rather
// than dendrogram-clustered tissues, so there's no clustering step here.
// Junctions run along x, plot_groups run along y (rows).
function drawHeatmap(svg, { width, junctions, plotGroups, groupMeta, valueFor, metric, textColor, onHover, onMove, onLeave }) {
  svg.selectAll("*").remove();

  const { get: metricValue } = METRICS[metric];

  const innerWidth = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const innerHeight = plotGroups.length * ROW_HEIGHT;

  const x = d3.scaleBand().domain(junctions.map((j) => j.junctionId)).range([0, innerWidth]).padding(0.05);
  const y = d3.scaleBand().domain(plotGroups).range([0, innerHeight]).padding(0.05);

  const maxLog = d3.max(junctions, (j) =>
    d3.max(plotGroups, (g) => Math.log10(metricValue(valueFor(j.junctionId, g)) + 1))
  ) || 0;
  const color = d3.scaleSequential(d3.interpolateReds).domain([0, maxLog || 1]);

  const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  root.append("g")
    .selectAll("text")
    .data(plotGroups)
    .join("text")
    .attr("x", LABEL_X)
    .attr("y", (g) => y(g) + y.bandwidth() / 2)
    .attr("text-anchor", "start")
    .attr("dominant-baseline", "central")
    .attr("font-size", 11)
    .attr("fill", (g) => histologyColor(g, textColor))
    .text((g) => groupMeta.get(g)?.label ?? g);

  // Color swatch replacing the "(facet)" suffix for control rows, placed
  // flush against the plot's left edge.
  root.append("g")
    .selectAll("rect")
    .data(plotGroups.filter((g) => groupMeta.get(g)?.swatchColor))
    .join("rect")
    .attr("x", SWATCH_X)
    .attr("y", (g) => y(g) + y.bandwidth() / 2 - SWATCH_SIZE / 2)
    .attr("width", SWATCH_SIZE)
    .attr("height", SWATCH_SIZE)
    .attr("rx", 2)
    .attr("fill", (g) => groupMeta.get(g).swatchColor);

  root.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .selectAll("text")
    .data(junctions)
    .join("text")
    .attr("transform", (j) => `translate(${x(j.junctionId) + x.bandwidth() / 2}, 10) rotate(55)`)
    .attr("text-anchor", "start")
    .attr("font-size", 11)
    .attr("font-family", "monospace")
    .attr("fill", textColor)
    .text((j) => `${j.start.toLocaleString()}-${j.end.toLocaleString()}`);

  const cells = root.append("g")
    .selectAll("g")
    .data(plotGroups)
    .join("g")
    .attr("transform", (g) => `translate(0,${y(g)})`);

  cells.selectAll("rect")
    .data((g) => junctions.map((j) => ({ junction: j, group: g, rec: valueFor(j.junctionId, g) })))
    .join("rect")
    .attr("x", (d) => x(d.junction.junctionId))
    .attr("y", 0)
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("fill", (d) => color(Math.log10(metricValue(d.rec) + 1)))
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer")
    .on("mouseover", function (e, d) {
      d3.select(this).attr("stroke", textColor).attr("stroke-width", 1.5);
      const rec = d.rec;
      const metricLine = (key) => {
        const m = METRICS[key];
        const line = `${m.label}: ${m.fmt(m.get(rec))}`;
        return key === metric ? `<strong>${line}</strong>` : line;
      };
      const html = rec
        ? `<strong>${d.junction.chr}:${d.junction.start.toLocaleString()}-${d.junction.end.toLocaleString()}</strong>` +
          `<br/>${d.group}<br/>${metricLine("median")}<br/>${metricLine("mean")}<br/>${metricLine("total")}` +
          `<br/>Detected in ${rec.num_samples_detected} sample${rec.num_samples_detected === 1 ? "" : "s"}` +
          `<br/>${rec.annotated ? "Annotated junction" : "Novel junction"}`
        : `<strong>${d.junction.chr}:${d.junction.start.toLocaleString()}-${d.junction.end.toLocaleString()}</strong>` +
          `<br/>${d.group}<br/>Not detected in any sample in this group`;
      onHover(e, html);
    })
    .on("mousemove", onMove)
    .on("mouseout", function () {
      d3.select(this).attr("stroke", "#fff").attr("stroke-width", 0.5);
      onLeave();
    });
}

export default function JunctionExpressionHeatmap({ gene, data }) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, html: "" });
  const [metric, setMetric] = useState("median");

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Keeps the heatmap focused on junctions that are part of the reference
  // annotation and have meaningful read support across the gene's
  // plot_groups, rather than letting lowly-expressed/novel junctions
  // crowd out the signal.
  const filteredData = useMemo(() => {
    const totalReadsByJunction = new Map();
    data.forEach((d) => {
      totalReadsByJunction.set(d.junctionId, (totalReadsByJunction.get(d.junctionId) ?? 0) + (d.total_reads ?? 0));
    });
    return data.filter((d) => d.annotated && totalReadsByJunction.get(d.junctionId) > MIN_TOTAL_READS);
  }, [data]);

  const junctions = useMemo(() => {
    const seen = new Map();
    filteredData.forEach((d) => {
      if (!seen.has(d.junctionId)) seen.set(d.junctionId, { junctionId: d.junctionId, ...parseJunctionId(d.junctionId) });
    });
    return Array.from(seen.values()).sort((a, b) => a.start - b.start);
  }, [filteredData]);

  // Rows are ordered the same way PlotArea.jsx orders its groups: tumors
  // first, then evo-devo by developmental timepoint, then the remaining
  // control cohorts in the same order as the Controls tab's facets. The
  // broad evo-devo (Prenatal)/(Postnatal) rollups are dropped entirely --
  // the per-timepoint rows already cover that ground.
  const { plotGroups, groupMeta } = useMemo(() => {
    const seen = new Set();
    const ids = [];
    filteredData.forEach((d) => {
      if (!seen.has(d.tissueSiteDetailId)) {
        seen.add(d.tissueSiteDetailId);
        ids.push(d.tissueSiteDetailId);
      }
    });

    const meta = new Map();
    ids.forEach((id) => {
      const m = classifyGroup(id);
      if (m) meta.set(id, m);
    });

    const order = Array.from(meta.keys()).sort((a, b) => {
      const ma = meta.get(a);
      const mb = meta.get(b);
      if (ma.rank !== mb.rank) return ma.rank - mb.rank;
      if (ma.sortA !== mb.sortA) return ma.sortA - mb.sortA;
      if (ma.sortB !== mb.sortB) return ma.sortB - mb.sortB;
      return ma.label.localeCompare(mb.label);
    });

    return { plotGroups: order, groupMeta: meta };
  }, [filteredData]);

  const valueIndex = useMemo(() => {
    const map = new Map();
    filteredData.forEach((d) => map.set(`${d.junctionId}|${d.tissueSiteDetailId}`, d));
    return map;
  }, [filteredData]);

  const valueFor = (junctionId, group) => valueIndex.get(`${junctionId}|${group}`);

  const svgHeight = plotGroups.length * ROW_HEIGHT + MARGIN.top + MARGIN.bottom;

  useEffect(() => {
    if (!svgRef.current || junctions.length === 0) return;
    drawHeatmap(d3.select(svgRef.current), {
      width: containerWidth,
      junctions,
      plotGroups,
      groupMeta,
      valueFor,
      metric,
      textColor: theme.palette.text.primary,
      onHover: (e, html) => setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }),
      onMove: (e) => setTooltip((prev) => ({ ...prev, x: e.clientX + 14, y: e.clientY - 32 })),
      onLeave: () => setTooltip((prev) => ({ ...prev, visible: false })),
    });
  }, [junctions, plotGroups, groupMeta, containerWidth, metric, theme.palette.text.primary]); // eslint-disable-line react-hooks/exhaustive-deps

  if (junctions.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Typography color="text.secondary">
          No annotated junctions with more than {MIN_TOTAL_READS} total reads found for {gene || "this gene"}.
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 800 }}>
          Junction Expression of {gene}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={metric}
          onChange={(_, v) => { if (v !== null) setMetric(v); }}
        >
          <ToggleButton value="median">Median</ToggleButton>
          <ToggleButton value="mean">Mean</ToggleButton>
          <ToggleButton value="total">Total</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box ref={containerRef} sx={{ width: "100%", maxHeight: MAX_PLOT_HEIGHT, overflowY: "auto" }}>
        <svg ref={svgRef} width={containerWidth} height={svgHeight} style={{ display: "block" }} />
      </Box>
      {tooltip.visible && (
        <div
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            background: "rgba(30,30,30,0.9)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 4,
            fontSize: 12,
            lineHeight: 1.6,
            pointerEvents: "none",
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}
        />
      )}
    </Paper>
  );
}
