import { useEffect, useMemo, useRef } from "react";
import { Paper, Typography, Box } from "@mui/material";

export default function PlotArea({
  title = "PSI by histology",
  plotType = "Violin",
  rows = [],
  width = 900,
  height = 420,
  canvasId: canvasIdProp, // optional
}) {
  const cxRef = useRef(null);
  const canvasRef = useRef(null);

  // ✅ Unique id per instance unless caller provides one
  const canvasId = useMemo(() => {
    return canvasIdProp || `cx-${Math.random().toString(16).slice(2)}`;
  }, [canvasIdProp]);

  const dataFrame = useMemo(() => {
    const header = ["Id", "psi", "histology", "cohort"];
    const body = (rows.length ? rows : demoRows()).map((r, i) => [
      r.sampleId ?? `S${i + 1}`,
      Number(r.psi),
      r.histology ?? "Unknown",
      r.cohort ?? "Tumor",
    ]);
    return [header, ...body];
  }, [rows]);

  const config = useMemo(() => {
    return {
      graphType: plotType,
      graphOrientation: "vertical",
      title,
      groupingFactors: ["histology"],
      showLegend: false,
      smpTextRotate: 90,
      smpTitle: "Histology",
      yAxisTitle: "PSI",
    };
  }, [plotType, title]);

  useEffect(() => {
    if (!window.CanvasXpress) {
      console.error("CanvasXpress global not found. Check index.html script tag.");
      return;
    }

    const el = canvasRef.current;
    if (!el) return;

    // ✅ Make sure the DOM element has the id we will pass
    el.id = canvasId;

    // ✅ Guard: if CanvasXpress can’t find THIS exact element, it will append to <body>.
    // So only init when the document lookup points to our canvas.
    let raf = requestAnimationFrame(() => {
      if (cxRef.current) return; // already initialized
      const found = document.getElementById(canvasId);
      if (found !== el) {
        console.warn("Canvas id collision or not mounted yet:", canvasId);
        return;
      }
      cxRef.current = new window.CanvasXpress(canvasId, dataFrame, config);
    });

    return () => {
      cancelAnimationFrame(raf);
      try {
        cxRef.current?.destroy?.();
      } catch {}
      cxRef.current = null;
    };
  }, [canvasId, dataFrame, config]);

  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, width: "100%" }}>
      <Typography sx={{ fontWeight: 800, mb: 1 }}>{title}</Typography>
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <div style={{ width, height }}>
          <canvas ref={canvasRef} width={width} height={height} style={{ display: "block" }} />
        </div>
      </Box>
    </Paper>
  );
}

function demoRows() {
  const hist = ["HGG", "LGG", "Medulloblastoma"];
  const out = [];
  let k = 0;
  for (const h of hist) {
    for (let i = 0; i < 40; i++) {
      out.push({
        sampleId: `S${++k}`,
        histology: h,
        cohort: "Tumor",
        psi: clamp01(randn(0.55, 0.15)),
      });
    }
  }
  for (let i = 0; i < 30; i++) {
    out.push({
      sampleId: `N${i + 1}`,
      histology: "Normal",
      cohort: "Normal",
      psi: clamp01(randn(0.25, 0.1)),
    });
  }
  return out;
}

function randn(mean, sd) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + sd * z;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
