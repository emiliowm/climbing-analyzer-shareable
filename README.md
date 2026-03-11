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

## Local Setup

### Prerequisites

- Python 3.12
- Node.js 20+
- Docker and Docker Compose

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, and MinIO.

### 2. Configure the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements/development.txt
cp .env.example .env
python manage.py migrate
```

MinIO expects a bucket named `climbing-analyzer`. Create it once through the MinIO console at `http://127.0.0.1:9001` if it does not already exist.

### 3. Run the backend API

```bash
cd backend
./venv/bin/python manage.py runserver 127.0.0.1:8000 --noreload
```

### 4. Run the worker

```bash
cd backend
./venv/bin/celery -A config worker -l info --pool=solo --concurrency=1
```

The solo pool is intentional on macOS. It is slower, but it has been the most reliable local execution mode for video processing.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev -- --hostname 127.0.0.1 --port 3000
```

### 6. Verify the stack

```bash
curl -I http://127.0.0.1:3000
curl http://127.0.0.1:8000/api/videos
curl -I http://127.0.0.1:9001
```

## Developer Checks

Backend:

```bash
cd backend
./venv/bin/python manage.py check
./venv/bin/python manage.py test videos -v 2
```

Frontend:

```bash
cd frontend
npm run lint
```

## Current Shortcomings

The current implementation is intentionally honest about where it stands:

- Authentication is not production-ready. Several API routes are effectively public and the upload endpoint falls back to the first available user for local testing.
- Accuracy has not been calibrated against a labeled climbing dataset. The scoring and overlay states are useful heuristics, not validated coaching truth.
- The current motion feedback is strongest on clear, single-subject recordings with a full-body view. Occlusion, poor lighting, and aggressive camera movement degrade results quickly.
- Historical videos may need reprocessing to take advantage of newer frame payload fields such as landmark-rich overlays.
- Local startup still relies on multiple processes rather than a single durable supervisor command.
- MinIO bucket provisioning is not automated yet.

## Planned Improvements

The next meaningful improvements are not cosmetic. They are about making the analysis more defensible and the product easier to use.

### Accuracy

- Build a labeled evaluation set of real climbing clips.
- Tune elbow, stability, and hip-position thresholds against measured outcomes instead of hand-tuned heuristics.
- Expand scoring beyond the current arm-focused overlay bands into more complete movement analysis.
- Add repeatable regression checks around the frame-analysis pipeline.

### Usability

- Replace the temporary authentication shortcuts with proper user ownership and access control.
- Add a one-command local supervisor for backend, worker, and frontend.
- Improve session history, comparison workflows, and result explainability.
- Add better handling for failed uploads, long-running jobs, and reprocessing flows.

## Repository Layout

```text
backend/   Django API, Celery tasks, analysis pipeline
frontend/  Next.js application and review UI
.github/   CI workflow and contribution templates
```

## Notes

- The repository is organized for local development first.
- The root README is the primary source of truth for running the application.
- The frontend subdirectory no longer carries the default Create Next App boilerplate documentation.
