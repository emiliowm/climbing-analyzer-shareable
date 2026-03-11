'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { usePlayerStore } from '@/stores/usePlayerStore';
import type { FrameMetrics } from '@/lib/api';
import {
    calculateRenderedVideoRect,
    classifyElbowFlexionBand,
    createOverlayDrawStats,
    projectOverlayPoint,
    type OverlayCoordinateContext,
    type OverlayDrawStats,
    type OverlayRect,
    type TechniqueBand,
} from '@/lib/overlay-utils';

interface VideoPlayerProps {
    src: string;
    fps?: number;
    frameData?: FrameMetrics[];
    debugOverlay?: boolean;
    onDrawStatsChange?: (stats: OverlayDrawStats) => void;
}

interface OverlayViewport {
    clientWidth: number;
    clientHeight: number;
    videoWidth: number;
    videoHeight: number;
    dpr: number;
}

interface OverlayPoint {
    x: number;
    y: number;
}

interface OverlayContactPoint {
    point: OverlayPoint;
    isStatic: boolean;
}

interface OverlayLine {
    start: OverlayPoint;
    end: OverlayPoint;
    band: TechniqueBand;
}

interface OverlayJoint {
    point: OverlayPoint;
    band: TechniqueBand;
    landmarkId: number;
}

interface OverlayData {
    frameQuality: 'good' | 'bad';
    hasFrame: boolean;
    hasLandmarks: boolean;
    landmarksInFrame: number;
    pointsInsideContentBox: number;
    connectionsSkippedByVisibility: number;
    scoredSegmentsDrawn: number;
    droppedPoints: number;
    contentBox: OverlayRect;
    leftArmBand: TechniqueBand;
    rightArmBand: TechniqueBand;
    lines: OverlayLine[];
    joints: OverlayJoint[];
    contacts: OverlayContactPoint[];
    comPoint: OverlayPoint | null;
}

const POSE_CONNECTIONS: Array<[number, number]> = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
    [27, 31], [28, 32],
];

const LEFT_ARM_CONNECTION_KEYS = new Set(['11-13', '13-15']);
const RIGHT_ARM_CONNECTION_KEYS = new Set(['12-14', '14-16']);
const LEFT_ELBOW_LANDMARK_ID = 13;
const RIGHT_ELBOW_LANDMARK_ID = 14;
const MIN_LANDMARK_VISIBILITY = 0.1;

const FORCE_COMPOSITING_STYLE: CSSProperties = {
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
};

const BAND_COLORS: Record<TechniqueBand, { stroke: string; fill: string }> = {
    neutral: {
        stroke: 'rgba(148,163,184,0.78)',
        fill: 'rgba(148,163,184,0.92)',
    },
    good: {
        stroke: 'rgba(31,157,85,0.88)',
        fill: 'rgba(31,157,85,0.98)',
    },
    caution: {
        stroke: 'rgba(234,179,8,0.88)',
        fill: 'rgba(234,179,8,0.98)',
    },
    bad: {
        stroke: 'rgba(220,38,38,0.88)',
        fill: 'rgba(220,38,38,0.98)',
    },
};

const EMPTY_VIEWPORT: OverlayViewport = {
    clientWidth: 0,
    clientHeight: 0,
    videoWidth: 0,
    videoHeight: 0,
    dpr: 1,
};

const EMPTY_RECT: OverlayRect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
};

const EMPTY_DATA: OverlayData = {
    frameQuality: 'bad',
    hasFrame: false,
    hasLandmarks: false,
    landmarksInFrame: 0,
    pointsInsideContentBox: 0,
    connectionsSkippedByVisibility: 0,
    scoredSegmentsDrawn: 0,
    droppedPoints: 0,
    contentBox: EMPTY_RECT,
    leftArmBand: 'neutral',
    rightArmBand: 'neutral',
    lines: [],
    joints: [],
    contacts: [],
    comPoint: null,
};

function sameViewport(a: OverlayViewport, b: OverlayViewport): boolean {
    return (
        a.clientWidth === b.clientWidth &&
        a.clientHeight === b.clientHeight &&
        a.videoWidth === b.videoWidth &&
        a.videoHeight === b.videoHeight &&
        a.dpr === b.dpr
    );
}

function getConnectionKey(startId: number, endId: number): string {
    return startId < endId ? `${startId}-${endId}` : `${endId}-${startId}`;
}

function getConnectionBand(
    startId: number,
    endId: number,
    leftArmBand: TechniqueBand,
    rightArmBand: TechniqueBand
): TechniqueBand {
    const connectionKey = getConnectionKey(startId, endId);
    if (LEFT_ARM_CONNECTION_KEYS.has(connectionKey)) {
        return leftArmBand;
    }
    if (RIGHT_ARM_CONNECTION_KEYS.has(connectionKey)) {
        return rightArmBand;
    }
    return 'neutral';
}

function getJointBand(
    landmarkId: number,
    leftArmBand: TechniqueBand,
    rightArmBand: TechniqueBand
): TechniqueBand {
    if (landmarkId === LEFT_ELBOW_LANDMARK_ID) {
        return leftArmBand;
    }
    if (landmarkId === RIGHT_ELBOW_LANDMARK_ID) {
        return rightArmBand;
    }
    return 'neutral';
}

function formatTechniqueBand(band: TechniqueBand): string {
    return band.toUpperCase();
}

export function VideoPlayer({
    src,
    fps = 30,
    frameData = [],
    debugOverlay = false,
    onDrawStatsChange,
}: VideoPlayerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const animationFrameRef = useRef<number | null>(null);
    const drawCallsRef = useRef(0);
    const [viewport, setViewport] = useState<OverlayViewport>(EMPTY_VIEWPORT);
    const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
    const [isPlayingLocal, setIsPlayingLocal] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const [debugStats, setDebugStats] = useState<OverlayDrawStats>(() => createOverlayDrawStats());
    const { setCurrentFrame, setIsPlaying } = usePlayerStore();

    const getSafeFrameIndex = useCallback((video: HTMLVideoElement | null) => {
        if (!video) return 0;
        const roughFrame = Math.max(0, Math.floor(video.currentTime * fps));
        return Math.min(roughFrame, Math.max(frameData.length - 1, 0));
    }, [fps, frameData.length]);

    const syncFromVideo = useCallback(() => {
        const video = videoRef.current;
        drawCallsRef.current += 1;

        if (!video) {
            setLastError((prev) => (prev === 'Missing video ref' ? prev : 'Missing video ref'));
            return;
        }

        const nextViewport: OverlayViewport = {
            clientWidth: video.clientWidth,
            clientHeight: video.clientHeight,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            dpr: window.devicePixelRatio || 1,
        };

        setViewport((previous) => (sameViewport(previous, nextViewport) ? previous : nextViewport));

        const nextFrame = getSafeFrameIndex(video);
        setCurrentFrame(nextFrame);
        setCurrentFrameIndex((previous) => (previous === nextFrame ? previous : nextFrame));

        if (nextViewport.clientWidth <= 0 || nextViewport.clientHeight <= 0) {
            setLastError((prev) => (prev === 'Video has zero client dimensions' ? prev : 'Video has zero client dimensions'));
            return;
        }

        setLastError((prev) => (prev === null ? prev : null));
    }, [getSafeFrameIndex, setCurrentFrame]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                syncFromVideo();
            });
            resizeObserver.observe(container);
        }

        const handleWindowResize = () => syncFromVideo();
        const handleFullscreen = () => syncFromVideo();

        window.addEventListener('resize', handleWindowResize);
        document.addEventListener('fullscreenchange', handleFullscreen);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', handleWindowResize);
            document.removeEventListener('fullscreenchange', handleFullscreen);
        };
    }, [syncFromVideo]);

    useEffect(() => {
        if (!isPlayingLocal) {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
            return;
        }

        const tick = () => {
            syncFromVideo();
            animationFrameRef.current = requestAnimationFrame(tick);
        };

        animationFrameRef.current = requestAnimationFrame(tick);
        return () => {
            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [isPlayingLocal, syncFromVideo]);

    const overlayData = useMemo<OverlayData>(() => {
        const coordinateContext: OverlayCoordinateContext = {
            clientWidth: viewport.clientWidth,
            clientHeight: viewport.clientHeight,
            videoWidth: viewport.videoWidth,
            videoHeight: viewport.videoHeight,
        };
        const contentBox = calculateRenderedVideoRect(coordinateContext);
        const frame = frameData[currentFrameIndex];

        if (!frame || viewport.clientWidth <= 0 || viewport.clientHeight <= 0) {
            return { ...EMPTY_DATA, contentBox };
        }

        const leftArmBand = classifyElbowFlexionBand(frame.left_elbow_angle);
        const rightArmBand = classifyElbowFlexionBand(frame.right_elbow_angle);
        const landmarkMap = new Map(frame.pose_landmarks?.map((landmark) => [landmark.id, landmark]));
        const projectedLandmarks = new Map<number, OverlayPoint>();

        let droppedPoints = 0;
        let pointsInsideContentBox = 0;
        let connectionsSkippedByVisibility = 0;
        let scoredSegmentsDrawn = 0;

        const joints: OverlayJoint[] = [];
        for (const landmark of frame.pose_landmarks ?? []) {
            if (landmark.visibility < MIN_LANDMARK_VISIBILITY) continue;
            const point = projectOverlayPoint(landmark.x, landmark.y, coordinateContext);
            if (!point) {
                droppedPoints += 1;
                continue;
            }

            projectedLandmarks.set(landmark.id, point);
            pointsInsideContentBox += 1;
            joints.push({
                point,
                band: getJointBand(landmark.id, leftArmBand, rightArmBand),
                landmarkId: landmark.id,
            });
        }

        const lines: OverlayLine[] = [];
        for (const [startId, endId] of POSE_CONNECTIONS) {
            const start = landmarkMap.get(startId);
            const end = landmarkMap.get(endId);
            if (!start || !end) continue;
            if (start.visibility < MIN_LANDMARK_VISIBILITY || end.visibility < MIN_LANDMARK_VISIBILITY) {
                connectionsSkippedByVisibility += 1;
                continue;
            }

            const startPoint = projectedLandmarks.get(startId);
            const endPoint = projectedLandmarks.get(endId);
            if (!startPoint || !endPoint) continue;

            const band = getConnectionBand(startId, endId, leftArmBand, rightArmBand);
            if (band !== 'neutral') {
                scoredSegmentsDrawn += 1;
            }

            lines.push({ start: startPoint, end: endPoint, band });
        }

        const contacts: OverlayContactPoint[] = [];
        for (const contact of frame.contact_points ?? []) {
            const position = contact.position ?? [0, 0];
            const point = projectOverlayPoint(position[0] ?? 0, position[1] ?? 0, coordinateContext);
            if (!point) {
                droppedPoints += 1;
                continue;
            }
            pointsInsideContentBox += 1;
            contacts.push({ point, isStatic: contact.is_static });
        }

        const com = frame.com_position ?? [0, 0];
        const comPoint = projectOverlayPoint(com[0] ?? 0, com[1] ?? 0, coordinateContext);
        if (!comPoint) {
            droppedPoints += 1;
        }
        if (comPoint) {
            pointsInsideContentBox += 1;
        }

        return {
            frameQuality: frame.frame_quality,
            hasFrame: true,
            hasLandmarks: landmarkMap.size > 0,
            landmarksInFrame: frame.pose_landmarks?.length ?? 0,
            pointsInsideContentBox,
            connectionsSkippedByVisibility,
            scoredSegmentsDrawn,
            droppedPoints,
            contentBox,
            leftArmBand,
            rightArmBand,
            lines,
            joints,
            contacts,
            comPoint,
        };
    }, [currentFrameIndex, frameData, viewport]);

    useEffect(() => {
        const nextStats: OverlayDrawStats = {
            drawCalls: drawCallsRef.current,
            lastFrameIndex: currentFrameIndex,
            landmarksInFrame: overlayData.landmarksInFrame,
            jointsDrawn: overlayData.joints.length,
            connectionsDrawn: overlayData.lines.length,
            scoredSegmentsDrawn: overlayData.scoredSegmentsDrawn,
            pointsInsideContentBox: overlayData.pointsInsideContentBox,
            connectionsSkippedByVisibility: overlayData.connectionsSkippedByVisibility,
            droppedPoints: overlayData.droppedPoints,
            canvasCssSize: { width: viewport.clientWidth, height: viewport.clientHeight },
            canvasBufferSize: {
                width: Math.round(viewport.clientWidth * viewport.dpr),
                height: Math.round(viewport.clientHeight * viewport.dpr),
            },
            videoClientSize: { width: viewport.clientWidth, height: viewport.clientHeight },
            videoIntrinsicSize: { width: viewport.videoWidth, height: viewport.videoHeight },
            contentBox: overlayData.contentBox,
            dpr: viewport.dpr,
            leftArmBand: overlayData.leftArmBand,
            rightArmBand: overlayData.rightArmBand,
            lastError,
        };

        onDrawStatsChange?.(nextStats);
        if (debugOverlay) {
            setDebugStats(nextStats);
        }
    }, [
        currentFrameIndex,
        debugOverlay,
        lastError,
        onDrawStatsChange,
        overlayData.connectionsSkippedByVisibility,
        overlayData.contentBox,
        overlayData.droppedPoints,
        overlayData.joints.length,
        overlayData.landmarksInFrame,
        overlayData.leftArmBand,
        overlayData.lines.length,
        overlayData.pointsInsideContentBox,
        overlayData.rightArmBand,
        overlayData.scoredSegmentsDrawn,
        viewport.clientHeight,
        viewport.clientWidth,
        viewport.dpr,
        viewport.videoHeight,
        viewport.videoWidth,
    ]);

    const referenceSize = Math.max(
        1,
        Math.min(
            overlayData.contentBox.width || viewport.clientWidth || 1,
            overlayData.contentBox.height || viewport.clientHeight || 1,
        ),
    );
    const widthScale = Math.max(1, referenceSize / 420);
    const lineWidth = Math.max(2.4, Math.min(6, 2.2 * widthScale));
    const lineHaloWidth = lineWidth + 2;
    const jointRadius = Math.max(3.4, Math.min(8, 2.8 * widthScale));
    const jointHaloRadius = jointRadius + 1.6;
    const postureBadgeColor = overlayData.frameQuality === 'good'
        ? 'rgba(31,157,85,0.98)'
        : 'rgba(220,38,38,0.98)';
    const videoAspectRatio = viewport.videoWidth > 0 && viewport.videoHeight > 0
        ? `${viewport.videoWidth} / ${viewport.videoHeight}`
        : '16 / 9';

    return (
        <div className="space-y-3">
            <div ref={containerRef} className="relative isolate overflow-hidden rounded-lg border border-border bg-surface-strong">
                <video
                    ref={videoRef}
                    key={src}
                    src={src}
                    controls
                    preload="metadata"
                    playsInline
                    className="relative z-10 block max-h-[80vh] min-h-[260px] w-full bg-surface-strong"
                    style={{
                        ...FORCE_COMPOSITING_STYLE,
                        aspectRatio: videoAspectRatio,
                        height: 'auto',
                    }}
                    onTimeUpdate={() => {
                        const frame = getSafeFrameIndex(videoRef.current);
                        setCurrentFrame(frame);
                        setCurrentFrameIndex(frame);
                        syncFromVideo();
                    }}
                    onLoadedMetadata={() => {
                        setCurrentFrame(0);
                        setCurrentFrameIndex(0);
                        setIsPlaying(false);
                        setIsPlayingLocal(false);
                        syncFromVideo();
                    }}
                    onSeeked={() => {
                        const frame = getSafeFrameIndex(videoRef.current);
                        setCurrentFrame(frame);
                        setCurrentFrameIndex(frame);
                        syncFromVideo();
                    }}
                    onLoadedData={() => {
                        syncFromVideo();
                    }}
                    onPlay={() => {
                        setIsPlaying(true);
                        setIsPlayingLocal(true);
                        syncFromVideo();
                    }}
                    onPause={() => {
                        setIsPlaying(false);
                        setIsPlayingLocal(false);
                        syncFromVideo();
                    }}
                />

                {debugOverlay && overlayData.contentBox.width > 0 && overlayData.contentBox.height > 0 && (
                    <>
                        <div
                            className="pointer-events-none absolute z-30"
                            style={{
                                left: overlayData.contentBox.x,
                                top: overlayData.contentBox.y,
                                width: overlayData.contentBox.width,
                                height: overlayData.contentBox.height,
                                border: '2px dashed rgba(34,211,238,0.9)',
                                boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.75)',
                            }}
                        />
                        <div
                            className="pointer-events-none absolute z-30 rounded bg-cyan-400/90 px-2 py-1 text-[10px] font-semibold text-slate-950"
                            style={{
                                left: overlayData.contentBox.x + 6,
                                top: overlayData.contentBox.y + 6,
                            }}
                        >
                            VIDEO CONTENT BOX
                        </div>
                    </>
                )}

                {overlayData.lines.map((line, index) => {
                    const dx = line.end.x - line.start.x;
                    const dy = line.end.y - line.start.y;
                    const length = Math.hypot(dx, dy);
                    if (!Number.isFinite(length) || length <= 0.01) {
                        return null;
                    }

                    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                    const lineStyle: CSSProperties = {
                        position: 'absolute',
                        left: line.start.x,
                        top: line.start.y,
                        width: length,
                        transform: `translateY(-50%) rotate(${angle}deg)`,
                        transformOrigin: '0 50%',
                        borderRadius: 9999,
                        zIndex: 30,
                        pointerEvents: 'none',
                    };
                    const colors = BAND_COLORS[line.band];

                    return (
                        <div key={`line-${index}`}>
                            <div
                                style={{
                                    ...lineStyle,
                                    height: lineHaloWidth,
                                    backgroundColor: 'rgba(15,23,42,0.84)',
                                }}
                            />
                            <div
                                style={{
                                    ...lineStyle,
                                    height: lineWidth,
                                    backgroundColor: colors.stroke,
                                }}
                            />
                        </div>
                    );
                })}

                {overlayData.joints.map((joint) => {
                    const colors = BAND_COLORS[joint.band];
                    return (
                        <div key={`joint-${joint.landmarkId}`}>
                            <div
                                style={{
                                    position: 'absolute',
                                    left: joint.point.x,
                                    top: joint.point.y,
                                    width: jointHaloRadius * 2,
                                    height: jointHaloRadius * 2,
                                    borderRadius: 9999,
                                    backgroundColor: 'rgba(15,23,42,0.88)',
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 31,
                                    pointerEvents: 'none',
                                }}
                            />
                            <div
                                style={{
                                    position: 'absolute',
                                    left: joint.point.x,
                                    top: joint.point.y,
                                    width: jointRadius * 2,
                                    height: jointRadius * 2,
                                    borderRadius: 9999,
                                    backgroundColor: colors.fill,
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 32,
                                    pointerEvents: 'none',
                                }}
                            />
                        </div>
                    );
                })}

                {overlayData.comPoint && (
                    <div>
                        <div
                            style={{
                                position: 'absolute',
                                left: overlayData.comPoint.x - 10,
                                top: overlayData.comPoint.y,
                                width: 20,
                                height: 2,
                                backgroundColor: 'rgba(31,157,85,0.85)',
                                transform: 'translateY(-50%)',
                                zIndex: 30,
                                pointerEvents: 'none',
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                left: overlayData.comPoint.x,
                                top: overlayData.comPoint.y - 10,
                                width: 2,
                                height: 20,
                                backgroundColor: 'rgba(31,157,85,0.85)',
                                transform: 'translateX(-50%)',
                                zIndex: 30,
                                pointerEvents: 'none',
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                left: overlayData.comPoint.x,
                                top: overlayData.comPoint.y,
                                width: 8,
                                height: 8,
                                borderRadius: 9999,
                                backgroundColor: 'rgba(31,157,85,1)',
                                transform: 'translate(-50%, -50%)',
                                zIndex: 31,
                                pointerEvents: 'none',
                            }}
                        />
                    </div>
                )}

                {overlayData.contacts.map((contact, index) => {
                    const comLine = overlayData.comPoint
                        ? (() => {
                            const dx = contact.point.x - overlayData.comPoint.x;
                            const dy = contact.point.y - overlayData.comPoint.y;
                            const length = Math.hypot(dx, dy);
                            if (!Number.isFinite(length) || length <= 0.01) {
                                return null;
                            }
                            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                            return {
                                left: overlayData.comPoint.x,
                                top: overlayData.comPoint.y,
                                width: length,
                                angle,
                            };
                        })()
                        : null;

                    return (
                        <div key={`contact-${index}`}>
                            {comLine && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: comLine.left,
                                        top: comLine.top,
                                        width: comLine.width,
                                        height: 1,
                                        backgroundColor: 'rgba(248,250,252,0.35)',
                                        transform: `translateY(-50%) rotate(${comLine.angle}deg)`,
                                        transformOrigin: '0 50%',
                                        zIndex: 29,
                                        pointerEvents: 'none',
                                    }}
                                />
                            )}
                            <div
                                style={{
                                    position: 'absolute',
                                    left: contact.point.x,
                                    top: contact.point.y,
                                    width: 10,
                                    height: 10,
                                    borderRadius: 9999,
                                    backgroundColor: contact.isStatic
                                        ? 'rgba(15,111,61,0.95)'
                                        : 'rgba(110,119,129,0.95)',
                                    transform: 'translate(-50%, -50%)',
                                    zIndex: 31,
                                    pointerEvents: 'none',
                                }}
                            />
                        </div>
                    );
                })}

                {overlayData.hasFrame && (
                    <div
                        className="pointer-events-none absolute right-2 top-2 z-30 rounded bg-black/55 px-2 py-1 text-xs font-bold"
                        style={{ color: postureBadgeColor, letterSpacing: '0.02em' }}
                    >
                        {overlayData.frameQuality === 'good' ? 'POSTURE: GOOD' : 'POSTURE: BAD'}
                    </div>
                )}

                {overlayData.hasFrame && !overlayData.hasLandmarks && (
                    <div className="pointer-events-none absolute right-2 top-10 z-30 rounded bg-black/55 px-2 py-1 text-[11px] font-semibold text-white">
                        POSE LANDMARKS UNAVAILABLE
                    </div>
                )}

                {debugOverlay && (
                    <div className="pointer-events-none absolute left-2 top-2 z-40 rounded bg-error px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                        HTML OVERLAY VISIBLE
                    </div>
                )}
            </div>

            {debugOverlay && (
                <div className="rounded-md border border-border bg-surface p-3 text-xs font-mono text-text-secondary">
                    <p className="mb-2 font-semibold text-text-primary">Overlay Debug</p>
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        <p>drawCalls: {debugStats.drawCalls}</p>
                        <p>lastFrameIndex: {debugStats.lastFrameIndex}</p>
                        <p>landmarksInFrame: {debugStats.landmarksInFrame}</p>
                        <p>jointsDrawn: {debugStats.jointsDrawn}</p>
                        <p>connectionsDrawn: {debugStats.connectionsDrawn}</p>
                        <p>scoredSegmentsDrawn: {debugStats.scoredSegmentsDrawn}</p>
                        <p>pointsInsideContentBox: {debugStats.pointsInsideContentBox}</p>
                        <p>connectionsSkippedByVisibility: {debugStats.connectionsSkippedByVisibility}</p>
                        <p>droppedPoints: {debugStats.droppedPoints}</p>
                        <p>canvasCss: {debugStats.canvasCssSize.width}x{debugStats.canvasCssSize.height}</p>
                        <p>canvasBuffer: {debugStats.canvasBufferSize.width}x{debugStats.canvasBufferSize.height}</p>
                        <p>videoClient: {debugStats.videoClientSize.width}x{debugStats.videoClientSize.height}</p>
                        <p>videoIntrinsic: {debugStats.videoIntrinsicSize.width}x{debugStats.videoIntrinsicSize.height}</p>
                        <p>contentBox: {debugStats.contentBox.x.toFixed(1)},{debugStats.contentBox.y.toFixed(1)} {debugStats.contentBox.width.toFixed(1)}x{debugStats.contentBox.height.toFixed(1)}</p>
                        <p>leftArmBand: {formatTechniqueBand(debugStats.leftArmBand)}</p>
                        <p>rightArmBand: {formatTechniqueBand(debugStats.rightArmBand)}</p>
                        <p>dpr: {debugStats.dpr.toFixed(2)}</p>
                        <p>lastError: {debugStats.lastError ?? 'none'}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
