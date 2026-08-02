export const PASSPORT_FRAME_ASPECT_RATIO = 1.42;
export const PASSPORT_FRAME_WIDTH_RATIO = 0.86;
export const PASSPORT_FRAME_MAX_WIDTH = 520;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  scale: number;
  hiddenSourceX: number;
  hiddenSourceY: number;
}

export interface RenderedVideoGeometry {
  sourceWidth: number;
  sourceHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  objectFit: "cover" | "contain";
  guide: Rect;
}

export interface CanonicalSourceCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  hiddenSourceX: number;
  hiddenSourceY: number;
}

export function passportGuideRect(renderedWidth: number, renderedHeight: number): Rect {
  const maxWidth = Math.min(renderedWidth * PASSPORT_FRAME_WIDTH_RATIO, PASSPORT_FRAME_MAX_WIDTH);
  const maxHeight = renderedHeight * PASSPORT_FRAME_WIDTH_RATIO;
  let width = Math.min(maxWidth, maxHeight * PASSPORT_FRAME_ASPECT_RATIO);
  let height = width / PASSPORT_FRAME_ASPECT_RATIO;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * PASSPORT_FRAME_ASPECT_RATIO;
  }
  return {
    x: (renderedWidth - width) / 2,
    y: (renderedHeight - height) / 2,
    width,
    height,
  };
}

export function mapGuideToSourceCrop(input: RenderedVideoGeometry): CanonicalSourceCrop {
  const scale = input.objectFit === "cover"
    ? Math.max(input.renderedWidth / input.sourceWidth, input.renderedHeight / input.sourceHeight)
    : Math.min(input.renderedWidth / input.sourceWidth, input.renderedHeight / input.sourceHeight);
  const displayedSourceWidth = input.sourceWidth * scale;
  const displayedSourceHeight = input.sourceHeight * scale;
  const renderedOffsetX = (input.renderedWidth - displayedSourceWidth) / 2;
  const renderedOffsetY = (input.renderedHeight - displayedSourceHeight) / 2;

  const x = clamp((input.guide.x - renderedOffsetX) / scale, 0, input.sourceWidth);
  const y = clamp((input.guide.y - renderedOffsetY) / scale, 0, input.sourceHeight);
  const width = clamp(input.guide.width / scale, 1, input.sourceWidth - x);
  const height = clamp(input.guide.height / scale, 1, input.sourceHeight - y);

  return {
    x,
    y,
    width,
    height,
    scale,
    hiddenSourceX: Math.max(0, -renderedOffsetX) / scale,
    hiddenSourceY: Math.max(0, -renderedOffsetY) / scale,
  };
}

export function mapRenderedGuideToSourceCrop(input: RenderedVideoGeometry): SourceCrop {
  const crop = mapGuideToSourceCrop(input);
  return {
    sx: crop.x,
    sy: crop.y,
    sw: crop.width,
    sh: crop.height,
    scale: crop.scale,
    hiddenSourceX: crop.hiddenSourceX,
    hiddenSourceY: crop.hiddenSourceY,
  };
}

export function centerCropForAspectRatio(sourceWidth: number, sourceHeight: number, aspectRatio = PASSPORT_FRAME_ASPECT_RATIO): SourceCrop {
  const sourceAspect = sourceWidth / sourceHeight;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceAspect > aspectRatio) {
    sw = sourceHeight * aspectRatio;
  } else {
    sh = sourceWidth / aspectRatio;
  }
  return {
    sx: (sourceWidth - sw) / 2,
    sy: (sourceHeight - sh) / 2,
    sw,
    sh,
    scale: 1,
    hiddenSourceX: 0,
    hiddenSourceY: 0,
  };
}

export function cropAspectRatio(crop: Pick<SourceCrop, "sw" | "sh">): number {
  return crop.sw / crop.sh;
}

export function isCropAspectRatioValid(crop: Pick<SourceCrop, "sw" | "sh">, expected = PASSPORT_FRAME_ASPECT_RATIO, tolerance = 0.015): boolean {
  return Math.abs(cropAspectRatio(crop) - expected) <= tolerance;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
