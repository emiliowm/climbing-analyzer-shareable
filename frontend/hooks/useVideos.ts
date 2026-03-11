import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { videoApi } from '@/lib/api';

/**
 * Hook to fetch list of all videos for the current user
 */
export function useVideos() {
    return useQuery({
        queryKey: ['videos'],
        queryFn: videoApi.list,
    });
}

/**
 * Hook to fetch a single video by ID
 * Automatically polls every 2 seconds if video status is 'processing'
 */
export function useVideo(id: string) {
    return useQuery({
        queryKey: ['video', id],
        queryFn: () => videoApi.get(id),
        refetchInterval: (query) => {
            // Poll every 2 seconds if processing, otherwise don't poll
            return query.state.data?.status === 'processing' ? 2000 : false;
        },
    });
}

/**
 * Hook to fetch video metrics by video ID
 * Only enabled when ID is provided
 */
export function useVideoMetrics(id: string) {
    return useQuery({
        queryKey: ['video-metrics', id],
        queryFn: () => videoApi.getMetrics(id),
        enabled: !!id,
    });
}

/**
 * Hook to fetch frame-by-frame data for a video
 * Only enabled when ID is provided
 */
export function useFrameData(id: string, enabled = true, cacheBuster?: string) {
    return useQuery({
        queryKey: ['video-frames', id, cacheBuster ?? 'latest'],
        queryFn: () => videoApi.getFrameData(id),
        enabled: !!id && enabled,
    });
}

/**
 * Mutation hook for uploading videos
 * Invalidates videos list query on success
 */
export function useUploadVideo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ file, title }: { file: File; title: string }) =>
            videoApi.upload(file, title),
        onSuccess: () => {
            // Invalidate and refetch videos list
            queryClient.invalidateQueries({ queryKey: ['videos'] });
        },
    });
}

/**
 * Mutation hook for deleting videos
 * Invalidates videos list query on success
 */
export function useDeleteVideo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => videoApi.delete(id),
        onSuccess: () => {
            // Invalidate and refetch videos list
            queryClient.invalidateQueries({ queryKey: ['videos'] });
        },
    });
}
