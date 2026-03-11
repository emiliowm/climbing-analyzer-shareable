"""
WebSocket URL routing configuration.
"""
from django.urls import re_path
from videos import consumers

websocket_urlpatterns = [
    re_path(r'ws/videos/(?P<video_id>[^/]+)/$', consumers.VideoProcessingConsumer.as_asgi()),
]
