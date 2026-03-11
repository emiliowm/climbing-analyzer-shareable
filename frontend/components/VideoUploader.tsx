'use client';

import { useState } from 'react';
import { useUploadVideo } from '@/hooks/useVideos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';

export function VideoUploader() {
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const { mutate: upload, isPending } = useUploadVideo();

    const handleUpload = () => {
        if (!file || !title) {
            alert('Please select a file and enter a title');
            return;
        }

        // Validate file type
        if (!file.type.startsWith('video/')) {
            alert('Please select a valid video file');
            return;
        }

        // Validate file size (max 500MB)
        const maxSize = 500 * 1024 * 1024;
        if (file.size > maxSize) {
            alert('File size must be less than 500MB');
            return;
        }

        upload({ file, title }, {
            onSuccess: () => {
                alert('Video uploaded successfully!');
                setFile(null);
                setTitle('');
            },
            onError: (error) => {
                alert(`Upload failed: ${error.message}`);
            },
        });
    };

    return (
        <Card className="p-6 md:p-8">
            <h2 className="text-2xl font-heading font-semibold mb-6 text-text-primary">
                Upload Video
            </h2>

            <div className="space-y-5">
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Video Title
                    </label>
                    <Input
                        type="text"
                        placeholder="Enter video title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={isPending}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Video File
                    </label>
                    <Input
                        type="file"
                        accept="video/*"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        disabled={isPending}
                    />
                    {file && (
                        <p className="mt-2 text-sm text-text-tertiary">
                            Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                    )}
                </div>

                <Button
                    onClick={handleUpload}
                    disabled={isPending || !file || !title}
                    className="w-full"
                >
                    {isPending ? 'Uploading...' : 'Upload Video'}
                </Button>

                {isPending && (
                    <div className="space-y-2">
                        <Progress value={50} />
                        <p className="text-sm text-text-secondary text-center">
                            Uploading video...
                        </p>
                    </div>
                )}
            </div>
        </Card>
    );
}
