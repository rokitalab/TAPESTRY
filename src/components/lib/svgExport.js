// Shared SVG-to-image export pipeline, used by PlotArea.jsx and
// PlotDownloadMenu.jsx so every plot's "Download" menu produces images the
// same way: clone the export-sized SVG onto a white background (with an
// optional title/subtitle overlay), rasterize it to a canvas, then convert
// that canvas to whichever format the user picked.

// SVG dimensions are in CSS px (96 DPI); scale raster exports up to 300 DPI.
export const EXPORT_SCALE = 300 / 96;
export const PX_PER_INCH = 96;

// Extra space (CSS px) reserved at the top of exported images for the plot
// title, which is normally rendered outside the <svg> as a page heading.
// The subtitle variant reserves more room for the second (junction id) line.
const TITLE_HEIGHT = 36;
const TITLE_HEIGHT_WITH_SUBTITLE = 54;

export function cloneSvgWithBackground(svgEl, title, subtitle) {
  const svgWidth = Number(svgEl.getAttribute("width"));
  const contentHeight = Number(svgEl.getAttribute("height"));
  const titleHeight = title ? (subtitle ? TITLE_HEIGHT_WITH_SUBTITLE : TITLE_HEIGHT) : 0;
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
    titleEl.setAttribute("y", subtitle ? titleHeight / 2 - 9 : titleHeight / 2);
    titleEl.setAttribute("text-anchor", "middle");
    titleEl.setAttribute("dominant-baseline", "central");
    titleEl.setAttribute("font-size", 16);
    titleEl.setAttribute("font-weight", 800);
    titleEl.setAttribute("font-family", "sans-serif");
    titleEl.setAttribute("fill", "#333");
    titleEl.textContent = title;
    clone.appendChild(titleEl);

    if (subtitle) {
      const subtitleEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      subtitleEl.setAttribute("x", svgWidth / 2);
      subtitleEl.setAttribute("y", titleHeight / 2 + 11);
      subtitleEl.setAttribute("text-anchor", "middle");
      subtitleEl.setAttribute("dominant-baseline", "central");
      subtitleEl.setAttribute("font-size", 12);
      subtitleEl.setAttribute("font-family", "monospace");
      subtitleEl.setAttribute("fill", "#666");
      subtitleEl.textContent = subtitle;
      clone.appendChild(subtitleEl);
    }
  }

  return { clone, svgWidth, svgHeight };
}

export function svgToCanvas(clone, svgWidth, svgHeight, scale) {
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

// Combines several detached, already-sized (width/height attrs) <svg>
// elements into one, stacked top to bottom with `gap` CSS px between them --
// used by PlotDownloadMenu when one download should capture more than one
// plot (e.g. JunctionExpressionHeatmap.jsx + GeneModelGtex.jsx together).
export function stackSvgsVertically(svgEls, gap = 16) {
  const svgs = svgEls.filter(Boolean);
  const width = Math.max(...svgs.map((svgEl) => Number(svgEl.getAttribute("width"))));
  const combined = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  let y = 0;
  svgs.forEach((svgEl) => {
    const height = Number(svgEl.getAttribute("height"));
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("transform", `translate(0, ${y})`);
    Array.from(svgEl.childNodes).forEach((child) => g.appendChild(child));
    combined.appendChild(g);
    y += height + gap;
  });
  combined.setAttribute("width", width);
  combined.setAttribute("height", svgs.length ? y - gap : 0);
  return combined;
}

export function triggerDownload(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}
