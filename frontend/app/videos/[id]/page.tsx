'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useFrameData, useVideo, useVideoMetrics } from '@/hooks/useVideos';
import { useVideoWebSocket } from '@/hooks/useVideoWebSocket';
import { VideoPlayer } from '@/components/VideoPlayer';
import { FrameAnalyticsPanel } from '@/components/FrameAnalyticsPanel';
import { MetricsPanel } from '@/components/MetricsPanel';
import { apiUrl } from '@/lib/api';
import type { OverlayDrawStats } from '@/lib/overlay-utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();
    const lastStatusRef = useRef<string | undefined>(undefined);
    const zeroScoredSegmentsRef = useRef(0);
    const hasLandmarksRef = useRef(false);
    const currentVideoIdRef = useRef(id);
    const lastOverlaySignalRef = useRef<OverlayDrawStats | null>(null);
    const [zeroScoredSegmentsStreak, setZeroScoredSegmentsStreak] = useState(0);
    const [overlayStatsVideoId, setOverlayStatsVideoId] = useState<string | null>(null);

    const { data: video, isLoading: videoLoading } = useVideo(id);
    const { data: metrics, isLoading: metricsLoading } = useVideoMetrics(id);
    const { data: frameData, isLoading: frameDataLoading } = useFrameData(
        id,
        video?.status === 'complete',
        video?.processed_at
    );
    const wsState = useVideoWebSocket(id);
    const debugOverlay = searchParams.get('overlayDebug') === '1';
    const hasLandmarks = (frameData ?? []).some((frame) => (frame.pose_landmarks?.length ?? 0) > 0);
    const overlayIssueDetected = hasLandmarks && overlayStatsVideoId === id && zeroScoredSegmentsStreak >= 20;

    useEffect(() => {
        hasLandmarksRef.current = hasLandmarks;
        currentVideoIdRef.current = id;
    }, [hasLandmarks, id]);

    const handleOverlayStatsChange = useCallback((nextStats: OverlayDrawStats) => {
        const activeVideoId = currentVideoIdRef.current;
        setOverlayStatsVideoId((previous) => (previous === activeVideoId ? previous : activeVideoId));

        const previous = lastOverlaySignalRef.current;
        if (
            previous &&
            previous.landmarksInFrame === nextStats.landmarksInFrame &&
            previous.connectionsDrawn === nextStats.connectionsDrawn &&
            previous.scoredSegmentsDrawn === nextStats.scoredSegmentsDrawn &&
            previous.jointsDrawn === nextStats.jointsDrawn &&
            previous.pointsInsideContentBox === nextStats.pointsInsideContentBox &&
            previous.connectionsSkippedByVisibility === nextStats.connectionsSkippedByVisibility &&
            previous.leftArmBand === nextStats.leftArmBand &&
            previous.rightArmBand === nextStats.rightArmBand &&
            previous.lastError === nextStats.lastError
        ) {
            return;
        }

        lastOverlaySignalRef.current = nextStats;

        if (!hasLandmarksRef.current || nextStats.landmarksInFrame <= 0) {
            if (zeroScoredSegmentsRef.current !== 0) {
                zeroScoredSegmentsRef.current = 0;
                setZeroScoredSegmentsStreak((previousStreak) => (previousStreak === 0 ? previousStreak : 0));
            }
            return;
        }

        if (nextStats.scoredSegmentsDrawn === 0) {
            const nextStreak = zeroScoredSegmentsRef.current + 1;
            zeroScoredSegmentsRef.current = nextStreak;
            setZeroScoredSegmentsStreak((previousStreak) => (previousStreak === nextStreak ? previousStreak : nextStreak));
            return;
        }

        if (zeroScoredSegmentsRef.current !== 0) {
            zeroScoredSegmentsRef.current = 0;
            setZeroScoredSegmentsStreak((previousStreak) => (previousStreak === 0 ? previousStreak : 0));
        }
    }, []);

    useEffect(() => {
        const previousStatus = lastStatusRef.current;
        const currentStatus = video?.status;

        if (
            currentStatus === 'complete' &&
            previousStatus !== 'complete'
        ) {
            queryClient.invalidateQueries({ queryKey: ['video-frames', id] });
            queryClient.invalidateQueries({ queryKey: ['video-metrics', id] });
        }

        lastStatusRef.current = currentStatus;
    }, [id, queryClient, video?.status]);

    if (videoLoading) {
        return (
            <div className="min-h-screen bg-background p-6 md:p-10">
                <div className="mx-auto max-w-6xl">
                    <p className="text-text-secondary">Loading video...</p>
                </div>
            </div>
        );
    }

    if (!video) {
        return (
            <div className="min-h-screen bg-background p-6 md:p-10">
                <div className="mx-auto max-w-6xl">
                    <p className="text-error">Video not found</p>
                    <Link href="/" className="mt-4 inline-block">
                        <Button variant="secondary">Back to Home</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background p-6 md:p-10">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated p-5 md:p-6">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.1em] text-accent-strong">
                            Video Detail
                        </p>
                        <h1 className="mt-2 text-3xl font-heading font-bold text-text-primary">
                            {video.title}
                        </h1>
                        <p className="text-text-secondary mt-1">
                            Uploaded {new Date(video.created_at).toLocaleDateString()}
                        </p>
                    </div>
                    <Link href="/">
                        <Button variant="secondary">Back to Home</Button>
                    </Link>
                </div>

                {video.status === 'processing' && (
                    <Card className="p-6 border-warning bg-surface">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-text-primary">
                                    Processing Video...
                                </h3>
                                <p className="text-sm text-text-secondary mt-1">
                                    This may take a few minutes
                                </p>
                            </div>
                            <div className="text-2xl font-bold text-warning">
                                {wsState?.progress || video.progress}%
                            </div>
                        </div>
                    </Card>
                )}

                {video.status === 'error' && (
                    <Card className="p-6 border-error bg-surface">
                        <h3 className="text-lg font-semibold text-error">
                            Processing Error
                        </h3>
                        <p className="text-sm text-text-secondary mt-1">
                            {video.error_message || 'An error occurred during processing'}
                        </p>
                    </Card>
                )}

                {video.status === 'complete' && (
                    <div className="space-y-6">
                        <Card className="p-6 md:p-7">
                            <h2 className="text-2xl font-heading font-semibold text-text-primary mb-4">
                                Video
                            </h2>
                            <VideoPlayer
                                src={apiUrl(`/api/videos/${video.id}/stream`)}
                                fps={video.fps || 30}
                                frameData={frameData}
                                debugOverlay={debugOverlay}
                                onDrawStatsChange={handleOverlayStatsChange}
                            />
                            {!frameDataLoading && frameData && frameData.length > 0 && !hasLandmarks && (
                                <p className="mt-4 text-sm text-text-secondary">
                                    Skeleton data is unavailable for this video frame set. Reprocess this video to
                                    regenerate pose landmarks.
                                </p>
                            )}
                            {!frameDataLoading && hasLandmarks && overlayIssueDetected && (
                                <p className="mt-4 text-sm text-warning">
                                    Overlay diagnostics show zero visible scored arm segments for repeated frames. Keep
                                    diagnostics enabled with
                                    {' '}
                                    <code>?overlayDebug=1</code>
                                    {' '}
                                    while reproducing this page.
                                </p>
                            )}
                        </Card>

                        {/* Metrics Panel */}
                        {metrics && !metricsLoading && (
                            <MetricsPanel metrics={metrics} />
                        )}

                        {!frameDataLoading && frameData && frameData.length > 0 && (
                            <FrameAnalyticsPanel frameData={frameData} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
