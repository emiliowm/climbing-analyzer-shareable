export interface OverlaySize {
    width: number;
    height: number;
}

export interface OverlayRect extends OverlaySize {
    x: number;
    y: number;
}

export type TechniqueBand = 'good' | 'caution' | 'bad' | 'neutral';

export interface OverlayDrawStats {
    drawCalls: number;
    lastFrameIndex: number;
    landmarksInFrame: number;
    jointsDrawn: number;
    connectionsDrawn: number;
    scoredSegmentsDrawn: number;
    pointsInsideContentBox: number;
    connectionsSkippedByVisibility: number;
    droppedPoints: number;
    canvasCssSize: OverlaySize;
    canvasBufferSize: OverlaySize;
    videoClientSize: OverlaySize;
    videoIntrinsicSize: OverlaySize;
    contentBox: OverlayRect;
    dpr: number;
    leftArmBand: TechniqueBand;
    rightArmBand: TechniqueBand;
    lastError: string | null;
}

export interface OverlayCoordinateContext {
    clientWidth: number;
    clientHeight: number;
    videoWidth: number;
    videoHeight: number;
}

export function createOverlayDrawStats(): OverlayDrawStats {
    return {
        drawCalls: 0,
        lastFrameIndex: 0,
        landmarksInFrame: 0,
        jointsDrawn: 0,
        connectionsDrawn: 0,
        scoredSegmentsDrawn: 0,
        pointsInsideContentBox: 0,
        connectionsSkippedByVisibility: 0,
        droppedPoints: 0,
        canvasCssSize: { width: 0, height: 0 },
        canvasBufferSize: { width: 0, height: 0 },
        videoClientSize: { width: 0, height: 0 },
        videoIntrinsicSize: { width: 0, height: 0 },
        contentBox: { x: 0, y: 0, width: 0, height: 0 },
        dpr: 1,
        leftArmBand: 'neutral',
        rightArmBand: 'neutral',
        lastError: null,
    };
}

function clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}

export function calculateRenderedVideoRect(context: OverlayCoordinateContext): OverlayRect {
    if (context.clientWidth <= 0 || context.clientHeight <= 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    if (context.videoWidth <= 0 || context.videoHeight <= 0) {
        return {
            x: 0,
            y: 0,
            width: context.clientWidth,
            height: context.clientHeight,
        };
    }

    const scale = Math.min(
        context.clientWidth / context.videoWidth,
        context.clientHeight / context.videoHeight
    );

    const width = context.videoWidth * scale;
    const height = context.videoHeight * scale;

    return {
        x: (context.clientWidth - width) / 2,
        y: (context.clientHeight - height) / 2,
        width,
        height,
    };
}

export function normalizeOverlayPoint(
    x: number,
    y: number,
    context: OverlayCoordinateContext
): { x: number; y: number } | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    let normalizedX: number;
    let normalizedY: number;

    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        normalizedX = x;
        normalizedY = y;
    } else if (context.videoWidth > 0 && context.videoHeight > 0) {
        normalizedX = x / context.videoWidth;
        normalizedY = y / context.videoHeight;
    } else if (context.clientWidth > 0 && context.clientHeight > 0) {
        normalizedX = x / context.clientWidth;
        normalizedY = y / context.clientHeight;
    } else {
        return null;
    }

    if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
        return null;
    }

    return {
        x: clamp01(normalizedX),
        y: clamp01(normalizedY),
    };
}

export function projectOverlayPoint(
    x: number,
    y: number,
    context: OverlayCoordinateContext
): { x: number; y: number } | null {
    const normalized = normalizeOverlayPoint(x, y, context);
    if (!normalized) {
        return null;
    }

    const contentBox = calculateRenderedVideoRect(context);
    if (contentBox.width <= 0 || contentBox.height <= 0) {
        return null;
    }

    return {
        x: contentBox.x + (normalized.x * contentBox.width),
        y: contentBox.y + (normalized.y * contentBox.height),
    };
}

export function classifyElbowFlexionBand(interiorAngle: number): TechniqueBand {
    if (!Number.isFinite(interiorAngle)) {
        return 'neutral';
    }

    const flexionFromStraight = 180 - interiorAngle;

    if (flexionFromStraight < 35) {
        return 'good';
    }

    if (flexionFromStraight <= 55) {
        return 'caution';
    }

    return 'bad';
}
