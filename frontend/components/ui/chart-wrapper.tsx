'use client';

import { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface ChartWrapperProps {
    title: string;
    children: ReactNode;
}

export function ChartWrapper({ title, children }: ChartWrapperProps) {
    return (
        <Card className="p-5">
            <h3 className="text-lg font-heading font-semibold mb-4 text-text-primary">
                {title}
            </h3>
            <div className="w-full h-64">
                {children}
            </div>
        </Card>
    );
}
