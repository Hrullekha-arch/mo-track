
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { CuttingScannerComponent } from './scanner';

export default function Page() {
    return (
        <Suspense fallback={<Skeleton className="h-screen w-full" />}>
            <CuttingScannerComponent />
        </Suspense>
    )
}
