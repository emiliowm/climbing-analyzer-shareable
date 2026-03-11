"""
WebSocket consumer with authentication, ownership verification, and state sync.

Custom Close Codes:
- 4001: Unauthorized (no valid token)
- 4003: Forbidden (not video owner)
"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Video

class VideoProcessingConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.video_id = self.scope['url_route']['kwargs']['video_id']
        self.user = self.scope.get('user')
        
        # Reject unauthenticated connections
        if not self.user or self.user.is_anonymous:
            await self.close(code=4001)  # Custom code: Unauthorized
            return
        
        # Verify ownership
        if not await self.user_owns_video():
            await self.close(code=4003)  # Custom code: Forbidden
            return
        
        # Join room group
        self.room_group_name = f'video_{self.video_id}'
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
        
        # Send current state (handles race condition where task
        # finishes before WebSocket connects)
        await self.send_current_state()
    
    @database_sync_to_async
    def user_owns_video(self):
        """Check if authenticated user owns this video"""
        return Video.objects.filter(
            id=self.video_id,
            user=self.user
        ).exists()
    
    @database_sync_to_async
    def get_video_state(self):
        """Get current video state from database"""
        try:
            video = Video.objects.get(id=self.video_id)
            return {
                'status': video.status,
                'progress': video.progress,
                'error_message': video.error_message
            }
        except Video.DoesNotExist:
            return None
    
    async def send_current_state(self):
        """
        Send current video state on connection.
        Handles race condition where task finishes before WS connects.
        """
        state = await self.get_video_state()
        
        if state:
            await self.send(text_data=json.dumps({
                'type': 'state_sync',
                'status': state['status'],
                'progress': state['progress'],
                'error_message': state.get('error_message')
            }))
    
    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )
    
    async def receive(self, text_data):
        # No client-to-server messages expected
        pass
    
    async def video_progress(self, event):
        """Send progress update to WebSocket"""
        await self.send(text_data=json.dumps({
            'type': 'progress',
            'progress': event['progress'],
            'status': event['status']
        }))
