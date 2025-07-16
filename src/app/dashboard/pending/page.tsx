
import { PendingOrdersList } from "@/components/features/order-management/PendingOrdersList";

export default function PendingOrdersPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Orders to be Received</h1>
                <p className="text-muted-foreground">Acknowledge new orders to add them to the main workflow.</p>
            </header>
            <PendingOrdersList />
        </div>
    );
}

