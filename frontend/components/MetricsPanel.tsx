'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { VideoMetrics } from '@/lib/api';

interface MetricsPanelProps {
    metrics: VideoMetrics;
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
    return (
        <div className="space-y-4">
            <h2 className="text-2xl font-heading font-semibold text-text-primary">
                Analysis Results
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Flow Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-accent-strong">
                            {metrics.flow_score.toFixed(1)}/100
                        </div>
                        <p className="text-sm text-text-secondary mt-2">
                            {metrics.flow_score_rating}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                            Smoothness of movement based on jerk analysis
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Stability Index</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-success">
                            {metrics.stability_index_percent.toFixed(1)}%
                        </div>
                        <p className="text-xs text-text-tertiary mt-3">
                            Percentage of time maintaining stable balance
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Flexion Index</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-text-primary">
                            {metrics.flexion_index_percent.toFixed(1)}%
                        </div>
                        <p className="text-xs text-text-tertiary mt-3">
                            Average elbow flexion during climb
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Barn Door Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-error">
                            {metrics.barn_door_events}
                        </div>
                        <p className="text-xs text-text-tertiary mt-3">
                            Rotational instability incidents detected
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Avg Hip Distance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-bold text-text-secondary">
                            {metrics.avg_hip_distance.toFixed(2)}m
                        </div>
                        <p className="text-xs text-text-tertiary mt-3">
                            Average distance from wall to hips
                        </p>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
