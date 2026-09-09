export const MIN_CANVAS_ZOOM = 0.25;
export const MAX_CANVAS_ZOOM = 2;

export function clampCanvasZoom(value) {
  return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, value));
}

export function zoomCanvasAroundPoint({ currentZoom, requestedZoom, offset, focalPoint }) {
  const zoom = clampCanvasZoom(requestedZoom);
  if (!Number.isFinite(currentZoom) || currentZoom <= 0 || zoom === currentZoom) {
    return { zoom, offset };
  }

  const scale = zoom / currentZoom;
  return {
    zoom,
    offset: {
      x: focalPoint.x - (focalPoint.x - offset.x) * scale,
      y: focalPoint.y - (focalPoint.y - offset.y) * scale,
    },
  };
}
