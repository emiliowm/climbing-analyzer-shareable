'use client';

import { useVideos } from '@/hooks/useVideos';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function HomePage() {
  const { data: videos, isLoading, error } = useVideos();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-text-secondary">Loading videos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-error">Error loading videos: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="rounded-xl border border-border bg-surface-elevated p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-accent-strong">
                Climbing Analyzer
              </p>
              <h1 className="mt-2 text-3xl font-heading font-bold text-text-primary md:text-4xl">
                Analyze movement with frame-level precision
              </h1>
              <p className="mt-3 max-w-3xl text-text-secondary">
                Upload a climb, track processing in real time, and inspect biomechanical metrics built for coaching feedback.
              </p>
            </div>
            <Link href="/upload">
              <Button>Upload Video</Button>
            </Link>
          </div>
        </header>

        <section className="rounded-xl border border-border bg-surface-elevated p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-heading font-semibold text-text-primary md:text-2xl">
              Recent Videos
            </h2>
            <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
              {videos?.length ?? 0} total
            </span>
          </div>

          {!videos || videos.length === 0 ? (
            <Card className="border-dashed bg-surface">
              <CardContent className="p-10 text-center">
                <p className="text-text-secondary mb-4">
                  No videos uploaded yet
                </p>
                <Link href="/upload">
                  <Button>Upload Your First Video</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {videos.map((video) => (
                <Link key={video.id} href={`/videos/${video.id}`}>
                  <Card className="h-full transition-colors hover:border-accent-primary">
                    <CardHeader>
                      <CardTitle className="line-clamp-1 text-base md:text-lg">
                        {video.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-text-secondary">Status</span>
                          <span className={`text-sm font-medium ${video.status === 'complete' ? 'text-success' :
                            video.status === 'processing' ? 'text-warning' :
                              video.status === 'error' ? 'text-error' :
                                'text-text-secondary'
                            }`}>
                            {video.status}
                          </span>
                        </div>
                        {video.status === 'processing' && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-text-secondary">Progress</span>
                            <span className="text-sm font-medium text-text-primary">
                              {video.progress}%
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-text-tertiary">
                          {new Date(video.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
