'use client';

import { VideoUploader } from '@/components/VideoUploader';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function UploadPage() {
    return (
        <div className="min-h-screen bg-background p-6 md:p-10">
            <div className="mx-auto max-w-3xl space-y-6">
                <div className="flex items-center justify-between rounded-xl border border-border bg-surface-elevated p-5 md:p-6">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.1em] text-accent-strong">
                            New Session
                        </p>
                        <h1 className="mt-2 text-3xl font-heading font-bold text-text-primary">
                            Upload Video
                        </h1>
                    </div>
                    <Link href="/">
                        <Button variant="secondary">Back to Home</Button>
                    </Link>
                </div>

                <VideoUploader />

                <div className="rounded-xl border border-border bg-surface p-6">
                    <h3 className="text-lg font-heading font-semibold text-text-primary mb-3">
                        Upload Instructions
                    </h3>
                    <ul className="space-y-2 text-sm text-text-secondary">
                        <li>• Video must be in MP4, MOV, or AVI format</li>
                        <li>• Maximum file size: 500MB</li>
                        <li>• Best results with clear view of climber&apos;s full body</li>
                        <li>• Processing typically takes 2-5 minutes</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
