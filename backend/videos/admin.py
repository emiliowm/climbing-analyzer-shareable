from django.contrib import admin
from .models import Video, VideoMetrics


@admin.register(Video)
class VideoAdmin(admin.ModelAdmin):
    list_display = ['title', 'user', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['title', 'user__username']
    readonly_fields = ['id', 'created_at', 'updated_at', 'processed_at']
    
    fieldsets = (
        ('Basic Information', {
            'fields': ('id', 'user', 'title', 'status', 'progress')
        }),
        ('Files', {
            'fields': ('original_file', 'processed_file', 'thumbnail')
        }),
        ('Metadata', {
            'fields': ('duration', 'fps', 'width', 'height', 'file_size')
        }),
        ('Status', {
            'fields': ('error_message',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'processed_at')
        }),
    )


@admin.register(VideoMetrics)
class VideoMetricsAdmin(admin.ModelAdmin):
    list_display = ['video', 'flow_score', 'flow_score_rating', 'algorithm_version', 'created_at']
    list_filter = ['flow_score_rating', 'algorithm_version', 'created_at']
    search_fields = ['video__title', 'video__user__username']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Video', {
            'fields': ('video', 'algorithm_version')
        }),
        ('Summary Metrics', {
            'fields': ('flow_score', 'flow_score_rating', 'stability_index_percent', 
                      'flexion_index_percent', 'barn_door_events', 'avg_hip_distance')
        }),
        ('Frame Data', {
            'fields': ('frame_data',),
            'classes': ('collapse',)  # Collapsed by default due to large JSON
        }),
        ('Timestamps', {
            'fields': ('created_at',)
        }),
    )
