import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider,
  FormControlLabel, IconButton, Menu, MenuItem, Paper, Popover, Stack, Switch, Tab, Tabs, Tooltip, Typography,
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

function cloneSvgWithBackground(svgEl) {
  const svgWidth = Number(svgEl.getAttribute("width"));
  const svgHeight = Number(svgEl.getAttribute("height"));
  const clone = svgEl.cloneNode(true);
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", svgWidth);
  bg.setAttribute("height", svgHeight);
  bg.setAttribute("fill", "white");
  clone.insertBefore(bg, clone.firstChild);
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

export default function PlotArea({
  junction = null,
  gene = null,
  rows = EMPTY_ROWS,
  height = 460,
  highlightIds = EMPTY_SET,
}) {
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
  const [sortByMedian, setSortByMedian] = useState(false);

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
      Array.from(d3.group(src, (d) => d.histology), ([histology, values]) => {
        const hasCancerGroup = values.some((d) => d.cancerGroup != null);
        const isNonNeoplastic = !isCellLineGroup && histology.toLowerCase().includes("non-neoplastic");
        const isTumor = !isCellLineGroup && (hasCancerGroup || isNonNeoplastic);
        const isControl = !isCellLineGroup && !isTumor;
        return {
          key: histology, label: histology, values, isTumor, isControl,
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
      if (sortByMedian) return b.stats.median - a.stats.median;
      return a.label.localeCompare(b.label);
    });
  }, [fetchedRows, rows, sortByMedian]);

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

  const tabGroups = useMemo(() => {
    // Controls and Cell Lines also show tumor groups for histologies where
    // this junction is histology-enriched (at least one sample is in
    // highlightIds / sample_tej), as a reference for comparison. `groups` is
    // already ordered with tumor groups first, so they stay ahead of the
    // controls/cell lines after filtering.
    const isEnrichedTumor = (g) => g.isTumor && g.values.some((d) => highlightIds.has(d.id));
    if (activeTab === 0) return groups.filter((g) => g.isTumor);
    if (activeTab === 1) return groups.filter((g) => g.isControl || isEnrichedTumor(g));
    if (activeTab === 2) return groups.filter((g) => g.isCellLine || isEnrichedTumor(g));
    return groups;
  }, [groups, activeTab, highlightIds]);

  useEffect(() => {
    setSelectedGroups(new Set(tabGroups.map((g) => g.key)));
  }, [tabGroups]);

  const visibleGroups = useMemo(
    () => tabGroups.filter((g) => selectedGroups.has(g.key)),
    [tabGroups, selectedGroups],
  );

  useEffect(() => {
    if (!svgRef.current || activeTab === 3) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const iW = containerWidth - MARGIN.left - MARGIN.right;
    const iH = height - MARGIN.top - MARGIN.bottom;

    const xform = (d) => log2Scale ? (d.log2CpmCorrected ?? Math.log2(d.cpm + 1)) : d.cpm;

    const allCpms = visibleGroups.flatMap((g) => g.values.map(xform));
    const yMax = d3.max(allCpms) ?? 1;

    const x = d3.scaleBand()
      .domain(visibleGroups.map((g) => g.key))
      .range([0, iW])
      .padding(0.35);

    const y = d3.scaleLinear().domain([0, yMax]).nice().range([iH, 0]);

    const root = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    root.append("g")
      .call(d3.axisLeft(y).tickSize(-iW).tickFormat(""))
      .call((g) => g.select(".domain").remove())
      .call((g) => g.selectAll("line").attr("stroke", "#e0e0e0").attr("stroke-dasharray", "3,3"));

    root.append("g")
      .attr("transform", `translate(0,${iH})`)
      .call(d3.axisBottom(x))
      .selectAll("text")
      .attr("transform", "rotate(-55)")
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
      .attr("fill", "#666")
      .text(log2Scale ? "log₂(CPM + 1)" : "CPM");

    const showTip = (event, html) =>
      setTooltip({ visible: true, x: event.clientX + 14, y: event.clientY - 32, html });
    const moveTip = (event) =>
      setTooltip((prev) => ({ ...prev, x: event.clientX + 14, y: event.clientY - 32 }));
    const hideTip = () =>
      setTooltip((prev) => ({ ...prev, visible: false }));

    // Vertical separator after the Tumor block, before Controls/Cell Lines.
    const gap = x.step() - x.bandwidth();
    for (let i = 1; i < visibleGroups.length; i++) {
      if (!(visibleGroups[i - 1].isTumor && !visibleGroups[i].isTumor)) continue;
      const dividerX = x(visibleGroups[i].key) - gap / 2;
      root.append("line")
        .attr("x1", dividerX).attr("x2", dividerX)
        .attr("y1", 0).attr("y2", iH)
        .attr("stroke", "#bbb")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "2,2");
    }

    visibleGroups.forEach((g) => {
      const { key, label, values } = g;
      const xVals = values.map(xform);
      const { q1, median, q3, lo, hi } = boxStats(xVals);
      const cx = x(key) + x.bandwidth() / 2;
      const bw = x.bandwidth() * 0.55;
      const color = groupColor(g);
      const fmt = (v) => v.toFixed(3);
      const axisLabel = log2Scale ? "log₂(CPM+1)" : "CPM";

      const boxTip = `<strong>${label}</strong><br/>n=${values.length}<br/>Median: ${fmt(median)}<br/>IQR: [${fmt(q1)}, ${fmt(q3)}]<br/>Whiskers: [${fmt(lo)}, ${fmt(hi)}]`;

      root.append("line").attr("x1", cx).attr("x2", cx)
        .attr("y1", y(lo)).attr("y2", y(q1))
        .attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");
      root.append("line").attr("x1", cx).attr("x2", cx)
        .attr("y1", y(q3)).attr("y2", y(hi))
        .attr("stroke", color).attr("stroke-width", 1.5).attr("stroke-dasharray", "4,2");

      [lo, hi].forEach((v) =>
        root.append("line")
          .attr("x1", cx - bw / 4).attr("x2", cx + bw / 4)
          .attr("y1", y(v)).attr("y2", y(v))
          .attr("stroke", color).attr("stroke-width", 1.5)
      );

      root.append("rect")
        .attr("x", cx - bw / 2).attr("y", y(q3))
        .attr("width", bw).attr("height", Math.abs(y(q1) - y(q3)))
        .attr("fill", color).attr("fill-opacity", 0.2)
        .attr("stroke", color).attr("stroke-width", 1.5)
        .attr("rx", 2)
        .on("mouseover", (e) => showTip(e, boxTip))
        .on("mousemove", moveTip)
        .on("mouseout", hideTip);

      root.append("line")
        .attr("x1", cx - bw / 2).attr("x2", cx + bw / 2)
        .attr("y1", y(median)).attr("y2", y(median))
        .attr("stroke", color).attr("stroke-width", 2.5)
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
          .attr("stroke", highlighted ? "white" : "white")
          .attr("stroke-width", highlighted ? 1.5 : 0.5)
          .style("cursor", "pointer")
          .on("mouseover", (e) =>
            showTip(e, `<strong>${d.id}</strong><br/>${label}<br/>${axisLabel}: ${xform(d).toFixed(3)}<br/>RNA library: ${d.rnaLibrary ?? "—"}${highlighted ? "<br/><em>tumor enriched</em>" : ""}`)
          )
          .on("mousemove", moveTip)
          .on("mouseout", hideTip);
      });
    });
  }, [visibleGroups, containerWidth, height, activeTab, highlightIds, log2Scale]);

  useEffect(() => {
    if (!svgRef.current || activeTab !== 3) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const presentTimepoints = EVODEVO_TIMEPOINTS.filter((t) =>
      evodevoPoints.some((d) => d.timepoint === t)
    );
    if (presentTimepoints.length === 0) return;

    const xform = (d) => log2Scale ? (d.log2CpmCorrected ?? Math.log2(d.cpm + 1)) : d.cpm;

    const iW = containerWidth - MARGIN.left - MARGIN.right;
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
      .attr("fill", "#666")
      .text(log2Scale ? "log₂(CPM + 1)" : "CPM");

    const showTip = (event, html) =>
      setTooltip({ visible: true, x: event.clientX + 14, y: event.clientY - 32, html });
    const moveTip = (event) =>
      setTooltip((prev) => ({ ...prev, x: event.clientX + 14, y: event.clientY - 32 }));
    const hideTip = () => setTooltip((prev) => ({ ...prev, visible: false }));

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
          .attr("stroke", color)
          .attr("stroke-width", 0.5)
          .style("cursor", "pointer")
          .on("mouseover", (e) =>
            showTip(e, `<strong>${d.id}</strong><br/>${region} — ${timepointDisplay(d.timepoint)}<br/>CPM: ${xform(d).toFixed(3)}<br/>RNA library: ${d.rnaLibrary ?? "—"}`)
          )
          .on("mousemove", moveTip)
          .on("mouseout", hideTip);
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
            showTip(e, `<strong>${region}</strong><br/>${timepointDisplay(d.timepoint)}<br/>Mean: ${d.value.toFixed(3)}`)
          )
          .on("mousemove", moveTip)
          .on("mouseout", hideTip);
      });
    });

    const legend = root.append("g").attr("transform", `translate(${iW - 100}, 10)`);
    ["Forebrain", "Hindbrain"].forEach((region, i) => {
      const g = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
      g.append("line").attr("x1", 0).attr("x2", 20).attr("y1", 8).attr("y2", 8)
        .attr("stroke", EVODEVO_COLORS[region]).attr("stroke-width", 2);
      g.append("circle").attr("cx", 10).attr("cy", 8).attr("r", 4)
        .attr("fill", EVODEVO_COLORS[region]).attr("stroke", "white").attr("stroke-width", 1);
      g.append("text").attr("x", 26).attr("y", 12)
        .attr("font-size", 12).attr("fill", "#333").text(region);
    });
  }, [evodevoPoints, activeTab, containerWidth, height, log2Scale]);

  function exportFilename(ext) {
    return `junction-cpm${junction ? `-${junction}` : ""}.${ext}`;
  }

  async function downloadAsPdf() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const { jsPDF } = await import("jspdf");
    const { clone, svgWidth, svgHeight } = cloneSvgWithBackground(svgEl);
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
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const { clone, svgWidth, svgHeight } = cloneSvgWithBackground(svgEl);
    const canvas = await svgToCanvas(clone, svgWidth, svgHeight, EXPORT_SCALE);
    triggerDownload(canvas.toDataURL("image/png"), exportFilename("png"));
  }

  function downloadAsSvg() {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const { clone } = cloneSvgWithBackground(svgEl);
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
    { label: "Tumor", items: tabGroups.filter((g) => g.isTumor) },
    { label: "Controls", items: tabGroups.filter((g) => g.isControl) },
    { label: "Cell Lines", items: tabGroups.filter((g) => g.isCellLine) },
  ].filter((s) => s.items.length > 0);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={log2Scale}
                onChange={(e) => setLog2Scale(e.target.checked)}
              />
            }
            label={<Typography variant="body2">log₂</Typography>}
            sx={{ mr: 0.5 }}
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={sortByMedian}
                onChange={(e) => setSortByMedian(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Sort by median</Typography>}
            sx={{ mr: 0.5 }}
          />
          <Tooltip title="Configure groups">
            <IconButton size="small" onClick={(e) => setSettingsAnchor(e.currentTarget)}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download plot">
            <IconButton size="small" onClick={(e) => setExportAnchor(e.currentTarget)}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={() => { setExportAnchor(null); downloadAsPng(); }}>PNG (300 DPI)</MenuItem>
            <MenuItem onClick={() => { setExportAnchor(null); downloadAsPdf(); }}>PDF (300 DPI)</MenuItem>
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
        <Tab label="EvoDevo" />
        <Tab label="All" />
      </Tabs>

      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 2, minWidth: 220, maxHeight: 480, overflowY: "auto" }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button size="small" onClick={() => setSelectedGroups(new Set(tabGroups.map((g) => g.key)))}>
              All
            </Button>
            <Button size="small" onClick={() => setSelectedGroups(new Set())}>
              None
            </Button>
          </Stack>

          {groupSections.map((section, i) => (
            <Box key={section.label}>
              {i > 0 && <Divider sx={{ my: 1 }} />}
              {groupSections.length > 1 && (
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                  {section.label}
                </Typography>
              )}
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
