import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box, Button, Checkbox, FormControlLabel, IconButton, Popover, Slider,
  Stack, ToggleButton, ToggleButtonGroup, Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import SettingsIcon from "@mui/icons-material/Settings";
import * as d3 from "d3";
import { HISTOLOGY_COLORS, controlCohortColor } from "../histologyColors";
import {
  MIN_TOTAL_READS, MIN_MEDIAN_CPM, selectExpressedJunctionIds, metricValueGetter, filterHiddenGroups,
} from "./lib/junctionExpressionFilter";
import PlotDownloadMenu from "./PlotDownloadMenu";
import { stackSvgsVertically } from "./lib/svgExport";

const MARGIN = { top: 10, right: 20, bottom: 140, left: 220 };
const ROW_HEIGHT = 14;

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

// Mirrors PlotArea.jsx's EVODEVO_COLORS, reused for the Forebrain/Hindbrain
// rollup row swatches.
const EVODEVO_REGION_COLORS = { Forebrain: "#e67e22", Hindbrain: "#2980b9" };

// Mirrors PlotArea.jsx's control-cohort facet order, minus Primary Tumors and
// Evo-devo, which are bucketed separately in buildGroupOrder below.
const CONTROL_FACET_ORDER = ["Cell of Origin", "Pediatric Brain", "GTEx <40"];

// Maps a control facet's display name (the parenthetical suffix on
// tissueSiteDetailId, e.g. "Amygdala (GTEx <40)") back to the cohort name
// controlCohortColor expects.
const FACET_TO_COHORT = {
  "Cell of Origin": "Pediatric brain cell type",
  "Pediatric Brain": "Pediatric brain",
  "GTEx <40": "GTEx",
};

// Mirrors PlotArea.jsx's collapseControlGroup: any "Week Post Conception"
// timepoint is prenatal, everything else (Neonate, Infant, ...) is postnatal.
function evoDevoPhase(timepoint) {
  return timepoint.includes("Week Post Conception") ? "Prenatal" : "Postnatal";
}

// Buckets raw tissueSiteDetailId strings into tumors/evo-devo
// rollups+children/controls/others -- shared by buildGroupOrder (which
// turns this into the heatmap's ordered rows) and buildSampleFacets (which
// turns it into the Configure Samples popover's checkbox lists).
function classifyGroupIds(ids) {
  const tumors = [];
  const evoRollups = new Map(); // "Region:Phase" -> id
  const evoChildren = new Map(); // "Region:Phase" -> [{ id, tIdx }]
  const controls = [];
  const others = [];

  ids.forEach((id) => {
    if (id in HISTOLOGY_COLORS) {
      tumors.push(id);
      return;
    }

    const rollupMatch = id.match(/^(Forebrain|Hindbrain) \((Prenatal|Postnatal)\) \(Evo-devo\)$/);
    if (rollupMatch) {
      const [, region, phase] = rollupMatch;
      evoRollups.set(`${region}:${phase}`, id);
      return;
    }

    const childMatch = id.match(/^(Forebrain|Hindbrain)-(.+)$/);
    if (childMatch) {
      const [, region, timepoint] = childMatch;
      const key = `${region}:${evoDevoPhase(timepoint)}`;
      const tIdx = EVODEVO_TIMEPOINTS.indexOf(timepoint);
      const list = evoChildren.get(key) ?? [];
      list.push({ id, tIdx: tIdx === -1 ? EVODEVO_TIMEPOINTS.length : tIdx });
      evoChildren.set(key, list);
      return;
    }

    const facetMatch = id.match(/^(.*)\s\(([^()]+)\)$/);
    if (facetMatch) {
      const [, label, facet] = facetMatch;
      controls.push({ id, label, facet });
      return;
    }

    others.push(id);
  });

  return { tumors, evoRollups, evoChildren, controls, others };
}

// Builds the ordered row list and per-row display metadata: tumors first
// (alphabetical), then evo-devo bucketed by region/phase -- Forebrain
// Prenatal, Forebrain Postnatal, Hindbrain Prenatal, Hindbrain Postnatal --
// each collapsed behind its rollup row by default, then the remaining
// control cohorts in the same order as PlotArea.jsx's Controls tab facets.
// Working off the tissueSiteDetailId string alone since the heatmap API has
// no separate cohort field.
function buildGroupOrder(ids, expandedEvoDevo) {
  const { tumors, evoRollups, evoChildren, controls, others } = classifyGroupIds(ids);

  tumors.sort((a, b) => a.localeCompare(b));

  const meta = new Map();
  const order = [];

  tumors.forEach((id) => {
    order.push(id);
    meta.set(id, { label: id, swatchColor: HISTOLOGY_COLORS[id], chevron: null, cohort: "Primary tumor" });
  });

  ["Forebrain", "Hindbrain"].forEach((region) => {
    ["Prenatal", "Postnatal"].forEach((phase) => {
      const key = `${region}:${phase}`;
      const rollupId = evoRollups.get(key);
      const children = (evoChildren.get(key) ?? []).sort((a, b) => a.tIdx - b.tIdx);

      if (rollupId) {
        const expanded = expandedEvoDevo.has(key);
        order.push(rollupId);
        meta.set(rollupId, {
          label: `${region} (${phase})`,
          swatchColor: EVODEVO_REGION_COLORS[region],
          chevron: children.length > 0 ? (expanded ? "collapse" : "expand") : null,
          expandKey: key,
          cohort: "Evo-devo",
        });
        if (expanded) {
          children.forEach(({ id }) => {
            order.push(id);
            meta.set(id, { label: id, swatchColor: EVODEVO_REGION_COLORS[region], chevron: null, cohort: "Evo-devo" });
          });
        }
      } else {
        // No rollup row in the data for this bucket -- nothing to collapse
        // into, so just show the individual timepoint rows directly.
        children.forEach(({ id }) => {
          order.push(id);
          meta.set(id, { label: id, swatchColor: EVODEVO_REGION_COLORS[region], chevron: null, cohort: "Evo-devo" });
        });
      }
    });
  });

  const facetRank = (facet) => {
    const i = CONTROL_FACET_ORDER.indexOf(facet);
    return i === -1 ? CONTROL_FACET_ORDER.length : i;
  };
  controls.sort((a, b) => {
    const d = facetRank(a.facet) - facetRank(b.facet);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
  controls.forEach(({ id, label, facet }) => {
    order.push(id);
    meta.set(id, { label, swatchColor: controlCohortColor(FACET_TO_COHORT[facet]), chevron: null, cohort: facet });
  });

  others.sort((a, b) => a.localeCompare(b));
  others.forEach((id) => {
    order.push(id);
    meta.set(id, { label: id, swatchColor: null, chevron: null });
  });

  return { order, meta };
}

// Builds the Configure Samples popover's facet sections from the raw,
// unfiltered data -- so a currently-hidden item still shows up (unchecked)
// as a re-enableable option, regardless of what filterHiddenGroups has
// dropped from the plot itself. Evo-devo rollup+children collapse onto one
// per-bucket item (hideKey `evo:<region>:<phase>`), matching how
// junctionExpressionFilter.js's hideKeyFor groups them for filtering.
function buildSampleFacets(data) {
  const seen = new Set();
  const ids = [];
  data.forEach((d) => {
    if (!seen.has(d.tissueSiteDetailId)) {
      seen.add(d.tissueSiteDetailId);
      ids.push(d.tissueSiteDetailId);
    }
  });

  const { tumors, evoRollups, evoChildren, controls } = classifyGroupIds(ids);
  const sections = [];

  if (tumors.length > 0) {
    sections.push({
      key: "Primary Tumors",
      items: tumors.slice().sort((a, b) => a.localeCompare(b)).map((id) => ({ hideKey: id, label: id })),
    });
  }

  CONTROL_FACET_ORDER.forEach((facet) => {
    const items = controls
      .filter((c) => c.facet === facet)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((c) => ({ hideKey: c.id, label: c.label }));
    if (items.length > 0) sections.push({ key: facet, items });
  });

  const evoBucketKeys = new Set([...evoRollups.keys(), ...evoChildren.keys()]);
  const evoItems = ["Forebrain", "Hindbrain"].flatMap((region) =>
    ["Prenatal", "Postnatal"]
      .filter((phase) => evoBucketKeys.has(`${region}:${phase}`))
      .map((phase) => ({ hideKey: `evo:${region}:${phase}`, label: `${region} (${phase})` }))
  );
  if (evoItems.length > 0) sections.push({ key: "Evo-devo", items: evoItems });

  return sections;
}

// The expand/collapse chevron (for evo-devo rollup rows) sits flush against
// the left edge of the SVG, row labels (theme-colored, not per-row tinted)
// sit next to it, and the per-row histology/cohort color swatch sits
// between the label and the plot, flush against the cells.
const CHEVRON_X = -MARGIN.left + 8;
const SWATCH_SIZE = 10;
const SWATCH_X = -(SWATCH_SIZE + 10);
const LABEL_X = SWATCH_X - 8;

// Metrics available for cell coloring/tooltip emphasis, keyed the same as
// the toggle value. `get` reads the field off a gene_junction_summary row
// (median_cpm/mean_cpm/total_reads), defaulting to 0 for group/junction
// combos absent from the API response (never detected in any sample).
const METRICS = {
  median: { label: "Median CPM", get: metricValueGetter("median"), fmt: (v) => v.toFixed(3) },
  mean: { label: "Mean CPM", get: metricValueGetter("mean"), fmt: (v) => v.toFixed(3) },
  total: { label: "Total Reads", get: (rec) => rec?.total_reads ?? 0, fmt: (v) => v.toLocaleString() },
};

// Rounds the legend's upper-bound label to 2 significant figures -- exact
// CPM values (e.g. 12.345) are noise at the scale of a color-legend bound.
function roundToSigFigs(value, sigFigs) {
  if (value === 0) return 0;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = Math.pow(10, sigFigs - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

// Cell color legend gradient -- cells map linearly onto d3.interpolateReds
// across the color scale's domain (see drawHeatmap), so sampling the same
// interpolator at even steps reproduces that gradient exactly as CSS.
const LEGEND_GRADIENT = `linear-gradient(to right, ${d3.range(0, 1.001, 0.1).map((t) => d3.interpolateReds(t)).join(", ")})`;

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
function drawHeatmap(svg, { width, junctions, plotGroups, groupMeta, valueFor, metric, textColor, hoveredJunctionId, onHover, onMove, onLeave, onToggleEvoDevo, onHoverJunction, showEvoDevoToggles = true }) {
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
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "central")
    .attr("font-size", 11)
    .attr("fill", textColor)
    .text((g) => groupMeta.get(g)?.label ?? g);

  // Color swatch indicating each row's histology/cohort, placed flush
  // against the plot's left edge (between the row label and the cells).
  // Row label text itself stays theme-colored rather than per-row tinted.
  // Hovering it shows which cohort the row belongs to (tumor histologies
  // all collapse to "Primary tumor" rather than naming the histology).
  root.append("g")
    .selectAll("rect")
    .data(plotGroups.filter((g) => groupMeta.get(g)?.swatchColor))
    .join("rect")
    .attr("x", SWATCH_X)
    .attr("y", (g) => y(g) + y.bandwidth() / 2 - SWATCH_SIZE / 2)
    .attr("width", SWATCH_SIZE)
    .attr("height", SWATCH_SIZE)
    .attr("rx", 2)
    .attr("fill", (g) => groupMeta.get(g).swatchColor)
    .on("mouseover", (e, g) => onHover(e, `<strong>${groupMeta.get(g).cohort}</strong>`))
    .on("mousemove", onMove)
    .on("mouseout", onLeave);

  // Expand/collapse chevron for evo-devo rollup rows: "▾" reveals the
  // per-timepoint rows that make up the bucket, "▴" hides them again.
  // Omitted from the SVG download since the export is static -- a click
  // toggle has no purpose there.
  if (showEvoDevoToggles) {
    root.append("g")
      .selectAll("text")
      .data(plotGroups.filter((g) => groupMeta.get(g)?.chevron))
      .join("text")
      .attr("x", CHEVRON_X)
      .attr("y", (g) => y(g) + y.bandwidth() / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("font-size", 16)
      .attr("fill", textColor)
      .style("cursor", "pointer")
      .style("user-select", "none")
      .on("click", (e, g) => onToggleEvoDevo(groupMeta.get(g).expandKey))
      .each(function (g) {
        const sel = d3.select(this);
        sel.text(groupMeta.get(g).chevron === "expand" ? "▾" : "▴");
        sel.append("title").text("Click to expand/collapse timepoints");
      });
  }

  root.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .selectAll("text")
    .data(junctions)
    .join("text")
    .attr("transform", (j) => `translate(${x(j.junctionId) + x.bandwidth() / 2}, 10) rotate(-55)`)
    .attr("text-anchor", "end")
    .attr("font-size", 11)
    .attr("font-family", "monospace")
    .attr("font-weight", (j) => (j.junctionId === hoveredJunctionId ? 700 : 400))
    .attr("fill", textColor)
    .style("cursor", "pointer")
    .text((j) => `${j.start}-${j.end}`)
    .on("mouseover", (e, j) => onHoverJunction(j.junctionId))
    .on("mouseout", () => onHoverJunction(null));

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
      onHoverJunction(d.junction.junctionId);
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
      onHoverJunction(null);
      onLeave();
    });

  // Column outline for whichever junction is hovered here or in the gene
  // model -- drawn last (and pointer-events: none) so it overlays the cells
  // without intercepting their hover/tooltip handlers.
  root.append("g")
    .selectAll("rect")
    .data(junctions.filter((j) => j.junctionId === hoveredJunctionId))
    .join("rect")
    .attr("x", (j) => x(j.junctionId) - 2)
    .attr("y", -2)
    .attr("width", x.bandwidth() + 4)
    .attr("height", innerHeight + 4)
    .attr("fill", "none")
    .attr("stroke", textColor)
    .attr("stroke-width", 2)
    .attr("pointer-events", "none");
}

export default function JunctionExpressionHeatmap({
  gene, data, width, geneModelRef = null, hoveredJunctionId = null, onHoverJunction,
  metric, onMetricChange, minExpressionValue, onMinExpressionValueChange,
  hiddenGroups, onHiddenGroupsChange,
}) {
  const theme = useTheme();
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, html: "" });
  const [expandedEvoDevo, setExpandedEvoDevo] = useState(new Set());
  const [samplesAnchor, setSamplesAnchor] = useState(null);
  const [expandedFacets, setExpandedFacets] = useState(new Set());

  function toggleEvoDevoExpand(key) {
    setExpandedEvoDevo((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Drops rows the user has hidden via Configure Samples before any other
  // filtering, so a hidden sample group counts toward neither the heatmap
  // rows nor the expressed-junction calculation below.
  const visibleData = useMemo(() => filterHiddenGroups(data, hiddenGroups), [data, hiddenGroups]);

  // Keeps the heatmap focused on junctions that are part of the reference
  // annotation and have meaningful read support across the gene's
  // plot_groups, rather than letting lowly-expressed/novel junctions
  // crowd out the signal.
  const filteredData = useMemo(() => {
    const totalReadsByJunction = new Map();
    visibleData.forEach((d) => {
      totalReadsByJunction.set(d.junctionId, (totalReadsByJunction.get(d.junctionId) ?? 0) + (d.total_reads ?? 0));
    });
    return visibleData.filter((d) => d.annotated && totalReadsByJunction.get(d.junctionId) > MIN_TOTAL_READS);
  }, [visibleData]);

  // Drops junctions that never reach the slider's min CPM (for whichever
  // metric is toggled) in any visible group -- a flat, lowly-expressed row
  // carries no signal and just clutters the heatmap. Shared with
  // GeneModelGtex so both show the same junctions.
  const junctions = useMemo(() => {
    const expressedIds = selectExpressedJunctionIds(visibleData, {
      getValue: metricValueGetter(metric),
      minValue: minExpressionValue,
    });
    const seen = new Map();
    filteredData.forEach((d) => {
      if (expressedIds.has(d.junctionId) && !seen.has(d.junctionId)) {
        seen.set(d.junctionId, { junctionId: d.junctionId, ...parseJunctionId(d.junctionId) });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.start - b.start);
  }, [visibleData, filteredData, metric, minExpressionValue]);

  const sampleFacets = useMemo(() => buildSampleFacets(data), [data]);

  // Rows are ordered the same way PlotArea.jsx orders its groups: tumors
  // first, then evo-devo bucketed by region/phase (collapsed behind a
  // rollup row by default), then the remaining control cohorts in the same
  // order as the Controls tab's facets.
  const { plotGroups, groupMeta } = useMemo(() => {
    const seen = new Set();
    const ids = [];
    filteredData.forEach((d) => {
      if (!seen.has(d.tissueSiteDetailId)) {
        seen.add(d.tissueSiteDetailId);
        ids.push(d.tissueSiteDetailId);
      }
    });

    const { order, meta } = buildGroupOrder(ids, expandedEvoDevo);
    return { plotGroups: order, groupMeta: meta };
  }, [filteredData, expandedEvoDevo]);

  const valueIndex = useMemo(() => {
    const map = new Map();
    filteredData.forEach((d) => map.set(`${d.junctionId}|${d.tissueSiteDetailId}`, d));
    return map;
  }, [filteredData]);

  const valueFor = (junctionId, group) => valueIndex.get(`${junctionId}|${group}`);

  // Drives the legend's upper bound -- matches the value drawHeatmap uses
  // to build the cell color scale's domain.
  const legendMax = useMemo(() => {
    const { get: metricValue } = METRICS[metric];
    return d3.max(junctions, (j) =>
      d3.max(plotGroups, (g) => metricValue(valueIndex.get(`${j.junctionId}|${g}`)))
    ) || 0;
  }, [junctions, plotGroups, valueIndex, metric]);

  const svgHeight = plotGroups.length * ROW_HEIGHT + MARGIN.top + MARGIN.bottom;

  // Renders a detached, export-sized copy of the heatmap for PlotDownloadMenu
  // -- height tracks the row count (see svgHeight above) rather than the
  // user-chosen export height, since rows have a fixed height. Also pulls in
  // a matching copy of the gene model (if mounted and loaded) and stacks it
  // underneath, so the download captures both plots on one canvas.
  function buildExportSvg({ width }) {
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("width", width);
    svgEl.setAttribute("height", svgHeight);
    drawHeatmap(d3.select(svgEl), {
      width,
      junctions,
      plotGroups,
      groupMeta,
      valueFor,
      metric,
      textColor: theme.palette.text.primary,
      hoveredJunctionId: null,
      onHover: () => {},
      onMove: () => {},
      onLeave: () => {},
      onToggleEvoDevo: () => {},
      onHoverJunction: () => {},
      showEvoDevoToggles: false,
    });
    const geneModelSvg = geneModelRef?.current?.buildExportSvg?.({ width });
    return geneModelSvg ? stackSvgsVertically([svgEl, geneModelSvg]) : svgEl;
  }

  useEffect(() => {
    if (!svgRef.current || junctions.length === 0) return;
    drawHeatmap(d3.select(svgRef.current), {
      width,
      junctions,
      plotGroups,
      groupMeta,
      valueFor,
      metric,
      textColor: theme.palette.text.primary,
      hoveredJunctionId,
      onHover: (e, html) => setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }),
      onMove: (e) => setTooltip((prev) => ({ ...prev, x: e.clientX + 14, y: e.clientY - 32 })),
      onLeave: () => setTooltip((prev) => ({ ...prev, visible: false })),
      onToggleEvoDevo: toggleEvoDevoExpand,
      onHoverJunction: (id) => onHoverJunction?.(id),
    });
  }, [junctions, plotGroups, groupMeta, width, metric, hoveredJunctionId, onHoverJunction, theme.palette.text.primary]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 800 }}>
          Junction Expression of {gene}
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          {junctions.length > 0 && (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">0</Typography>
              <Box sx={{ width: 100, height: 10, borderRadius: 1, background: LEGEND_GRADIENT }} />
              <Typography variant="caption" color="text.secondary">
                {roundToSigFigs(legendMax, 2)} {METRICS[metric].label}
              </Typography>
            </Stack>
          )}
          <Box sx={{ width: 160 }}>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              Min {METRICS[metric].label} ≥ {minExpressionValue.toFixed(1)}
            </Typography>
            <Slider
              value={minExpressionValue}
              onChange={(_, v) => onMinExpressionValueChange(v)}
              min={0}
              max={10}
              step={0.1}
              marks={[{ value: MIN_MEDIAN_CPM }]}
              valueLabelDisplay="auto"
              size="small"
            />
          </Box>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={metric}
            onChange={(_, v) => { if (v !== null) onMetricChange(v); }}
          >
            <ToggleButton value="median">Median</ToggleButton>
            <ToggleButton value="mean">Mean</ToggleButton>
          </ToggleButtonGroup>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SettingsIcon fontSize="small" />}
            onClick={(e) => setSamplesAnchor(e.currentTarget)}
          >
            Configure Samples
          </Button>
          <PlotDownloadMenu
            buildExportSvg={buildExportSvg}
            title={`Junction Expression & Gene Model of ${gene}`}
            filename={(ext) => `junction-expression-${gene}.${ext}`}
            showHeightField={false}
          />
        </Stack>
      </Stack>

      {junctions.length === 0 ? (
        <Typography color="text.secondary">
          No annotated junctions with more than {MIN_TOTAL_READS} total reads found for {gene || "this gene"}.
        </Typography>
      ) : (
        <>
          <svg ref={svgRef} width={width} height={svgHeight} style={{ display: "block" }} />
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
        </>
      )}

      <Popover
        open={Boolean(samplesAnchor)}
        anchorEl={samplesAnchor}
        onClose={() => setSamplesAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 2, minWidth: 260, maxHeight: 420, overflowY: "auto" }}>
          {sampleFacets.map((section) => {
            const allOn = section.items.every((it) => !hiddenGroups.has(it.hideKey));
            const someOn = section.items.some((it) => !hiddenGroups.has(it.hideKey));
            const isExpanded = expandedFacets.has(section.key);
            return (
              <Box key={section.key} sx={{ mb: 1 }}>
                <Stack direction="row" alignItems="center">
                  <Checkbox
                    size="small"
                    checked={allOn}
                    indeterminate={!allOn && someOn}
                    onChange={() => onHiddenGroupsChange((prev) => {
                      const next = new Set(prev);
                      if (allOn) section.items.forEach((it) => next.add(it.hideKey));
                      else section.items.forEach((it) => next.delete(it.hideKey));
                      return next;
                    })}
                  />
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>{section.key}</Typography>
                  <IconButton
                    size="small"
                    onClick={() => setExpandedFacets((prev) => {
                      const next = new Set(prev);
                      next.has(section.key) ? next.delete(section.key) : next.add(section.key);
                      return next;
                    })}
                  >
                    <Typography variant="caption" sx={{ lineHeight: 1 }}>{isExpanded ? "▴" : "▾"}</Typography>
                  </IconButton>
                </Stack>
                {isExpanded && section.items.map((it) => (
                  <Box key={it.hideKey} sx={{ pl: 2.5, display: "block" }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={!hiddenGroups.has(it.hideKey)}
                          onChange={() => onHiddenGroupsChange((prev) => {
                            const next = new Set(prev);
                            next.has(it.hideKey) ? next.delete(it.hideKey) : next.add(it.hideKey);
                            return next;
                          })}
                        />
                      }
                      label={<Typography variant="body2">{it.label}</Typography>}
                    />
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      </Popover>
    </Box>
  );
}
