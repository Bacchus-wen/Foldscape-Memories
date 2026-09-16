// Extend the frustum outside the editorial frame, keeping its pixel scale and
// center unchanged. Tall scenery can then render into the surrounding page.
export function frameSceneCamera(camera, width, height, top, bottom) {
  const framedHeight = Math.max(1, height - top - bottom);
  const span = Math.max(16, 21 / (width / framedHeight));
  camera.fov = 2 * Math.atan(span / 72) * 180 / Math.PI;
  camera.setViewOffset(width, framedHeight, 0, -top, width, height);
}
