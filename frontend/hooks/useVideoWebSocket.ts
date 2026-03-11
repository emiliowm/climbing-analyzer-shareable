import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * WebSocket hook with:
 * - JWT authentication via query param
 * - State sync on connection (handles race conditions)
 * - TanStack Query cache invalidation on completion
 * - Custom close code handling
 */

interface VideoState {
    status: string;
    progress: number;
    error_message?: string;
}

export function useVideoWebSocket(videoId: string) {
    const [state, setState] = useState<VideoState | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws/videos/${videoId}/?token=${token}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'state_sync') {
                // Initial state or reconnection - sync with server
                setState(data);

                // Update React Query cache if complete
                if (data.status === 'complete') {
                    queryClient.invalidateQueries({ queryKey: ['video', videoId] });
                    queryClient.invalidateQueries({ queryKey: ['video-metrics', videoId] });
                }
            } else if (data.type === 'progress') {
                setState(prev => ({ ...prev, ...data }));
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = (event) => {
            if (event.code === 4001) {
                console.error('WebSocket: Unauthorized');
            } else if (event.code === 4003) {
                console.error('WebSocket: Forbidden - not video owner');
            }
        };

        return () => {
            ws.close();
        };
    }, [videoId, queryClient]);

    return state;
}
