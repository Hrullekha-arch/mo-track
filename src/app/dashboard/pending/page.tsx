
import { PendingOrdersList } from "@/components/features/order-management/PendingOrdersList";

export default function PendingOrdersPage() {
    return (
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Pending Orders</h1>
                <p className="text-muted-foreground">These orders have not yet been marked as "Order Received".</p>
            </header>
            <PendingOrdersList />
        </div>
    );
}
