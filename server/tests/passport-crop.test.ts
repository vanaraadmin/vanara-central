import assert from "node:assert/strict";
import test from "node:test";
import {
  PASSPORT_FRAME_ASPECT_RATIO,
  centerCropForAspectRatio,
  isCropAspectRatioValid,
  mapGuideToSourceCrop,
  mapRenderedGuideToSourceCrop,
  passportGuideRect,
} from "../../src/utils/passport-crop.ts";

test("passport guide maps portrait iPhone rendered video to source pixels with object-fit cover", () => {
  const renderedWidth = 390;
  const renderedHeight = 275;
  const guide = passportGuideRect(renderedWidth, renderedHeight);
  const crop = mapRenderedGuideToSourceCrop({
    sourceWidth: 1920,
    sourceHeight: 1080,
    renderedWidth,
    renderedHeight,
    guide,
    objectFit: "cover",
  });

  assert.equal(Math.round((crop.sw / crop.sh) * 100), Math.round(PASSPORT_FRAME_ASPECT_RATIO * 100));
  assert.ok(crop.sx > 0);
  assert.ok(crop.sy >= 0);
});

test("passport guide mapping accounts for object-fit cover vertical overflow", () => {
  const renderedWidth = 390;
  const renderedHeight = 390;
  const guide = passportGuideRect(renderedWidth, renderedHeight);
  const crop = mapRenderedGuideToSourceCrop({
    sourceWidth: 1920,
    sourceHeight: 1080,
    renderedWidth,
    renderedHeight,
    guide,
    objectFit: "cover",
  });

  assert.equal(Math.round(crop.hiddenSourceX), 420);
  assert.equal(crop.hiddenSourceY, 0);
  assert.ok(crop.sw < 1920);
});

test("passport guide mapping accounts for object-fit cover horizontal overflow", () => {
  const renderedWidth = 640;
  const renderedHeight = 240;
  const guide = passportGuideRect(renderedWidth, renderedHeight);
  const crop = mapRenderedGuideToSourceCrop({
    sourceWidth: 1080,
    sourceHeight: 1920,
    renderedWidth,
    renderedHeight,
    guide,
    objectFit: "cover",
  });

  assert.equal(crop.hiddenSourceX, 0);
  assert.ok(crop.hiddenSourceY > 700);
});

test("captured source crop keeps the same aspect ratio as the visible guide", () => {
  const guide = passportGuideRect(430, 303);
  const crop = mapRenderedGuideToSourceCrop({
    sourceWidth: 3840,
    sourceHeight: 2160,
    renderedWidth: 430,
    renderedHeight: 303,
    guide,
    objectFit: "cover",
  });

  assert.equal(Math.round((guide.width / guide.height) * 1000), Math.round(PASSPORT_FRAME_ASPECT_RATIO * 1000));
  assert.equal(Math.round((crop.sw / crop.sh) * 1000), Math.round(PASSPORT_FRAME_ASPECT_RATIO * 1000));
});

test("canonical mapping supports object-fit contain without hidden overflow", () => {
  const guide = passportGuideRect(430, 303);
  const crop = mapGuideToSourceCrop({
    sourceWidth: 4032,
    sourceHeight: 3024,
    renderedWidth: 430,
    renderedHeight: 303,
    objectFit: "contain",
    guide,
  });

  assert.equal(crop.hiddenSourceX, 0);
  assert.equal(crop.hiddenSourceY, 0);
  assert.ok(crop.x >= 0);
  assert.ok(crop.y >= 0);
});

test("device pixel ratio does not affect CSS-to-source crop mapping", () => {
  const guide = passportGuideRect(390, 275);
  const cropOne = mapRenderedGuideToSourceCrop({
    sourceWidth: 1920,
    sourceHeight: 1080,
    renderedWidth: 390,
    renderedHeight: 275,
    guide,
    objectFit: "cover",
  });
  const cropTwo = mapRenderedGuideToSourceCrop({
    sourceWidth: 1920,
    sourceHeight: 1080,
    renderedWidth: 390,
    renderedHeight: 275,
    guide,
    objectFit: "cover",
  });

  assert.deepEqual(cropTwo, cropOne);
});

test("crop bounds never exceed source pixels", () => {
  const guide = { x: -50, y: -40, width: 900, height: 500 };
  const crop = mapRenderedGuideToSourceCrop({
    sourceWidth: 1280,
    sourceHeight: 720,
    renderedWidth: 430,
    renderedHeight: 240,
    guide,
    objectFit: "cover",
  });

  assert.ok(crop.sx >= 0);
  assert.ok(crop.sy >= 0);
  assert.ok(crop.sx + crop.sw <= 1280);
  assert.ok(crop.sy + crop.sh <= 720);
});

test("native image center crop produces the passport guide aspect ratio", () => {
  const portraitCrop = centerCropForAspectRatio(3024, 4032);
  const landscapeCrop = centerCropForAspectRatio(4032, 3024);

  assert.equal(isCropAspectRatioValid(portraitCrop), true);
  assert.equal(isCropAspectRatioValid(landscapeCrop), true);
  assert.ok(portraitCrop.sh < 4032);
  assert.ok(landscapeCrop.sh < 3024);
});
