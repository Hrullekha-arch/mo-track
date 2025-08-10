
"use client";

import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

export default function Page() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8 text-center">
            <h1 className="text-2xl font-bold">This page has moved.</h1>
            <p className="text-muted-foreground">The inventory scanner is now part of the universal scanner.</p>
            <Button asChild variant="link" className="mt-4">
                <Link href="/scan">Go to Universal Scanner</Link>
            </Button>
        </div>
    )
}
