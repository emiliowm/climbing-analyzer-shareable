import { create } from 'zustand';

/**
 * Player UI state - ONLY browser-side state.
 * Never store server data here.
 * 
 * STATE OWNERSHIP RULES:
 * - TanStack Query handles: Video list, metrics, frame data (from API)
 * - Zustand handles: Current frame, playback state, UI preferences (browser-only)
 */

interface PlayerState {
    // Video playback state
    currentFrame: number;
    isPlaying: boolean;
    playbackSpeed: number;

    // UI preferences
    isSidebarOpen: boolean;
    selectedMetric: 'stability' | 'elbow' | 'flow';

    // Actions
    setCurrentFrame: (frame: number) => void;
    setIsPlaying: (playing: boolean) => void;
    setPlaybackSpeed: (speed: number) => void;
    toggleSidebar: () => void;
    setSelectedMetric: (metric: 'stability' | 'elbow' | 'flow') => void;
    reset: () => void;
}

const initialState = {
    currentFrame: 0,
    isPlaying: false,
    playbackSpeed: 1.0,
    isSidebarOpen: true,
    selectedMetric: 'stability' as const,
};

export const usePlayerStore = create<PlayerState>((set) => ({
    ...initialState,

    setCurrentFrame: (frame) => set({ currentFrame: frame }),
    setIsPlaying: (playing) => set({ isPlaying: playing }),
    setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setSelectedMetric: (metric) => set({ selectedMetric: metric }),
    reset: () => set(initialState),
}));
