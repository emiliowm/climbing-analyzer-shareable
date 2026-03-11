import os
from celery import Celery
from config.runtime import configure_runtime

configure_runtime()
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('climbing_analyzer')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# ============================================================================
# TIMEOUT CONFIGURATION (Optimized for 2-3 minute climbing videos)
# ============================================================================
# 
# For a 3-minute video @ 30fps = 5,400 frames
# Based on Streamlit processing benchmarks: ~30-60 seconds per video
#
# These values provide buffer without blocking workers too long:
#
app.conf.update(
    # Hard limit - task killed after this
    task_time_limit=5 * 60,  # 5 minutes
    
    # Soft limit - raises SoftTimeLimitExceeded (allows graceful cleanup)
    task_soft_time_limit=4 * 60,  # 4 minutes
    
    # How long before unacked task is re-queued (MUST be > task_time_limit)
    broker_transport_options={
        'visibility_timeout': 6 * 60,  # 6 minutes
    },
    
    # Prevent prefetching (important for long tasks)
    worker_prefetch_multiplier=1,
    
    # Acknowledge after task completes (not before)
    task_acks_late=True,
    
    # Reject task on worker shutdown (will be re-queued)
    task_reject_on_worker_lost=True,
)
