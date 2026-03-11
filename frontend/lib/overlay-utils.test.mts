import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateRenderedVideoRect,
    classifyElbowFlexionBand,
    projectOverlayPoint,
    type OverlayCoordinateContext,
} from './overlay-utils.ts';

function approximatelyEqual(actual: number, expected: number, epsilon = 0.001) {
    assert.ok(
        Math.abs(actual - expected) <= epsilon,
        `expected ${actual} to be within ${epsilon} of ${expected}`
    );
}

test('portrait video maps into a centered pillarboxed content rect', () => {
    const context: OverlayCoordinateContext = {
        clientWidth: 1280,
        clientHeight: 720,
        videoWidth: 720,
        videoHeight: 1280,
    };

    const rect = calculateRenderedVideoRect(context);

    approximatelyEqual(rect.x, 437.5);
    approximatelyEqual(rect.y, 0);
    approximatelyEqual(rect.width, 405);
    approximatelyEqual(rect.height, 720);

    const topLeft = projectOverlayPoint(0, 0, context);
    const center = projectOverlayPoint(0.5, 0.5, context);
    const bottomRight = projectOverlayPoint(1, 1, context);

    assert.ok(topLeft);
    assert.ok(center);
    assert.ok(bottomRight);

    approximatelyEqual(topLeft.x, rect.x);
    approximatelyEqual(topLeft.y, rect.y);
    approximatelyEqual(center.x, rect.x + (rect.width / 2));
    approximatelyEqual(center.y, rect.y + (rect.height / 2));
    approximatelyEqual(bottomRight.x, rect.x + rect.width);
    approximatelyEqual(bottomRight.y, rect.y + rect.height);
});

test('landscape video matching the container fills the full rect', () => {
    const context: OverlayCoordinateContext = {
        clientWidth: 1280,
        clientHeight: 720,
        videoWidth: 1280,
        videoHeight: 720,
    };

    const rect = calculateRenderedVideoRect(context);

    approximatelyEqual(rect.x, 0);
    approximatelyEqual(rect.y, 0);
    approximatelyEqual(rect.width, 1280);
    approximatelyEqual(rect.height, 720);

    const center = projectOverlayPoint(0.5, 0.5, context);
    assert.ok(center);
    approximatelyEqual(center.x, 640);
    approximatelyEqual(center.y, 360);
});

test('elbow flexion bands use green-yellow-red thresholds from straight-arm flexion', () => {
    assert.equal(classifyElbowFlexionBand(180), 'good');
    assert.equal(classifyElbowFlexionBand(145), 'caution');
    assert.equal(classifyElbowFlexionBand(125), 'caution');
    assert.equal(classifyElbowFlexionBand(124.9), 'bad');
});
