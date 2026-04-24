import { format } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSalesmanIncentiveDashboardAction } from './actions';
import type { SalesmanIncentiveItem } from '@/lib/types';
import { CreateIncentiveDialog } from './CreateIncentiveDialog';

const formatInr = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return format(date, 'dd MMM yyyy');
};

const formatStockState = (item: SalesmanIncentiveItem) => {
  if (!item.requiresInStock) return 'Not required';
  if (item.isInStock === true) return 'In Stock';
  if (item.isInStock === false) return 'Out of Stock';
  return 'Pending Verification';
};

const getRuleLabel = (ruleCode: SalesmanIncentiveItem['ruleCode']) => {
  switch (ruleCode) {
    case 'TASSEL':
      return 'TASSEL 3%';
    case 'PREFIX_ESC_ES':
      return 'ESC/ES 2%';
    case 'PREFIX_S_F_FS_RLM_W_WS':
      return 'S/F/FS/RLM/W/WS 1%';
    default:
      return 'Not Incentivable';
  }
};

export default async function SalesmanIncentivesPage() {
  const dashboard = await getSalesmanIncentiveDashboardAction();

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Salesman Incentives</h1>
          <p className="text-sm text-muted-foreground">
            Effective from {formatDate(dashboard.effectiveFrom)}. Rule set version {dashboard.schemaVersion}.
          </p>
        </div>
        <CreateIncentiveDialog effectiveFrom={dashboard.effectiveFrom} />
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Total Salesmen</CardDescription>
            <CardTitle>{dashboard.totals.totalSalesmen}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total Orders</CardDescription>
            <CardTitle>{dashboard.totals.totalOrders}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Orders With Incentive</CardDescription>
            <CardTitle>{dashboard.totals.ordersWithEarnedIncentive}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Potential Incentive</CardDescription>
            <CardTitle>{formatInr(dashboard.totals.potentialIncentiveAmount)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Earned Incentive</CardDescription>
            <CardTitle>{formatInr(dashboard.totals.earnedIncentiveAmount)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {dashboard.salesmen.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No incentive documents found in `SalesmanIncentiveDetails`.
          </CardContent>
        </Card>
      ) : (
        dashboard.salesmen.map((salesman) => (
          <Card key={salesman.docId}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>{salesman.salesmanDetails.salesmanName}</span>
                <Badge variant="secondary">{salesman.salesmanDetails.salesmanCode || 'NO-CODE'}</Badge>
              </CardTitle>
              <CardDescription>
                Orders: {salesman.summary.totalOrders} | Eligible items: {salesman.summary.eligibleItemsCount} | Earned: {formatInr(salesman.summary.earnedIncentiveAmount)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Potential</TableHead>
                      <TableHead className="text-right">Earned</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesman.orders.map((order) => (
                      <TableRow key={order.orderId}>
                        <TableCell className="font-medium">{order.orderId}</TableCell>
                        <TableCell>{formatDate(order.orderDate || order.createdAt)}</TableCell>
                        <TableCell>{order.customerSnapshot?.name || '-'}</TableCell>
                        <TableCell className="text-right">{formatInr(order.summary.potentialIncentiveAmount)}</TableCell>
                        <TableCell className="text-right">{formatInr(order.summary.earnedIncentiveAmount)}</TableCell>
                        <TableCell className="text-right">
                          {order.summary.eligibleItemsCount}/{order.summary.itemsCount}
                        </TableCell>
                        <TableCell className="w-[460px]">
                          <details>
                            <summary className="cursor-pointer text-sm text-primary">View item-wise</summary>
                            <div className="mt-3 border rounded-md overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Item Name</TableHead>
                                    <TableHead>Rule</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Rate</TableHead>
                                    <TableHead className="text-right">Discount %</TableHead>
                                    <TableHead className="text-right">Total Item Rate</TableHead>
                                    <TableHead className="text-right">Incentive %</TableHead>
                                    <TableHead className="text-right">Incentive Amount</TableHead>
                                    <TableHead>In Stock</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {order.fabricDetails.map((item) => (
                                    <TableRow key={`${order.orderId}-${item.lineId}`}>
                                      <TableCell>{item.itemName || item.bcn || '-'}</TableCell>
                                      <TableCell>
                                        <Badge variant={item.isIncentivable ? 'default' : 'outline'}>
                                          {getRuleLabel(item.ruleCode)}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">{item.qty}</TableCell>
                                      <TableCell className="text-right">{formatInr(item.rate)}</TableCell>
                                      <TableCell className="text-right">{item.discountPercent ?? 0}%</TableCell>
                                      <TableCell className="text-right">{formatInr(item.totalItemRate)}</TableCell>
                                      <TableCell className="text-right">{item.incentivePercent}%</TableCell>
                                      <TableCell className="text-right font-medium">
                                        {formatInr(item.incentiveAmount)}
                                      </TableCell>
                                      <TableCell>{formatStockState(item)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                            {!order.isIncentiveApplicableByDate && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                This order is before 4 April 2026, so incentive payout is disabled.
                              </p>
                            )}
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
