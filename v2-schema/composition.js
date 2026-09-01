/** MotionGo V2 canonical Composition contract. */
export const LAYER_TYPES = /** @type {const} */ ([
  'background', 'text', 'image', 'shape', 'svg', 'group',
]);
export const SHAPE_KINDS = /** @type {const} */ (['rectangle', 'ellipse', 'line']);
export const IMAGE_FIT = /** @type {const} */ (['cover', 'contain', 'fill']);

export function validateComposition(comp) {
  const errors = [];
  if (!comp || typeof comp !== 'object') return { ok: false, errors: ['root must be an object'] };
  if (comp.version !== 1) errors.push('version must be 1');

  const c = comp.composition;
  if (!c || typeof c !== 'object') {
    errors.push('composition is required');
  } else {
    if (typeof c.id !== 'string' || !c.id) errors.push('composition.id required');
    if (c.width !== 1080) errors.push('composition.width must be 1080');
    if (c.height !== 1920) errors.push('composition.height must be 1920');
    if (c.fps !== 30) errors.push('composition.fps must be 30');
    if (!Number.isFinite(c.durationFrames) || c.durationFrames <= 0) errors.push('composition.durationFrames must be > 0');
  }

  const assets = comp.assets;
  if (!assets || typeof assets !== 'object') {
    errors.push('assets is required');
  } else {
    if (!Array.isArray(assets.images)) errors.push('assets.images must be array');
    if (!Array.isArray(assets.svgs)) errors.push('assets.svgs must be array');
    if (!Array.isArray(assets.fonts)) errors.push('assets.fonts must be array');
  }

  if (!Array.isArray(comp.markers)) errors.push('markers must be array');

  if (!Array.isArray(comp.layers)) {
    errors.push('layers must be array');
  } else {
    const ids = new Set();
    comp.layers.forEach((layer, i) => {
      const pfx = `layers[${i}]`;
      if (!layer || typeof layer !== 'object') { errors.push(`${pfx} must be object`); return; }
      if (typeof layer.id !== 'string' || !layer.id) errors.push(`${pfx}.id required`);
      else if (ids.has(layer.id)) errors.push(`${pfx}.id "${layer.id}" is not unique`);
      else ids.add(layer.id);
      if (!LAYER_TYPES.includes(layer.type)) errors.push(`${pfx}.type "${layer.type}" unsupported`);
      if (!Number.isFinite(layer.startFrame) || layer.startFrame < 0) errors.push(`${pfx}.startFrame must be >= 0`);
      if (!Number.isFinite(layer.durationFrames) || layer.durationFrames <= 0) errors.push(`${pfx}.durationFrames must be > 0`);
      if (!Number.isFinite(layer.zIndex)) errors.push(`${pfx}.zIndex must be a number`);

      if (layer.type === 'image' || layer.type === 'svg') {
        if (typeof layer.assetId !== 'string' || !layer.assetId) {
          errors.push(`${pfx}.assetId is required`);
        } else {
          const list = layer.type === 'image' ? assets?.images : assets?.svgs;
          if (!Array.isArray(list) || !list.find(a => a.id === layer.assetId)) errors.push(`${pfx}.assetId "${layer.assetId}" not found in assets`);
        }
      }

      if (layer.type === 'group' && !Array.isArray(layer.childIds)) errors.push(`${pfx}.childIds must be array`);
    });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: comp };
}

export function defaultTransform(overrides = {}) {
  return {
    x: 0, y: 0, width: 1080, height: 100,
    scaleX: 1, scaleY: 1, rotation: 0,
    originX: 0.5, originY: 0.5,
    ...overrides,
  };
}

export function defaultAnimation() {
  return { enter: null, hold: null, exit: null, keyframes: null };
}
