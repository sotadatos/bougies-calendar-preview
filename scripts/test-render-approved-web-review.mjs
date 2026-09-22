import assert from "node:assert/strict";
import test from "node:test";
import { requireLinuxCi, validateFinalCapture, validateRuntime } from "./render-approved-web-review.mjs";

const valid = '<html data-measured-height="1378" data-promotion-overflow-count="0" '
  + 'data-inline-image-source-count="31" data-inline-image-source-loaded-count="31" '
  + 'data-inline-image-source-failed-count="0" data-inline-image-target-count="58" '
  + 'data-inline-image-resolved-count="58" data-inline-image-unresolved-count="0">';

test("export height follows the rendered page after all images resolve", () => {
  assert.equal(validateRuntime(valid), 1382);
  assert.throws(() => validateRuntime(valid.replace('data-inline-image-resolved-count="58"',
    'data-inline-image-resolved-count="57"')), /inline image/);
  assert.throws(() => validateRuntime(valid.replace('data-promotion-overflow-count="0"',
    'data-promotion-overflow-count="1"')), /clipped promotion/);
});

test("macOS and other non-CI hosts fail before browser launch", () => {
  assert.throws(() => requireLinuxCi("darwin", "true"), /only on an isolated Linux/);
  assert.throws(() => requireLinuxCi("linux", undefined), /only on an isolated Linux/);
  assert.doesNotThrow(() => requireLinuxCi("linux", "true"));
});

test("final capture fails when layout changes or overflows its screenshot viewport", () => {
  assert.equal(validateFinalCapture(valid, 1382, 1380), 1382);
  assert.throws(() => validateFinalCapture(valid, 1380, 1370), /exceeds PNG viewport/);
  assert.throws(() => validateFinalCapture(valid, 1382, 1390), /exceeds PNG viewport/);
  assert.throws(() => validateFinalCapture(valid.replace('data-inline-image-resolved-count="58"',
    'data-inline-image-resolved-count="57"'), 1382, 1380), /inline image/);
});
