import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, Divider,
  FormControlLabel, IconButton, Paper, Popover, Stack, Tooltip, Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import SettingsIcon from "@mui/icons-material/Settings";
import * as d3 from "d3";
import { histologyColor } from "../histologyColors";

const MARGIN = { top: 20, right: 20, bottom: 200, left: 100 };
const API_BASE = "/api/tapestry-api";
const EMPTY_ROWS = [];

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

export default function PlotArea({
  title = "Junction CPM by histology",
  junction = null,
  rows = EMPTY_ROWS,
  height = 460,
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(900);
  const [fetchedRows, setFetchedRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [settingsAnchor, setSettingsAnchor] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, html: "" });

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
    const src = fetchedRows.length ? fetchedRows : rows.length ? rows : demoRows();
    const pts = src.map((r, i) => ({
      id: r.biospecimen_id ?? `S${i}`,
      cpm: Number(r.cpm),
      histology: r.plot_group ?? "Unknown",
      cancerGroup: r.cancer_group ?? null,
      jitter: Math.random() - 0.5,
    }));
    return Array.from(d3.group(pts, (d) => d.histology), ([key, values]) => {
      const isControl = values.every((d) => d.cancerGroup == null);
      return { key, values, isControl, stats: boxStats(values.map((d) => d.cpm)) };
    }).sort((a, b) => {
      if (a.isControl !== b.isControl) return a.isControl ? 1 : -1;
      return a.key.localeCompare(b.key);
    });
  }, [fetchedRows, rows]);

  // Reset selection to all groups whenever the underlying data changes
  useEffect(() => {
    setSelectedGroups(new Set(groups.map((g) => g.key)));
  }, [groups]);

  const visibleGroups = useMemo(
    () => groups.filter((g) => selectedGroups.has(g.key)),
    [groups, selectedGroups],
  );

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const iW = containerWidth - MARGIN.left - MARGIN.right;
    const iH = height - MARGIN.top - MARGIN.bottom;

    const allCpms = visibleGroups.flatMap((g) => g.values.map((d) => d.cpm));
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
      .text("CPM");

    // Dashed divider between cancer and control groups
    const firstControlIdx = visibleGroups.findIndex((g) => g.isControl);
    if (firstControlIdx > 0) {
      const lastCancerKey = visibleGroups[firstControlIdx - 1].key;
      const firstControlKey = visibleGroups[firstControlIdx].key;
      const divX = (x(lastCancerKey) + x.bandwidth() + x(firstControlKey)) / 2;
      root.append("line")
        .attr("x1", divX).attr("x2", divX)
        .attr("y1", 0).attr("y2", iH)
        .attr("stroke", "#bbb").attr("stroke-width", 1).attr("stroke-dasharray", "4,3");
    }

    const showTip = (event, html) =>
      setTooltip({ visible: true, x: event.clientX + 14, y: event.clientY - 32, html });
    const moveTip = (event) =>
      setTooltip((prev) => ({ ...prev, x: event.clientX + 14, y: event.clientY - 32 }));
    const hideTip = () =>
      setTooltip((prev) => ({ ...prev, visible: false }));

    visibleGroups.forEach(({ key, values, stats: { q1, median, q3, lo, hi } }) => {
      const cx = x(key) + x.bandwidth() / 2;
      const bw = x.bandwidth() * 0.55;
      const color = histologyColor(key);
      const fmt = (v) => v.toFixed(3);

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

      values.forEach((d) =>
        root.append("circle")
          .attr("cx", cx + d.jitter * bw * 0.65)
          .attr("cy", y(d.cpm))
          .attr("r", 3)
          .attr("fill", color).attr("fill-opacity", 0.55)
          .attr("stroke", "white").attr("stroke-width", 0.5)
          .style("cursor", "pointer")
          .on("mouseover", (e) =>
            showTip(e, `<strong>${d.id}</strong><br/>${key}<br/>CPM: ${d.cpm.toFixed(3)}`)
          )
          .on("mousemove", moveTip)
          .on("mouseout", hideTip)
      );
    });
  }, [visibleGroups, containerWidth, height]);

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

  const cancerGroups = groups.filter((g) => !g.isControl);
  const controlGroups = groups.filter((g) => g.isControl);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography sx={{ fontWeight: 800 }}>{title}</Typography>
        <Stack direction="row" spacing={0.5}>
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

      <Popover
        open={Boolean(settingsAnchor)}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <Box sx={{ p: 2, minWidth: 220, maxHeight: 480, overflowY: "auto" }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Button size="small" onClick={() => setSelectedGroups(new Set(groups.map((g) => g.key)))}>
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

          {cancerGroups.length > 0 && controlGroups.length > 0 && (
            <Divider sx={{ my: 1 }} />
          )}

          {controlGroups.length > 0 && (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: "block", mb: 0.5 }}>
                Controls
              </Typography>
              {controlGroups.map(({ key }) => (
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

function demoRows() {
  const groups = [
    { plot_group: "HGG", cancer_group: "HGG", mean: 8, sd: 3, n: 40 },
    { plot_group: "LGG", cancer_group: "LGG", mean: 5, sd: 2, n: 35 },
    { plot_group: "Medulloblastoma", cancer_group: "MB", mean: 10, sd: 4, n: 30 },
    { plot_group: "Normal", cancer_group: null, mean: 1, sd: 0.5, n: 25 },
    { plot_group: "GTEx Brain", cancer_group: null, mean: 0.5, sd: 0.3, n: 20 },
  ];
  const rows = [];
  let k = 0;
  for (const { plot_group, cancer_group, mean, sd, n } of groups) {
    for (let i = 0; i < n; i++) {
      rows.push({ biospecimen_id: `S${++k}`, plot_group, cancer_group, cpm: Math.max(0, randn(mean, sd)) });
    }
  }
  return rows;
}

function randn(mean, sd) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

