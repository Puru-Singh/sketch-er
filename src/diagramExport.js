const DEFAULT_EXPORT_SCALE = 2;
const MAX_EXPORT_DIMENSION = 12000;
const MAX_EXPORT_PIXELS = 24_000_000;
const MAX_CAPTURE_VIEWPORT = 8192;

function isUsableRect(rect) {
  return rect
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width >= 0
    && rect.height >= 0;
}

export function calculateExportBounds(rectangles, padding = 40) {
  const usable = rectangles.filter(isUsableRect);
  if (usable.length === 0) return null;

  const minX = Math.floor(Math.min(...usable.map((rect) => rect.x)) - padding);
  const minY = Math.floor(Math.min(...usable.map((rect) => rect.y)) - padding);
  const maxX = Math.ceil(Math.max(...usable.map((rect) => rect.x + rect.width)) + padding);
  const maxY = Math.ceil(Math.max(...usable.map((rect) => rect.y + rect.height)) + padding);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function calculateExportScale(width, height, preferredScale = DEFAULT_EXPORT_SCALE) {
  if (!(width > 0) || !(height > 0)) return 1;
  const dimensionLimit = MAX_EXPORT_DIMENSION / Math.max(width, height);
  const pixelLimit = Math.sqrt(MAX_EXPORT_PIXELS / (width * height));
  return Math.min(preferredScale, dimensionLimit, pixelLimit);
}

function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to rasterize the diagram's SVG layer."));
    image.src = url;
  });
}

async function drawVectorLayer(context, diagramSvg, bounds, pixelWidth, pixelHeight) {
  const svg = diagramSvg.cloneNode(true);
  svg.querySelectorAll("[data-export-hide]").forEach((element) => element.remove());

  // Animated relationship dots have no stable export frame. Remove their
  // container rather than leaving an unpositioned circle at the SVG origin.
  svg.querySelectorAll("animateMotion").forEach((animation) => animation.parentElement?.remove());

  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  svg.setAttribute("viewBox", `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`);
  svg.setAttribute("width", String(pixelWidth));
  svg.setAttribute("height", String(pixelHeight));
  svg.setAttribute("preserveAspectRatio", "none");
  svg.removeAttribute("style");
  svg.style.display = "block";
  svg.style.overflow = "visible";

  const source = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = await loadImage(url);
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    image.src = "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function captureTableLayer({ tableNodes, bounds, scale, html2canvas }) {
  const stage = document.createElement("div");
  const stageId = `sketcher-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  stage.dataset.exportTableStage = stageId;
  stage.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    `width:${bounds.width}px`,
    `height:${bounds.height}px`,
    "overflow:hidden",
    "pointer-events:none",
    "visibility:hidden",
    "background:transparent",
  ].join(";");

  tableNodes.forEach(({ node, x, y }) => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll("[data-export-hide]").forEach((element) => element.remove());
    clone.style.position = "absolute";
    clone.style.left = `${x - bounds.minX}px`;
    clone.style.top = `${y - bounds.minY}px`;
    clone.style.margin = "0";
    clone.style.transform = "none";
    clone.style.transition = "none";
    clone.style.opacity = "1";
    stage.appendChild(clone);
  });

  document.body.appendChild(stage);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    await nextPaint();
    return await html2canvas(stage, {
      backgroundColor: null,
      scale,
      logging: false,
      useCORS: true,
      allowTaint: false,
      width: bounds.width,
      height: bounds.height,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(
        document.documentElement.clientWidth,
        Math.min(bounds.width, MAX_CAPTURE_VIEWPORT),
      ),
      windowHeight: Math.max(
        document.documentElement.clientHeight,
        Math.min(bounds.height, MAX_CAPTURE_VIEWPORT),
      ),
      onclone: (clonedDocument) => {
        const clonedStage = clonedDocument.querySelector(`[data-export-table-stage="${stageId}"]`);
        if (clonedStage) clonedStage.style.visibility = "visible";
      },
    });
  } finally {
    stage.remove();
  }
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the exported diagram."));
    }, "image/png");
  });
}

export async function renderDiagramPng({
  diagramSvg,
  tableNodes,
  bounds,
  backgroundColor,
}) {
  if (!diagramSvg || !bounds || tableNodes.length === 0) {
    throw new Error("The diagram has no renderable content.");
  }

  const { default: html2canvas } = await import("html2canvas");
  const scale = calculateExportScale(bounds.width, bounds.height);
  // html2canvas floors its backing dimensions. Matching that behavior avoids
  // stretching one layer by a pixel when a large export uses a fractional scale.
  const pixelWidth = Math.max(1, Math.floor(bounds.width * scale));
  const pixelHeight = Math.max(1, Math.floor(bounds.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not create an export canvas.");
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, pixelWidth, pixelHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  // Groups and connections are rasterized as native SVG. Tables are captured
  // independently without the canvas pan/zoom transform, then composited using
  // the exact same world bounds. This keeps both layers in one coordinate space.
  await drawVectorLayer(context, diagramSvg, bounds, pixelWidth, pixelHeight);
  const tableLayer = await captureTableLayer({ tableNodes, bounds, scale, html2canvas });
  context.drawImage(tableLayer, 0, 0);
  tableLayer.width = 1;
  tableLayer.height = 1;

  return canvasToPngBlob(canvas);
}

export function downloadPng(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${fileName || "diagram"}.png`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
