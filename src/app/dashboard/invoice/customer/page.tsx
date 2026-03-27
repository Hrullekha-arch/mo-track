"use client";

import { useState } from "react";

export default function CustomerSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);

  const searchCustomers = async (value: string) => {
    setQuery(value);

    if (value.length < 2) {
      setResults([]);
      return;
    }

    const res = await fetch(`/api/zoho/customers?search=${value}`);
    const data = await res.json();

    setResults(data.customers || []);
  };

  return (
    <div className="relative w-full max-w-md">

      {/* Input */}
      <input
        type="text"
        placeholder="Search Customer (Zoho)"
        value={query}
        onChange={(e) => searchCustomers(e.target.value)}
        className="w-full border p-2 rounded"
      />

      {/* Dropdown */}
      {results.length > 0 && (
        <div className="absolute bg-white border w-full mt-1 rounded shadow z-50">
          {results.map((c, i) => (
            <div
              key={i}
              onClick={() => {
                setSelected(c);
                setQuery(c.name);
                setResults([]);
              }}
              className="p-2 hover:bg-gray-100 cursor-pointer"
            >
              <div className="font-medium">{c.name}</div>
              <div className="text-sm text-gray-500">
                {c.mobile} • {c.email}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Data */}
      {selected && (
        <div className="mt-4 p-3 border rounded bg-gray-50">
          <p><b>Name:</b> {selected.name}</p>
          <p><b>Mobile:</b> {selected.mobile}</p>
          <p><b>Email:</b> {selected.email}</p>
          <p><b>GST:</b> {selected.gst}</p>
        </div>
      )}
    </div>
  );
}