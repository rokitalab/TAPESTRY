import { useState } from "react";
import { Box, Divider, IconButton, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { jsPDF } from "jspdf";
import UTIF from "utif2";
import { cloneSvgWithBackground, svgToCanvas, triggerDownload, EXPORT_SCALE, PX_PER_INCH } from "./lib/svgExport";

// "Download plot" button + menu shared by PlotArea.jsx and
// JunctionExpressionHeatmap.jsx: lets the user pick an export size (in),
// then renders the plot at that size via `buildExportSvg` and offers it as
// PNG/PDF/TIFF (all 300 DPI) or vector SVG. `extraItems`, if given, is a
// render-prop `(closeMenu) => <MenuItem>...` for plot-specific extras (e.g.
// PlotArea's "TSV (plot data)" export of the underlying rows).
export default function PlotDownloadMenu({
  buildExportSvg, title, subtitle = null, filename,
  defaultWidthIn = 10, defaultHeightIn = 5, showHeightField = true,
  extraItems = null,
}) {
  const [anchor, setAnchor] = useState(null);
  const [widthIn, setWidthIn] = useState(defaultWidthIn);
  const [heightIn, setHeightIn] = useState(defaultHeightIn);

  function exportedClone() {
    const svgEl = buildExportSvg({ width: widthIn * PX_PER_INCH, height: heightIn * PX_PER_INCH });
    return cloneSvgWithBackground(svgEl, title, subtitle);
  }

  async function downloadAsPdf() {
    const { clone, svgWidth, svgHeight } = exportedClone();
    const canvas = await svgToCanvas(clone, svgWidth, svgHeight, EXPORT_SCALE);
    const pdf = new jsPDF({
      orientation: svgWidth > svgHeight ? "landscape" : "portrait",
      unit: "px",
      format: [svgWidth, svgHeight],
      hotfixes: ["px_scaling"],
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, svgWidth, svgHeight);
    pdf.save(filename("pdf"));
  }

  async function downloadAsPng() {
    const { clone, svgWidth, svgHeight } = exportedClone();
    const canvas = await svgToCanvas(clone, svgWidth, svgHeight, EXPORT_SCALE);
    triggerDownload(canvas.toDataURL("image/png"), filename("png"));
  }

  async function downloadAsTiff() {
    const { clone, svgWidth, svgHeight } = exportedClone();
    const canvas = await svgToCanvas(clone, svgWidth, svgHeight, EXPORT_SCALE);
    const ctx = canvas.getContext("2d");
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tiff = UTIF.encodeImage(data, canvas.width, canvas.height);
    const url = URL.createObjectURL(new Blob([tiff], { type: "image/tiff" }));
    triggerDownload(url, filename("tiff"));
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadAsSvg() {
    const { clone } = exportedClone();
    const svgStr = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" }));
    triggerDownload(url, filename("svg"));
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function closeMenu() {
    setAnchor(null);
  }

  return (
    <>
      <Tooltip title="Download plot">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
          <DownloadIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            Image size (in)
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Width"
              type="number"
              size="small"
              value={widthIn}
              onChange={(e) => setWidthIn(Math.max(1, Number(e.target.value) || 0))}
              inputProps={{ min: 1, step: 0.1 }}
              sx={{ width: 100 }}
            />
            {showHeightField && (
              <TextField
                label="Height"
                type="number"
                size="small"
                value={heightIn}
                onChange={(e) => setHeightIn(Math.max(1, Number(e.target.value) || 0))}
                inputProps={{ min: 1, step: 0.1 }}
                sx={{ width: 100 }}
              />
            )}
          </Stack>
        </Box>
        <Divider />
        <MenuItem onClick={() => { closeMenu(); downloadAsPng(); }}>PNG (300 DPI)</MenuItem>
        <MenuItem onClick={() => { closeMenu(); downloadAsPdf(); }}>PDF (300 DPI)</MenuItem>
        <MenuItem onClick={() => { closeMenu(); downloadAsTiff(); }}>TIFF (300 DPI)</MenuItem>
        <MenuItem onClick={() => { closeMenu(); downloadAsSvg(); }}>SVG</MenuItem>
        {extraItems && (
          <>
            <Divider />
            {extraItems(closeMenu)}
          </>
        )}
      </Menu>
    </>
  );
}
