// components/deals/StagedItemsList.tsx

import { StagedItem } from "../../hooks/useStagedItems";

export function StagedItemsList({ stagedItems, room }: { stagedItems: StagedItem[]; room: string }) {
  if (stagedItems.length === 0) return null;

  return (
    <div className="space-y-3 mt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-800">
          Staged Items for: <span className="text-blue-600">{room || "Unassigned"}</span>
        </h4>
        <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
          {stagedItems.length} item{stagedItems.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
        <ul className="divide-y divide-gray-100">
          {stagedItems.map((item, index) => (
            <li key={index} className="p-3 hover:bg-gray-50 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div className="text-sm text-gray-700">
                  {item.productType === "VAS" && (
                    <span>
                      <strong className="text-gray-900">{item.productCategory}</strong> → {item.subCategory}
                      {item.quantity && <span className="ml-2 text-gray-500">Qty: {item.quantity}</span>}
                    </span>
                  )}

                  {item.productType === "Hardware" && (
                    <span>
                      <strong className="text-gray-900">{item.productCategory}</strong> → {item.subCategory}
                      {item.quantity && <span className="ml-2 text-gray-500">Qty: {item.quantity}</span>}
                      {item.bcn && (
                        <span className="ml-2 text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                          BCN: {item.bcn}
                        </span>
                      )}
                    </span>
                  )}

                  {item.productSource === "flooring" && (
                    <span>
                      <span className="text-gray-500">Flooring</span> → <strong className="text-gray-900">{item.flooringType}</strong>
                      <span className="ml-2 text-gray-500">Qty: {item.quantity}</span>
                    </span>
                  )}

                  {item.productType !== "VAS" && item.productType !== "Hardware" && item.productSource !== "flooring" && (
                    <span>
                      <span className="text-gray-500">{item.fabricCategoryGroup}</span> | <strong className="text-gray-900">{item.categoryGroup}</strong>
                      {item.collectionBrand && <span className="ml-1 text-gray-600">({item.collectionBrand})</span>}
                      <span className="ml-2 text-gray-500">Qty: {item.quantity || "N/A"}</span>
                    </span>
                  )}
                </div>

                <div className="text-xs text-gray-400">
                  {index + 1}.
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}