import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider,
  FormControlLabel, IconButton, Paper, Popover, Stack, Switch, Tab, Tabs, Tooltip, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import SettingsIcon from "@mui/icons-material/Settings";
import * as d3 from "d3";
import { histologyColor } from "../histologyColors";

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
  "Neonate": "Neonate", "Infant": "Infant", "Toddler": "Toddler",
  "School Age Child": "School Age", "Adolescent": "Adolescent", "Young Adult": "Young Adult",
};

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
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, html: "" });
  const [activeTab, setActiveTab] = useState(0);
  const [log2Scale, setLog2Scale] = useState(false);

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
      isCellLine: r.composition === "Derived Cell Line",
      isIndependentPrimary: r.is_independent_primary,
      jitter: Math.random() - 0.5,
    }));

    // Tumor samples are restricted to independent primaries; cell lines and
    // controls (is_independent_primary === null) are unaffected by this filter.
    const filtered = pts.filter((d) => d.isCellLine || d.isIndependentPrimary !== false);

    const groupByHistology = (src, isCellLineGroup) =>
      Array.from(d3.group(src, (d) => d.histology), ([key, values]) => {
        const hasCancerGroup = values.some((d) => d.cancerGroup != null);
        const isNonNeoplastic = !isCellLineGroup && key.toLowerCase().includes("non-neoplastic");
        const isTumor = !isCellLineGroup && (hasCancerGroup || isNonNeoplastic);
        const isControl = !isCellLineGroup && !isTumor;
        return {
          key, values, isTumor, isNonNeoplastic, isControl,
          isCellLine: isCellLineGroup,
          stats: boxStats(values.map((d) => d.cpm)),
        };
      });

    const tumorPts = filtered.filter((d) => !d.isCellLine);
    const cellLinePts = filtered.filter((d) => d.isCellLine);

    return [...groupByHistology(tumorPts, false), ...groupByHistology(cellLinePts, true)].sort((a, b) => {
      if (a.isTumor && b.isTumor && a.isNonNeoplastic !== b.isNonNeoplastic)
        return a.isNonNeoplastic ? 1 : -1;
      return a.key.localeCompare(b.key);
    });
  }, [fetchedRows, rows]);

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
        };
      })
      .filter((d) => d.region === "Forebrain" || d.region === "Hindbrain");
  }, [fetchedRows, rows]);

  const tabGroups = useMemo(() => {
    if (activeTab === 0) return groups.filter((g) => g.isTumor);
    if (activeTab === 1) return groups.filter((g) => g.isControl);
    if (activeTab === 2) return groups.filter((g) => g.isCellLine);
    return groups;
  }, [groups, activeTab]);

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

    visibleGroups.forEach(({ key, values }) => {
      const xVals = values.map(xform);
      const { q1, median, q3, lo, hi } = boxStats(xVals);
      const cx = x(key) + x.bandwidth() / 2;
      const bw = x.bandwidth() * 0.55;
      const color = histologyColor(key);
      const fmt = (v) => v.toFixed(3);
      const label = log2Scale ? "log₂(CPM+1)" : "CPM";

      const boxTip = `<strong>${key}</strong><br/>n=${values.length}<br/>Median: ${fmt(median)}<br/>IQR: [${fmt(q1)}, ${fmt(q3)}]<br/>Whiskers: [${fmt(lo)}, ${fmt(hi)}]`;

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
            showTip(e, `<strong>${d.id}</strong><br/>${key}<br/>${label}: ${xform(d).toFixed(3)}${highlighted ? "<br/><em>tumor enriched</em>" : ""}`)
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
            showTip(e, `<strong>${d.id}</strong><br/>${region} — ${d.timepoint}<br/>CPM: ${xform(d).toFixed(3)}`)
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
            showTip(e, `<strong>${region}</strong><br/>${d.timepoint}<br/>Mean: ${d.value.toFixed(3)}`)
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

  async function downloadAsPdf() {
    const { jsPDF } = await import("jspdf");
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const svgWidth = Number(svgEl.getAttribute("width"));
    const svgHeight = Number(svgEl.getAttribute("height"));

    const clone = svgEl.cloneNode(true);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", svgWidth);
    bg.setAttribute("height", svgHeight);
    bg.setAttribute("fill", "white");
    clone.insertBefore(bg, clone.firstChild);

    const svgStr = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));

    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = svgWidth * scale;
      canvas.height = svgHeight * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      const pdf = new jsPDF({
        orientation: svgWidth > svgHeight ? "landscape" : "portrait",
        unit: "px",
        format: [svgWidth, svgHeight],
        hotfixes: ["px_scaling"],
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, svgWidth, svgHeight);
      pdf.save(`junction-cpm${junction ? `-${junction}` : ""}.pdf`);
    };
    img.src = url;
  }

  function toggleGroup(key) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const cancerGroups = tabGroups.filter((g) => g.isTumor && !g.isNonNeoplastic);
  const nonNeoplasticGroups = tabGroups.filter((g) => g.isNonNeoplastic);

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
          <Tooltip title="Configure groups">
            <IconButton size="small" onClick={(e) => setSettingsAnchor(e.currentTarget)}>
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download as PDF">
            <IconButton size="small" onClick={downloadAsPdf}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
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

          {cancerGroups.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                Cancer
              </Typography>
              {cancerGroups.map(({ key }) => (
                <Box key={key} sx={{ display: "block" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedGroups.has(key)}
                        onChange={() => toggleGroup(key)}
                        sx={{ color: histologyColor(key), "&.Mui-checked": { color: histologyColor(key) } }}
                      />
                    }
                    label={<Typography variant="body2">{key}</Typography>}
                  />
                </Box>
              ))}
            </>
          )}

          {cancerGroups.length > 0 && nonNeoplasticGroups.length > 0 && (
            <Divider sx={{ my: 1 }} />
          )}

          {nonNeoplasticGroups.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                Non-neoplastic
              </Typography>
              {nonNeoplasticGroups.map(({ key }) => (
                <Box key={key} sx={{ display: "block" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedGroups.has(key)}
                        onChange={() => toggleGroup(key)}
                        sx={{ color: histologyColor(key), "&.Mui-checked": { color: histologyColor(key) } }}
                      />
                    }
                    label={<Typography variant="body2">{key}</Typography>}
                  />
                </Box>
              ))}
            </>
          )}

          {activeTab !== 0 && tabGroups.map(({ key }) => (
            <Box key={key} sx={{ display: "block" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={selectedGroups.has(key)}
                    onChange={() => toggleGroup(key)}
                    sx={{ color: histologyColor(key), "&.Mui-checked": { color: histologyColor(key) } }}
                  />
                }
                label={<Typography variant="body2">{key}</Typography>}
              />
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
