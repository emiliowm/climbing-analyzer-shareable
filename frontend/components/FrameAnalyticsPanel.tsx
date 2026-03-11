'use client';

import { useMemo } from 'react';
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { axisConfig, gridConfig, metricColors } from '@/lib/chart-config';
import type { FrameMetrics } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { Button } from '@/components/ui/button';

interface FrameAnalyticsPanelProps {
    frameData: FrameMetrics[];
}

type ChartPoint = {
    frame: number;
    leftElbow: number;
    rightElbow: number;
    stabilityPct: number;
    barnDoor: number;
    hipDistance: number;
};

export function FrameAnalyticsPanel({ frameData }: FrameAnalyticsPanelProps) {
    const { currentFrame, selectedMetric, setSelectedMetric } = usePlayerStore();

    const sampledData = useMemo(() => {
        if (!frameData?.length) {
            return [] as ChartPoint[];
        }

        const step = Math.max(1, Math.floor(frameData.length / 700));
        const points: ChartPoint[] = [];

        for (let index = 0; index < frameData.length; index += step) {
            const item = frameData[index];
            points.push({
                frame: item.frame_number,
                leftElbow: Number(item.left_elbow_angle.toFixed(2)),
                rightElbow: Number(item.right_elbow_angle.toFixed(2)),
                stabilityPct: item.is_stable ? 100 : 0,
                barnDoor: item.barn_door_warning ? 1 : 0,
                hipDistance: Number(item.hip_z_distance.toFixed(3)),
            });
        }

        const last = frameData[frameData.length - 1];
        if (points[points.length - 1]?.frame !== last.frame_number) {
            points.push({
                frame: last.frame_number,
                leftElbow: Number(last.left_elbow_angle.toFixed(2)),
                rightElbow: Number(last.right_elbow_angle.toFixed(2)),
                stabilityPct: last.is_stable ? 100 : 0,
                barnDoor: last.barn_door_warning ? 1 : 0,
                hipDistance: Number(last.hip_z_distance.toFixed(3)),
            });
        }

        return points;
    }, [frameData]);

    const activeFrame = frameData[Math.min(currentFrame, Math.max(frameData.length - 1, 0))];

    return (
        <Card className="overflow-hidden p-0">
            <CardHeader className="border-b border-border">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-2xl font-heading">Frame Analytics</CardTitle>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant={selectedMetric === 'stability' ? 'default' : 'secondary'}
                            size="sm"
                            onClick={() => setSelectedMetric('stability')}
                        >
                            Stability
                        </Button>
                        <Button
                            type="button"
                            variant={selectedMetric === 'elbow' ? 'default' : 'secondary'}
                            size="sm"
                            onClick={() => setSelectedMetric('elbow')}
                        >
                            Elbow
                        </Button>
                        <Button
                            type="button"
                            variant={selectedMetric === 'flow' ? 'default' : 'secondary'}
                            size="sm"
                            onClick={() => setSelectedMetric('flow')}
                        >
                            Flow Proxy
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 md:p-6 space-y-5">
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                        <p className="text-text-tertiary">Current Frame</p>
                        <p className="text-text-primary font-semibold">{activeFrame?.frame_number ?? 0}</p>
                    </div>
                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                        <p className="text-text-tertiary">Left / Right Elbow</p>
                        <p className="text-text-primary font-semibold">
                            {activeFrame ? `${activeFrame.left_elbow_angle.toFixed(1)}° / ${activeFrame.right_elbow_angle.toFixed(1)}°` : '-'}
                        </p>
                    </div>
                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                        <p className="text-text-tertiary">Stability / Barn Door</p>
                        <p className="text-text-primary font-semibold">
                            {activeFrame ? `${activeFrame.is_stable ? 'Stable' : 'Unstable'} / ${activeFrame.barn_door_warning ? 'Warning' : 'Normal'}` : '-'}
                        </p>
                    </div>
                </div>

                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sampledData} margin={{ top: 10, right: 12, left: 8, bottom: 4 }}>
                            <CartesianGrid {...gridConfig} />
                            <XAxis dataKey="frame" {...axisConfig} />
                            <YAxis {...axisConfig} />
                            <Tooltip
                                contentStyle={{
                                    background: '#111315',
                                    color: '#f8fafc',
                                    border: '1px solid rgba(248,250,252,0.22)',
                                    borderRadius: 8,
                                }}
                            />
                            <ReferenceLine x={currentFrame} stroke="rgba(17,19,21,0.48)" strokeDasharray="4 4" />

                            {selectedMetric === 'stability' && (
                                <>
                                    <Line type="monotone" dataKey="stabilityPct" stroke={metricColors.stability} strokeWidth={2} dot={false} />
                                    <Line type="stepAfter" dataKey="barnDoor" stroke={metricColors.barnDoor} strokeWidth={2} dot={false} yAxisId={0} />
                                </>
                            )}

                            {selectedMetric === 'elbow' && (
                                <>
                                    <Line type="monotone" dataKey="leftElbow" stroke={metricColors.elbowFlexion} strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="rightElbow" stroke={metricColors.flowScore} strokeWidth={2} dot={false} />
                                </>
                            )}

                            {selectedMetric === 'flow' && (
                                <Line type="monotone" dataKey="hipDistance" stroke={metricColors.hipDistance} strokeWidth={2} dot={false} />
                            )}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
