import { useEffect, useRef, useCallback } from 'react';
import type Player from 'video.js/dist/types/player';
import { usePlayerStore } from '@/stores/usePlayerStore';

/**
 * Bidirectional sync between Video.js player and frame data.
 * 
 * Handles:
 * - Player time → Zustand frame (during playback)
 * - Zustand frame → Player time (during scrubbing)
 * - Prevents feedback loops with seeking flag
 */

interface FrameSyncOptions {
    fps: number;           // From video metadata
    totalFrames: number;
}

export function useVideoFrameSync(
    playerRef: React.RefObject<Player | null>,
    options: FrameSyncOptions
) {
    const { fps, totalFrames } = options;
    const { setCurrentFrame, currentFrame } = usePlayerStore();
    const isSeekingRef = useRef(false);

    // Time to frame conversion
    const timeToFrame = useCallback((time: number): number => {
        return Math.floor(time * fps);
    }, [fps]);

    // Frame to time conversion
    const frameToTime = useCallback((frame: number): number => {
        return frame / fps;
    }, [fps]);

    // Sync player time → Zustand frame (during playback)
    useEffect(() => {
        const player = playerRef.current;
        if (!player) return;

        const handleTimeUpdate = () => {
            if (isSeekingRef.current) return;

            const currentTime = player.currentTime();
            if (currentTime === undefined) return;

            const frame = timeToFrame(currentTime);

            // Only update if frame changed (avoid unnecessary renders)
            if (frame !== currentFrame) {
                setCurrentFrame(frame);
            }
        };

        player.on('timeupdate', handleTimeUpdate);

        return () => {
            player.off('timeupdate', handleTimeUpdate);
        };
    }, [playerRef, timeToFrame, currentFrame, setCurrentFrame]);

    // Sync Zustand frame → player time (for frame scrubber)
    const seekToFrame = useCallback((frame: number) => {
        const player = playerRef.current;
        if (!player) return;

        isSeekingRef.current = true;
        const time = frameToTime(frame);
        player.currentTime(time);

        // Allow time for seek to complete
        setTimeout(() => {
            isSeekingRef.current = false;
        }, 100);
    }, [playerRef, frameToTime]);

    // Step forward/backward by exact frames
    const stepFrame = useCallback((direction: 1 | -1) => {
        const newFrame = Math.max(0, Math.min(totalFrames - 1, currentFrame + direction));
        setCurrentFrame(newFrame);
        seekToFrame(newFrame);
    }, [currentFrame, totalFrames, setCurrentFrame, seekToFrame]);

    return {
        timeToFrame,
        frameToTime,
        seekToFrame,
        stepFrame,
        currentFrame,
    };
}
