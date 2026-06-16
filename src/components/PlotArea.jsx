import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider,
  FormControlLabel, IconButton, Menu, MenuItem, Paper, Popover, Stack, Switch, Tab, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
  useTheme,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import SettingsIcon from "@mui/icons-material/Settings";
import * as d3 from "d3";
import { controlCohortColor, histologyColor } from "../histologyColors";

const MARGIN = { top: 20, right: 20, bottom: 200, left: 100 };
const API_BASE = (import.meta.env.VITE_API_BASE || "/tapestry-api").replace(/\/$/, "");
const EMPTY_ROWS = [];

const EVODEVO_TIMEPOINTS = [
  "4 Week Post Conception", "5 Week Post Conception", "6 Week Post Conception",
  "7 Week Post Conception", "8 Week Post Conception", "9 Week Post Conception",
  "10 Week Post Conception", "11 Week Post Conception", "12 Week Post Conception",
  "13 Week Post Conception", "16 Week Post Conception", "18 Week Post Conception",
  "19 Week Post Conception",
  "Neonate", "Infant", "Toddler", "School Age Child", "Adolescent", "Young Adult",
];

const EVODEVO_LABELS = {
  "4 Week Post Conception": "4wpc", "5 Week Post Conception": "5wpc",
  "6 Week Post Conception": "6wpc", "7 Week Post Conception": "7wpc",
  "8 Week Post Conception": "8wpc", "9 Week Post Conception": "9wpc",
  "10 Week Post Conception": "10wpc", "11 Week Post Conception": "11wpc",
  "12 Week Post Conception": "12wpc", "13 Week Post Conception": "13wpc",
  "16 Week Post Conception": "16wpc", "18 Week Post Conception": "18wpc",
  "19 Week Post Conception": "19wpc",
  "Neonate": "Newborn", "Infant": "Infant", "Toddler": "Toddler",
  "School Age Child": "School Age", "Adolescent": "Adolescent", "Young Adult": "Young Adult",
};

// EvoDevo's "Neonate" timepoint is displayed as "Newborn" in tooltips too.
const timepointDisplay = (t) => (t === "Neonate" ? "Newborn" : t);

const EVODEVO_COLORS = { Forebrain: "#e67e22", Hindbrain: "#2980b9" };

function boxStats(cpms) {
  const sorted = [...cpms].sort(d3.ascending);
  const q1 = d3.quantile(sorted, 0.25);
  const median = d3.quantile(sorted, 0.5);
  const q3 = d3.quantile(sorted, 0.75);
  const iqr = q3 - q1;
  return {
    q1, median, q3,
    lo: Math.max(d3.min(sorted), q1 - 1.5 * iqr),
    hi: Math.min(d3.max(sorted), q3 + 1.5 * iqr),
  };
}

const EMPTY_SET = new Set();

// SVG dimensions are in CSS px (96 DPI); scale raster exports up to 300 DPI.
const EXPORT_SCALE = 300 / 96;
const PX_PER_INCH = 96;

// Extra space (CSS px) reserved at the top of exported images for the plot
// title, which is normally rendered outside the <svg> as a page heading.
const TITLE_HEIGHT = 36;

function cloneSvgWithBackground(svgEl, title) {
  const svgWidth = Number(svgEl.getAttribute("width"));
  const contentHeight = Number(svgEl.getAttribute("height"));
  const titleHeight = title ? TITLE_HEIGHT : 0;
  const svgHeight = contentHeight + titleHeight;

  const clone = svgEl.cloneNode(true);
  clone.setAttribute("height", svgHeight);

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", svgWidth);
  bg.setAttribute("height", svgHeight);
  bg.setAttribute("fill", "white");
  clone.insertBefore(bg, clone.firstChild);

  if (title) {
    // Shift the existing chart content down to make room for the title.
    const content = document.createElementNS("http://www.w3.org/2000/svg", "g");
    content.setAttribute("transform", `translate(0, ${titleHeight})`);
    Array.from(clone.children).forEach((child) => {
      if (child !== bg) content.appendChild(child);
    });
    clone.appendChild(content);

    const titleEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    titleEl.setAttribute("x", svgWidth / 2);
    titleEl.setAttribute("y", titleHeight / 2);
    titleEl.setAttribute("text-anchor", "middle");
    titleEl.setAttribute("dominant-baseline", "central");
    titleEl.setAttribute("font-size", 16);
    titleEl.setAttribute("font-weight", 800);
    titleEl.setAttribute("font-family", "sans-serif");
    titleEl.setAttribute("fill", "#333");
    titleEl.textContent = title;
    clone.appendChild(titleEl);
  }

  return { clone, svgWidth, svgHeight };
}

function svgToCanvas(clone, svgWidth, svgHeight, scale) {
  return new Promise((resolve, reject) => {
    const svgStr = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function triggerDownload(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

// Controls are colored by source cohort (GTEx, Evo-devo, etc.) since they
// don't have per-histology colors; tumor/cell-line groups use histologyColor.
function groupColor(g) {
  return g.isControl ? controlCohortColor(g.cohort) : histologyColor(g.label);
}

// Box-plot groups are split into side-by-side facet panels by tumor/control
// cohort/cell-line, in this order. "Other" catches any control cohort not
// in COHORT_FACET_NAMES so groups are never silently dropped.
const COHORT_FACET_NAMES = {
  "Pediatric brain cell type": "Cell of Origin",
  "Evo-devo": "Evo-devo",
  "Pediatric brain": "Pediatric Brain",
  "GTEx": "GTEx <40",
};

const FACET_ORDER = ["Primary Tumors", "Cell of Origin", "Evo-devo", "Pediatric Brain", "GTEx <40", "Cell Lines", "Other"];

// Gap (px) between facet panels.
const FACET_GAP = 16;
// Height (px) of the ggplot-style strip label above each facet panel.
const FACET_STRIP_H = 16;

function facetName(g) {
  if (g.isTumor) return "Primary Tumors";
  if (g.isCellLine) return "Cell Lines";
  return COHORT_FACET_NAMES[g.cohort] ?? "Other";
}

// Renders the per-histology box plot into `svg`, sized to `width` x `height`.
// Shared by the on-screen chart and off-screen export rendering.
function drawBoxPlot(svg, { width, height, visibleGroups, log2Scale, highlightIds, onHover, onMove, onLeave }) {
  svg.selectAll("*").remove();

  const iW = width - MARGIN.left - MARGIN.right;
  const iH = height - MARGIN.top - MARGIN.bottom;

  const xform = (d) => log2Scale ? (d.log2CpmCorrected ?? Math.log2(d.cpm + 1)) : d.cpm;

  const allCpms = visibleGroups.flatMap((g) => g.values.map(xform));
  const yMax = d3.max(allCpms) ?? 1;
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([iH, 0]);

  // Split groups into side-by-side facet panels (Tumor, control cohorts,
  // Cell Lines). Panel widths are proportional to group count, so box
  // widths stay consistent across panels; all panels share the y-scale above.
  const facetBuckets = FACET_ORDER
    .map((name) => ({ name, groups: visibleGroups.filter((g) => facetName(g) === name) }))
    .filter((f) => f.groups.length > 0);

  const facetGapWidth = FACET_GAP * Math.max(0, facetBuckets.length - 1);
  const usableWidth = Math.max(iW - facetGapWidth, 0);

  const scaleForKey = new Map();
  let cursor = 0;
  facetBuckets.forEach((f) => {
    const facetWidth = usableWidth * (f.groups.length / visibleGroups.length);
    f.scale = d3.scaleBand()
      .domain(f.groups.map((g) => g.key))
      .range([cursor, cursor + facetWidth])
      .padding(0.35);
    f.groups.forEach((g) => scaleForKey.set(g.key, f.scale));
    cursor += facetWidth + FACET_GAP;
  });

  const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  root.append("g")
    .call(d3.axisLeft(y).tickSize(-iW).tickFormat(""))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3"));

  const labelForKey = new Map(visibleGroups.map((g) => [g.key, g.label]));

  facetBuckets.forEach((f) => {
    root.append("g")
      .attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(f.scale).tickFormat((key) => labelForKey.get(key) ?? key))
      .selectAll("text")
      .attr("transform", "rotate(-55)")
      .style("text-anchor", "end")
      .attr("dx", "-0.5em")
      .attr("font-size", 11)
      .attr("dy", "0.15em");

    {
      const [x0, x1] = f.scale.range();
      if (facetBuckets.length > 1) {
        root.append("line")
          .attr("x1", x0).attr("x2", x1)
          .attr("y1", 0).attr("y2", 0)
          .attr("stroke", "black").attr("stroke-width", 1.5);
      }
      root.append("text")
        .attr("x", (x0 + x1) / 2)
        .attr("y", -FACET_STRIP_H / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("font-size", 13)
        .attr("font-weight", 700)
        .attr("font-family", "sans-serif")
        .attr("fill", "#333")
        .text(f.name);
    }
  });

  root.append("g").call(d3.axisLeft(y).tickFormat(d3.format(".2f")));

  root.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2).attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("font-size", 16)
    .attr("font-family", "sans-serif")
    .attr("fill", "#666")
    .text(log2Scale ? "log₂(CPM + 1)" : "CPM");

  visibleGroups.forEach((g) => {
    const { key, label, values } = g;
    const xVals = values.map(xform);
    const { q1, median, q3, lo, hi } = boxStats(xVals);
    const scale = scaleForKey.get(key);
    const cx = scale(key) + scale.bandwidth() / 2;
    const bw = scale.bandwidth() * 0.7;
    const color = groupColor(g);
    const fmt = (v) => v.toFixed(3);
    const axisLabel = log2Scale ? "log₂(CPM+1)" : "CPM";

    const boxTip = `<strong>${label}</strong><br/>n=${values.length}<br/>Median: ${fmt(median)}<br/>IQR: [${fmt(q1)}, ${fmt(q3)}]<br/>Whiskers: [${fmt(lo)}, ${fmt(hi)}]`;

    root.append("line").attr("x1", cx).attr("x2", cx)
      .attr("y1", y(lo)).attr("y2", y(q1))
      .attr("stroke", "black").attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");
    root.append("line").attr("x1", cx).attr("x2", cx)
      .attr("y1", y(q3)).attr("y2", y(hi))
      .attr("stroke", "black").attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");

    [lo, hi].forEach((v) =>
      root.append("line")
        .attr("x1", cx - bw / 4).attr("x2", cx + bw / 4)
        .attr("y1", y(v)).attr("y2", y(v))
        .attr("stroke", "black").attr("stroke-width", 1.5)
    );

    root.append("rect")
      .attr("x", cx - bw / 2).attr("y", y(q3))
      .attr("width", bw).attr("height", Math.abs(y(q1) - y(q3)))
      .attr("fill", color).attr("fill-opacity", 0.2)
      .attr("stroke", "black").attr("stroke-width", 1.5)
      .attr("rx", 2)
      .on("mouseover", (e) => onHover(e, boxTip))
      .on("mousemove", onMove)
      .on("mouseout", onLeave);

    root.append("line")
      .attr("x1", cx - bw / 2).attr("x2", cx + bw / 2)
      .attr("y1", y(median)).attr("y2", y(median))
      .attr("stroke", "black").attr("stroke-width", 2.5)
      .attr("stroke-linecap", "round");

    const sorted = [...values].sort((a, b) => highlightIds.has(a.id) - highlightIds.has(b.id));
    sorted.forEach((d) => {
      const highlighted = highlightIds.has(d.id);
      root.append("circle")
        .attr("cx", cx + d.jitter * bw * 0.65)
        .attr("cy", y(xform(d)))
        .attr("r", highlighted ? 5 : 3)
        .attr("fill", color)
        .attr("fill-opacity", highlighted ? 1 : 0.4)
        .attr("stroke", "black")
        .attr("stroke-width", highlighted ? 1.5 : 0.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${d.id}</strong><br/>${label}<br/>${axisLabel}: ${xform(d).toFixed(3)}<br/>${d.rnaLibrary ?? "—"}${highlighted ? "<br/><em>tumor enriched</em>" : ""}`)
        )
        .on("mousemove", onMove)
        .on("mouseout", onLeave);
    });
  });
}

// Renders the EvoDevo timepoint plot into `svg`, sized to `width` x `height`.
// Shared by the on-screen chart and off-screen export rendering.
function drawEvoDevoPlot(svg, { width, height, evodevoPoints, log2Scale, textColor = "#333", onHover, onMove, onLeave }) {
  svg.selectAll("*").remove();

  const presentTimepoints = EVODEVO_TIMEPOINTS.filter((t) =>
    evodevoPoints.some((d) => d.timepoint === t)
  );
  if (presentTimepoints.length === 0) return;

  const xform = (d) => log2Scale ? (d.log2CpmCorrected ?? Math.log2(d.cpm + 1)) : d.cpm;

  const iW = width - MARGIN.left - MARGIN.right;
  const iH = height - MARGIN.top - MARGIN.bottom;
  const yMax = d3.max(evodevoPoints, xform) ?? 1;

  const x = d3.scalePoint().domain(presentTimepoints).range([0, iW]).padding(0.5);
  const y = d3.scaleLinear().domain([0, yMax]).nice().range([iH, 0]);

  const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

  root.append("g")
    .call(d3.axisLeft(y).tickSize(-iW).tickFormat(""))
    .call((g) => g.select(".domain").remove())
    .call((g) => g.selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3"));

  root.append("g")
    .attr("transform", `translate(0,${iH})`)
    .call(d3.axisBottom(x).tickFormat((t) => EVODEVO_LABELS[t] ?? t))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end")
    .attr("dx", "-0.5em")
    .attr("font-size", 11)
    .attr("dy", "0.15em");

  root.append("g").call(d3.axisLeft(y).tickFormat(d3.format(".2f")));

  root.append("text")
    .attr("transform", "rotate(-90)")
    .attr("x", -iH / 2).attr("y", -52)
    .attr("text-anchor", "middle")
    .attr("font-size", 16)
    .attr("font-family", "sans-serif")
    .attr("fill", "#666")
    .text(log2Scale ? "log₂(CPM + 1)" : "CPM");

  ["Forebrain", "Hindbrain"].forEach((region) => {
    const color = EVODEVO_COLORS[region];
    const regionPts = evodevoPoints.filter((d) => d.region === region);

    regionPts.forEach((d) => {
      if (!presentTimepoints.includes(d.timepoint)) return;
      root.append("circle")
        .attr("cx", x(d.timepoint))
        .attr("cy", y(xform(d)))
        .attr("r", 3)
        .attr("fill", color)
        .attr("fill-opacity", 0.3)
        .attr("stroke", "black")
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${d.id}</strong><br/>${region} — ${timepointDisplay(d.timepoint)}<br/>CPM: ${xform(d).toFixed(3)}<br/>${d.rnaLibrary ?? "—"}`)
        )
        .on("mousemove", onMove)
        .on("mouseout", onLeave);
    });

    const meanPoints = presentTimepoints.map((tp) => {
      const vals = regionPts.filter((d) => d.timepoint === tp).map(xform);
      return vals.length ? { timepoint: tp, value: d3.mean(vals) } : null;
    }).filter(Boolean);

    if (meanPoints.length > 1) {
      root.append("path")
        .datum(meanPoints)
        .attr("d", d3.line().x((d) => x(d.timepoint)).y((d) => y(d.value)))
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2)
        .attr("stroke-linejoin", "round");
    }

    meanPoints.forEach((d) => {
      root.append("circle")
        .attr("cx", x(d.timepoint))
        .attr("cy", y(d.value))
        .attr("r", 5)
        .attr("fill", color)
        .attr("stroke", "white")
        .attr("stroke-width", 1.5)
        .style("cursor", "pointer")
        .on("mouseover", (e) =>
          onHover(e, `<strong>${region}</strong><br/>${timepointDisplay(d.timepoint)}<br/>Mean: ${d.value.toFixed(3)}`)
        )
        .on("mousemove", onMove)
        .on("mouseout", onLeave);
    });
  });

  const legend = root.append("g").attr("transform", `translate(${iW - 100}, 10)`);
  ["Forebrain", "Hindbrain"].forEach((region, i) => {
    const g = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
    g.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 8).attr("y2", 8)
      .attr("stroke", EVODEVO_COLORS[region]).attr("stroke-width", 2);
    g.append("circle").attr("cx", 10).attr("cy", 8).attr("r", 4)
      .attr("fill", EVODEVO_COLORS[region]).attr("stroke", "transparent").attr("stroke-width", 1);
    g.append("text").attr("x", 26).attr("y", 12)
      .attr("font-size", 12).attr("font-family", "sans-serif").attr("fill", textColor).text(region);
  });
}

// Tooltip handlers are no-ops for the off-screen SVG built for export.
const NO_TOOLTIP = { onHover: () => {}, onMove: () => {}, onLeave: () => {} };

// Builds a detached <svg> at the requested export dimensions, drawn with the
// same logic as the on-screen chart for the active tab.
function buildExportSvg({ width, height, activeTab, visibleGroups, evodevoPoints, log2Scale, highlightIds }) {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("width", width);
  svgEl.setAttribute("height", height);
  const svg = d3.select(svgEl);
  if (activeTab === 3) {
    drawEvoDevoPlot(svg, { width, height, evodevoPoints, log2Scale, ...NO_TOOLTIP });
  } else {
    drawBoxPlot(svg, { width, height, visibleGroups, log2Scale, highlightIds, ...NO_TOOLTIP });
  }
  return svgEl;
}

export default function PlotArea({
  junction = null,
  gene = null,
  rows = EMPTY_ROWS,
  height = 420,
  highlightIds = EMPTY_SET,
}) {
  const theme = useTheme();
  const title = gene && junction
    ? `${gene} — ${junction}`
    : junction ?? "Junction CPM by histology";
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [fetchedRows, setFetchedRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [exportAnchor, setExportAnchor] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, html: "" });
  const [activeTab, setActiveTab] = useState(0);
  const [log2Scale, setLog2Scale] = useState(false);
  const [sortMode, setSortMode] = useState("alpha");
  const [showHighlight, setShowHighlight] = useState(true);
  const [exportWidthIn, setExportWidthIn] = useState(10);
  const [exportHeightIn, setExportHeightIn] = useState(5);
  const [expandedFacets, setExpandedFacets] = useState(new Set());
  const [selectedTimepoints, setSelectedTimepoints] = useState(new Set(EVODEVO_TIMEPOINTS));

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!junction) { setFetchedRows([]); return; }
    setLoading(true);
    setFetchError(null);
    fetch(`${API_BASE}/junction-cpm/?junction=${encodeURIComponent(junction)}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data) => setFetchedRows(data))
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [junction]);

  const groups = useMemo(() => {
    const src = fetchedRows.length ? fetchedRows : rows;
    const pts = src.map((r, i) => ({
      id: r.biospecimen_id ?? `S${i}`,
      cpm: Number(r.cpm),
      log2CpmCorrected: r.log2_cpm_corrected ?? null,
      histology: collapseControlGroup(r.plot_group ?? "Unknown"),
      cancerGroup: r.cancer_group ?? null,
      cohort: r.cohort ?? null,
      isCellLine: r.composition === "Derived Cell Line",
      isIndependentPrimary: r.is_independent_primary,
      rnaLibrary: r.rna_library ?? null,
      jitter: Math.random() - 0.5,
    }));

    // Tumor samples are restricted to independent primaries; cell lines and
    // controls (is_independent_primary === null) are unaffected by this filter.
    const filtered = pts.filter((d) => d.isCellLine || d.isIndependentPrimary !== false);

    const groupByHistology = (src, isCellLineGroup) =>
      Array.from(d3.group(src, (d) => `${d.cohort ?? ""}::${d.histology}`), ([groupKey, values]) => {
        const histology = values[0].histology;
        const hasCancerGroup = values.some((d) => d.cancerGroup != null);
        const isNonNeoplastic = !isCellLineGroup && histology.toLowerCase().includes("non-neoplastic");
        const isTumor = !isCellLineGroup && (hasCancerGroup || isNonNeoplastic);
        const isControl = !isCellLineGroup && !isTumor;
        return {
          key: groupKey, label: histology, values, isTumor, isControl,
          isCellLine: isCellLineGroup,
          cohort: values[0]?.cohort ?? null,
          stats: boxStats(values.map((d) => d.cpm)),
        };
      });

    const tumorPts = filtered.filter((d) => !d.isCellLine);
    const cellLinePts = filtered.filter((d) => d.isCellLine);

    const tumorAndControlGroups = groupByHistology(tumorPts, false);
    const cellLineGroups = groupByHistology(cellLinePts, true);

    // Cell-line groups can share a histology name with a tumor/control group
    // (e.g. "DIPG or DMG"). Disambiguate the key in that case so the two stay
    // distinct for selectedGroups, React list keys, and the scaleBand domain;
    // `label` keeps the plain histology name for display and color lookup.
    const tumorAndControlKeys = new Set(tumorAndControlGroups.map((g) => g.key));
    cellLineGroups.forEach((g) => {
      if (tumorAndControlKeys.has(g.key)) g.key = `${g.key} (Cell Line)`;
    });

    const typeRank = (g) => (g.isTumor ? 0 : g.isControl ? 1 : 2);

    return [...tumorAndControlGroups, ...cellLineGroups].sort((a, b) => {
      const rankDiff = typeRank(a) - typeRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (sortMode === "asc") return a.stats.median - b.stats.median;
      if (sortMode === "desc") return b.stats.median - a.stats.median;
      return a.label.localeCompare(b.label);
    });
  }, [fetchedRows, rows, sortMode]);

  const evodevoPoints = useMemo(() => {
    const src = fetchedRows.length ? fetchedRows : rows;
    return src
      .filter((r) => r.cohort === "Evo-devo")
      .map((r, i) => {
        const pg = r.plot_group ?? "";
        const dash = pg.indexOf("-");
        return {
          id: r.biospecimen_id ?? `S${i}`,
          cpm: Number(r.cpm),
          log2CpmCorrected: r.log2_cpm_corrected ?? null,
          region: dash >= 0 ? pg.slice(0, dash) : pg,
          timepoint: dash >= 0 ? pg.slice(dash + 1) : pg,
          rnaLibrary: r.rna_library ?? null,
        };
      })
      .filter((d) => d.region === "Forebrain" || d.region === "Hindbrain");
  }, [fetchedRows, rows]);

  const presentTimepoints = useMemo(
    () => EVODEVO_TIMEPOINTS.filter((tp) => evodevoPoints.some((d) => d.timepoint === tp)),
    [evodevoPoints],
  );

  const filteredEvodevoPoints = useMemo(
    () => evodevoPoints.filter((d) => selectedTimepoints.has(d.timepoint)),
    [evodevoPoints, selectedTimepoints],
  );

  const tabGroups = useMemo(() => {
    if (activeTab === 0) return groups.filter((g) => g.isTumor);
    if (activeTab === 1) return groups.filter((g) => g.isControl || g.isTumor);
    if (activeTab === 2) return groups.filter((g) => g.isCellLine || g.isTumor);
    if (activeTab === 3) return [];
    return groups;
  }, [groups, activeTab]);

  useEffect(() => {
    // Tumors vs Controls: cell lines default off. Controls/Cell Lines tabs: tumors default off.
    let defaultGroups = tabGroups;
    if (activeTab === 4) defaultGroups = tabGroups.filter((g) => !g.isCellLine);
    else if (activeTab === 1 || activeTab === 2) defaultGroups = tabGroups.filter((g) => !g.isTumor);
    setSelectedGroups(new Set(defaultGroups.map((g) => g.key)));
  }, [tabGroups, activeTab]);

  const visibleGroups = useMemo(
    () => tabGroups.filter((g) => selectedGroups.has(g.key)),
    [tabGroups, selectedGroups],
  );

  const activeHighlightIds = showHighlight ? highlightIds : EMPTY_SET;

  useEffect(() => {
    if (!svgRef.current || activeTab === 3) return;
    drawBoxPlot(d3.select(svgRef.current), {
      width: containerWidth,
      height,
      visibleGroups,
      log2Scale,
      highlightIds: activeHighlightIds,
      onHover: (e, html) => setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }),
      onMove: (e) => setTooltip((prev) => ({ ...prev, x: e.clientX + 14, y: e.clientY - 32 })),
      onLeave: () => setTooltip((prev) => ({ ...prev, visible: false })),
    });
  }, [visibleGroups, containerWidth, height, activeTab, activeHighlightIds, log2Scale]);

  useEffect(() => {
    if (!svgRef.current || activeTab !== 3) return;
    drawEvoDevoPlot(d3.select(svgRef.current), {
      width: containerWidth,
      height,
      evodevoPoints: filteredEvodevoPoints,
      log2Scale,
      textColor: theme.palette.text.primary,
      onHover: (e, html) => setTooltip({ visible: true, x: e.clientX + 14, y: e.clientY - 32, html }),
      onMove: (e) => setTooltip((prev) => ({ ...prev, x: e.clientX + 14, y: e.clientY - 32 })),
      onLeave: () => setTooltip((prev) => ({ ...prev, visible: false })),
    });
  }, [filteredEvodevoPoints, activeTab, containerWidth, height, log2Scale, theme.palette.text.primary]);

  function exportFilename(ext) {
    return `junction-cpm${junction ? `-${junction}` : ""}.${ext}`;
  }

  function buildExportSvgEl() {
    return buildExportSvg({
      width: exportWidthIn * PX_PER_INCH,
      height: exportHeightIn * PX_PER_INCH,
      activeTab,
      visibleGroups,
      evodevoPoints: filteredEvodevoPoints,
      log2Scale,
      highlightIds: activeHighlightIds,
    });
  }

  async function downloadAsPdf() {
    const { jsPDF } = await import("jspdf");
    const { clone, svgWidth, svgHeight } = cloneSvgWithBackground(buildExportSvgEl(), title);
    const canvas = await svgToCanvas(clone, svgWidth, svgHeight, EXPORT_SCALE);

    const pdf = new jsPDF({
      orientation: svgWidth > svgHeight ? "landscape" : "portrait",
      unit: "px",
      format: [svgWidth, svgHeight],
      hotfixes: ["px_scaling"],
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, svgWidth, svgHeight);
    pdf.save(exportFilename("pdf"));
  }

  async function downloadAsPng() {
    const { clone, svgWidth, svgHeight } = cloneSvgWithBackground(buildExportSvgEl(), title);
    const canvas = await svgToCanvas(clone, svgWidth, svgHeight, EXPORT_SCALE);
    triggerDownload(canvas.toDataURL("image/png"), exportFilename("png"));
  }

  async function downloadAsTiff() {
    const UTIFModule = await import("utif2");
    const UTIF = UTIFModule.default ?? UTIFModule;
    const { clone, svgWidth, svgHeight } = cloneSvgWithBackground(buildExportSvgEl(), title);
    const canvas = await svgToCanvas(clone, svgWidth, svgHeight, EXPORT_SCALE);
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tiff = UTIF.encodeImage(data, canvas.width, canvas.height);
    const url = URL.createObjectURL(new Blob([tiff], { type: "image/tiff" }));
    triggerDownload(url, exportFilename("tiff"));
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadAsSvg() {
    const { clone } = cloneSvgWithBackground(buildExportSvgEl(), title);
    const svgStr = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    triggerDownload(url, exportFilename("svg"));
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function toggleGroup(key) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const groupSections = [
    { label: "Primary Tumors", items: tabGroups.filter((g) => g.isTumor) },
    { label: "Controls", items: tabGroups.filter((g) => g.isControl) },
    { label: "Cell Lines", items: tabGroups.filter((g) => g.isCellLine) },
  ].filter((s) => s.items.length > 0);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={log2Scale}
                onChange={(e) => setLog2Scale(e.target.checked)}
              />
            }
            label={<Typography variant="body2">log₂</Typography>}
            sx={{ mr: 0 }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showHighlight}
                onChange={(e) => setShowHighlight(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Show enriched</Typography>}
            sx={{ mr: 0 }}
          />
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" color="text.secondary">Sort:</Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={sortMode}
              onChange={(_, v) => { if (v !== null) setSortMode(v); }}
            >
              <ToggleButton value="asc" sx={{ px: 1, py: 0.25, fontSize: 13 }}>↑</ToggleButton>
              <ToggleButton value="alpha" sx={{ px: 1, py: 0.25, fontSize: 11 }}>A–Z</ToggleButton>
              <ToggleButton value="desc" sx={{ px: 1, py: 0.25, fontSize: 13 }}>↓</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SettingsIcon fontSize="small" />}
            onClick={(e) => setSettingsAnchor(e.currentTarget)}
          >
            Configure Samples
          </Button>
          <Tooltip title="Download plot">
            <IconButton size="small" onClick={(e) => setExportAnchor(e.currentTarget)}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Image size (in)
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Width"
                  type="number"
                  size="small"
                  value={exportWidthIn}
                  onChange={(e) => setExportWidthIn(Math.max(1, Number(e.target.value) || 0))}
                  inputProps={{ min: 1, step: 0.1 }}
                  sx={{ width: 100 }}
                />
                <TextField
                  label="Height"
                  type="number"
                  size="small"
                  value={exportHeightIn}
                  onChange={(e) => setExportHeightIn(Math.max(1, Number(e.target.value) || 0))}
                  inputProps={{ min: 1, step: 0.1 }}
                  sx={{ width: 100 }}
                />
              </Stack>
            </Box>
            <Divider />
            <MenuItem onClick={() => { setExportAnchor(null); downloadAsPng(); }}>PNG (300 DPI)</MenuItem>
            <MenuItem onClick={() => { setExportAnchor(null); downloadAsPdf(); }}>PDF (300 DPI)</MenuItem>
            <MenuItem onClick={() => { setExportAnchor(null); downloadAsTiff(); }}>TIFF (300 DPI)</MenuItem>
            <MenuItem onClick={() => { setExportAnchor(null); downloadAsSvg(); }}>SVG</MenuItem>
          </Menu>
        </Stack>
      </Box>

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 1, borderBottom: 1, borderColor: "divider" }}
      >
        <Tab label="Primary Tumors" />
        <Tab label="Controls" />
        <Tab label="Cell Lines" />
        <Tab label="Evo-Devo" />
        <Tab label="Tumors vs Controls" />
      </Tabs>

      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 2, minWidth: 240, maxHeight: 480, overflowY: "auto" }}>
          {activeTab === 3 && (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                <Button size="small" onClick={() => setSelectedTimepoints(new Set(presentTimepoints))}>All</Button>
                <Button size="small" onClick={() => setSelectedTimepoints(new Set())}>None</Button>
              </Stack>
              {presentTimepoints.map((tp) => (
                <Box key={tp} sx={{ display: "block" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedTimepoints.has(tp)}
                        onChange={() => setSelectedTimepoints((prev) => {
                          const next = new Set(prev);
                          next.has(tp) ? next.delete(tp) : next.add(tp);
                          return next;
                        })}
                      />
                    }
                    label={<Typography variant="body2">{EVODEVO_LABELS[tp] ?? tp}</Typography>}
                  />
                </Box>
              ))}
            </>
          )}

          {activeTab !== 3 && groupSections.map((section, i) => (
            <Box key={section.label}>
              {i > 0 && <Divider sx={{ my: 1 }} />}
              {groupSections.length > 1 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                  {section.label}
                </Typography>
              )}

              {(section.label === "Primary Tumors" || groupSections.length === 1) && (
                <>
                  <Stack direction="row" spacing={0.5} sx={{ mb: 0.5 }}>
                    <Button size="small" onClick={() => setSelectedGroups((prev) => {
                      const next = new Set(prev);
                      section.items.forEach((g) => next.add(g.key));
                      return next;
                    })}>All</Button>
                    <Button size="small" onClick={() => setSelectedGroups((prev) => {
                      const next = new Set(prev);
                      section.items.forEach((g) => next.delete(g.key));
                      return next;
                    })}>None</Button>
                    {(() => {
                      const enrichedKeys = section.items
                        .filter((g) => g.values.some((d) => highlightIds.has(d.id)))
                        .map((g) => g.key);
                      if (enrichedKeys.length === 0) return null;
                      return (
                        <Button size="small" onClick={() => setSelectedGroups((prev) => {
                          const next = new Set(prev);
                          section.items.forEach((g) => next.delete(g.key));
                          enrichedKeys.forEach((k) => next.add(k));
                          return next;
                        })}>Enriched</Button>
                      );
                    })()}
                  </Stack>
                  {section.items.map((g) => (
                    <Box key={g.key} sx={{ display: "block" }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={selectedGroups.has(g.key)}
                            onChange={() => toggleGroup(g.key)}
                            sx={{ color: groupColor(g), "&.Mui-checked": { color: groupColor(g) } }}
                          />
                        }
                        label={<Typography variant="body2">{g.label}</Typography>}
                      />
                    </Box>
                  ))}
                </>
              )}

              {section.label === "Controls" && (
                <>
                  {Object.entries(
                    section.items.reduce((acc, g) => {
                      const f = facetName(g);
                      (acc[f] = acc[f] || []).push(g);
                      return acc;
                    }, {})
                  )
                  .sort(([a], [b]) => FACET_ORDER.indexOf(a) - FACET_ORDER.indexOf(b))
                  .map(([facet, items]) => {
                    const allOn = items.every((g) => selectedGroups.has(g.key));
                    const someOn = items.some((g) => selectedGroups.has(g.key));
                    const isExpanded = expandedFacets.has(facet);
                    return (
                      <Box key={facet}>
                        <Stack direction="row" alignItems="center">
                          <Checkbox
                            size="small"
                            checked={allOn}
                            indeterminate={!allOn && someOn}
                            onChange={() => setSelectedGroups((prev) => {
                              const next = new Set(prev);
                              if (allOn) items.forEach((g) => next.delete(g.key));
                              else items.forEach((g) => next.add(g.key));
                              return next;
                            })}
                          />
                          <Typography variant="body2" sx={{ flex: 1 }}>{facet}</Typography>
                          <IconButton
                            size="small"
                            onClick={() => setExpandedFacets((prev) => {
                              const next = new Set(prev);
                              next.has(facet) ? next.delete(facet) : next.add(facet);
                              return next;
                            })}
                          >
                            <Typography variant="caption" sx={{ lineHeight: 1 }}>{isExpanded ? "▴" : "▾"}</Typography>
                          </IconButton>
                        </Stack>
                        {isExpanded && items.map((g) => (
                          <Box key={g.key} sx={{ pl: 2.5, display: "block" }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={selectedGroups.has(g.key)}
                                  onChange={() => toggleGroup(g.key)}
                                />
                              }
                              label={<Typography variant="body2">{g.label}</Typography>}
                            />
                          </Box>
                        ))}
                      </Box>
                    );
                  })}
                </>
              )}

              {section.label === "Cell Lines" && section.items.map((g) => (
                <Box key={g.key} sx={{ display: "block" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedGroups.has(g.key)}
                        onChange={() => toggleGroup(g.key)}
                        sx={{ color: groupColor(g), "&.Mui-checked": { color: groupColor(g) } }}
                      />
                    }
                    label={<Typography variant="body2">{g.label}</Typography>}
                  />
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Popover>

      <Box ref={containerRef} sx={{ width: "100%" }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress />
          </Box>
        ) : fetchError ? (
          <Alert severity="error">Failed to load CPM data: {fetchError}</Alert>
        ) : (
          <svg ref={svgRef} width={containerWidth} height={height} style={{ display: "block" }} />
        )}
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

function collapseControlGroup(plotGroup) {
  if (plotGroup.startsWith("Forebrain-")) {
    return plotGroup.includes("Week Post Conception")
      ? "Forebrain (Prenatal)"
      : "Forebrain (Postnatal)";
  }
  if (plotGroup.startsWith("Hindbrain-")) {
    return plotGroup.includes("Week Post Conception")
      ? "Hindbrain (Prenatal)"
      : "Hindbrain (Postnatal)";
  }
  if (plotGroup.startsWith("Brain - ")) {
    const stripped = plotGroup.slice("Brain - ".length);
    if (stripped.includes("basal ganglia")) return "Basal Ganglia";
    return stripped;
  }
  if (plotGroup.includes("basal ganglia")) return "Basal Ganglia";
  return plotGroup;
}
