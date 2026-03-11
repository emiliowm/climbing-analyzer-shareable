import axios from 'axios';

const DEFAULT_API_ORIGIN = 'http://127.0.0.1:8000';

function withNoTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
}

function resolveBrowserApiOrigin(): string {
    if (typeof window === 'undefined') {
        return DEFAULT_API_ORIGIN;
    }

    return `${window.location.protocol}//${window.location.hostname}:8000`;
}

export function getApiBaseUrl(): string {
    const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (!configured) {
        return resolveBrowserApiOrigin();
    }

    try {
        const parsed = new URL(configured);
        // Docker-internal hosts can be unreachable from browser context.
        if (typeof window !== 'undefined' && ['backend', 'api', 'server'].includes(parsed.hostname)) {
            return resolveBrowserApiOrigin();
        }
        return withNoTrailingSlash(parsed.toString());
    } catch {
        return resolveBrowserApiOrigin();
    }
}

export function apiUrl(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${getApiBaseUrl()}${normalizedPath}`;
}

export const api = axios.create({
    baseURL: `${getApiBaseUrl()}/api`,
});

// Add JWT token interceptor for authenticated requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// TypeScript Types
export interface Video {
    id: string;
    title: string;
    status: 'uploading' | 'processing' | 'complete' | 'error';
    progress: number;
    duration?: number;
    fps?: number;
    width?: number;
    height?: number;
    file_size?: number;
    created_at: string;
    updated_at: string;
    processed_at?: string;
    error_message?: string;
}

export interface VideoMetrics {
    flow_score: number;
    flow_score_rating: string;
    stability_index_percent: number;
    flexion_index_percent: number;
    barn_door_events: number;
    avg_hip_distance: number;
}

export interface FrameMetrics {
    frame_number: number;
    timestamp: number;
    com_position: [number, number];
    com_velocity: [number, number];
    com_acceleration: [number, number];
    left_elbow_angle: number;
    right_elbow_angle: number;
    hip_z_distance: number;
    frame_quality: 'good' | 'bad';
    is_stable: boolean;
    barn_door_warning: boolean;
    pose_landmarks: Array<{
        id: number;
        x: number;
        y: number;
        z: number;
        visibility: number;
    }>;
    contact_points: Array<{
        landmark_id: number;
        position: [number, number];
        is_static: boolean;
    }>;
}

// API Functions
export const videoApi = {
    upload: async (file: File, title: string) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('file_size', file.size.toString());

        const { data } = await api.post<Video>('/videos/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return data;
    },

    list: async () => {
        const { data } = await api.get<Video[]>('/videos');
        return data;
    },

    get: async (id: string) => {
        const { data } = await api.get<Video>(`/videos/${id}`);
        return data;
    },

    getMetrics: async (id: string) => {
        const { data } = await api.get<VideoMetrics>(`/videos/${id}/metrics`);
        return data;
    },

    getFrameData: async (id: string) => {
        const { data } = await api.get<FrameMetrics[]>(`/videos/${id}/frames`);
        return data;
    },

    delete: async (id: string) => {
        await api.delete(`/videos/${id}`);
    },
};
