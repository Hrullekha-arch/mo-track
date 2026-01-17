
"use client";

import { FileText, ShoppingCart, CheckCircle, Package, RotateCcw, Wrench, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";

const actions = [
  {
    title: "Instant Quotation",
    description: "Quickly build a new quotation",
    icon: Zap,
    path: "/dashboard/quotation-builder",
    color: "text-purple-600",
  },
  {
    title: "Quotation",
    description: "Create & manage customer quotations",
    icon: FileText,
    path: "/dashboard/customers",
    color: "text-blue-600",
  },
  {
    title: "Sales Order",
    description: "Convert quotation into sales order",
    icon: ShoppingCart,
    path: "/dashboard/sales-order",
    color: "text-emerald-600",
  },
  {
    title: "Approve Order",
    description: "Approve pending orders",
    icon: CheckCircle,
    path: "/dashboard/approve-order",
    color: "text-violet-600",
  },
  {
    title: "Allocate Order",
    description: "Allocate stock & production",
    icon: Package,
    path: "/dashboard/orders",
    color: "text-orange-600",
  },
  {
    title: "Returnable",
    description: "Track returnable materials",
    icon: RotateCcw,
    path: "/dashboard/returnable",
    color: "text-red-600",
  },
  {
    title: "Installation Sheet",
    description: "Generate installer sheets",
    icon: Wrench,
    path: "/dashboard/installation-sheet",
    color: "text-cyan-600",
  },
];

export default function OrderFlowDashboard() {
  const router = useRouter();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Order Management</h1>
        <p className="text-gray-500 mt-1">
          Manage your order lifecycle from quotation to installation
        </p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {actions.map((item) => (
          <Card
            key={item.title}
            onClick={() => router.push(item.path)}
            className="cursor-pointer hover:shadow-xl transition-all duration-200 border rounded-2xl"
          >
            <CardContent className="p-6 flex gap-4 items-start">
              <div className={`p-3 rounded-xl bg-gray-100 ${item.color}`}>
                <item.icon className="w-6 h-6" />
              </div>

              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {item.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {item.description}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
