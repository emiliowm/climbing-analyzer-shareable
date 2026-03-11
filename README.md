# Climbing Analyzer

Climbing Analyzer is a full-stack web application for reviewing climbing videos with computer-vision-assisted feedback. A user uploads a clip, the backend processes it asynchronously, and the frontend presents the original video alongside frame-level metrics and a pose overlay intended to support coaching and self-review.

The current version is optimized for local development and iterative product validation rather than production deployment. It is stable enough to demonstrate the end-to-end workflow, but there are still deliberate shortcuts in authentication, operational setup, and model calibration.

## What The Application Does

- Uploads a climbing video from the browser.
- Stores the original asset in S3-compatible object storage (MinIO in local development).
- Queues video analysis through Celery.
- Extracts pose landmarks and frame-by-frame movement metrics with MediaPipe and OpenCV.
- Persists summary metrics and frame data in PostgreSQL.
- Streams the original video back to the browser for synchronized review.
- Renders a visual overlay and charts so the user can inspect movement over time.

## How It Works

1. The frontend posts the video file, title, and file size to `POST /api/videos/upload`.
2. Django creates a `Video` record and hands the work to a Celery task.
3. The worker loads the source video, runs the analysis pipeline, and emits progress updates.
4. Processed summary metrics and frame-level data are stored in `VideoMetrics`.
5. The frontend polls and subscribes for status updates, then loads:
   - video metadata from `GET /api/videos/{id}`
   - summary metrics from `GET /api/videos/{id}/metrics`
   - frame data from `GET /api/videos/{id}/frames`
   - the original playable asset from `GET /api/videos/{id}/stream`

## Architecture

| Layer | Stack | Responsibility |
| --- | --- | --- |
| Frontend | Next.js 16, TypeScript, Tailwind, TanStack Query, Zustand | Upload flow, playback, charts, overlay rendering |
| Backend API | Django 5, Django Ninja | Video CRUD, upload handling, metrics endpoints |
| Async Processing | Celery, Redis | Background video analysis, progress reporting |
| Analysis | MediaPipe, OpenCV, NumPy, SciPy | Pose extraction and metric computation |
| Data | PostgreSQL | Video metadata and analysis results |
| Object Storage | MinIO (S3-compatible) | Original uploaded video storage |

## Current Shortcomings

The current implementation is intentionally honest about where it stands:

- Authentication is not production-ready. Several API routes are effectively public and the upload endpoint falls back to the first available user for local testing.
- Accuracy has not been calibrated against a labeled climbing dataset. The scoring and overlay states are validated coaching truth.
- The current motion feedback is strongest on clear, single-subject recordings with a full-body view. Occlusion, poor lighting, and aggressive camera movement degrade results quickly.
- Historical videos may need reprocessing to take advantage of newer frame payload fields such as landmark-rich overlays.

## Planned Improvements

The next meaningful improvements are about making the analysis better and the product easier to use.

### Accuracy

- Build a labeled evaluation set of real climbing clips.
- Tune elbow, stability, and hip-position thresholds against measured outcomes instead of hand-tuned.
- Expand scoring beyond the current arm-focused overlay bands into more complete movement analysis.
- Add repeatable regression checks around the frame-analysis pipeline.

### Usability

- Replace the temporary authentication shortcuts with proper user ownership and access control.
- Improve session history, comparison workflows, and result explainability.
- Add better handling for failed uploads, long-running jobs, and reprocessing flows.

## Repository Layout

```text
backend/   Django API, Celery tasks, analysis pipeline
frontend/  Next.js application and review UI
.github/   CI workflow and contribution templates
```
