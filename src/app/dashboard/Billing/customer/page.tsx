"use client";

import { useState, useRef, useEffect } from "react";

export default function CustomerSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setResults([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchCustomers = async () => {
    if (query.trim().length < 2) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/zoho/customers?search=${query}`);
      const data = await res.json();
      console.log("Raw Data",data);
      setResults(data.customers || []);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") searchCustomers();
  };

  const handleSelect = (c: any) => {
    setSelected(c);
    setQuery(c.name);
    setResults([]);
  };

  const getInitials = (name: string) =>
    name
      ?.split(" ")
      .map((n: string) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      {/* Card */}
      <div className="w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl border border-slate-800">

        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-slate-800">
          <p className="text-xs font-semibold tracking-widest uppercase text-amber-500 mb-1">
            Zoho CRM
          </p>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Customer Lookup
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Search by name, email, or mobile
          </p>
        </div>

        {/* Search Area */}
        <div className="p-6" ref={wrapperRef}>
          <div className="relative flex">

            {/* Input */}
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </span>

              <input
                type="text"
                placeholder="Search customers..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-10 pr-9 py-3 bg-slate-800 border border-slate-700 border-r-0 rounded-l-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
              />

              {query && (
                <button
                  onClick={() => { setQuery(""); setResults([]); setSelected(null); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Search Button */}
            <button
              onClick={searchCustomers}
              disabled={isLoading || query.trim().length < 2}
              className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 font-semibold text-sm rounded-r-xl transition-all duration-150 whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  Searching
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                  Search
                </>
              )}
            </button>

            {/* Dropdown */}
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Results</span>
                  <span className="text-xs bg-amber-500/20 text-amber-400 font-semibold px-2 py-0.5 rounded-full">
                    {results.length} found
                  </span>
                </div>

                {results.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(c)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left border-b border-slate-700/50 last:border-0 group"
                  >
                    <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">
                      {getInitials(c.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400 truncate">{c.mobile} · {c.email}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-600 group-hover:text-amber-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hint */}
          {!isLoading && query.trim().length >= 2 && results.length === 0 && !selected && (
            <p className="text-xs text-slate-500 mt-3 text-center">
              Press{" "}
              <kbd className="bg-slate-800 border border-slate-700 text-slate-400 text-xs px-1.5 py-0.5 rounded">
                Enter
              </kbd>{" "}
              or click{" "}
              <span className="text-amber-500 font-semibold">Search</span>
            </p>
          )}

          {/* Selected Customer Card */}
          {selected && (
            <div className="mt-5 rounded-xl border border-slate-700 overflow-hidden">
              {/* Card Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
                    Customer Selected
                  </span>
                </div>
                <button
                  onClick={() => { setSelected(null); setQuery(""); }}
                  className="text-xs text-slate-500 hover:text-amber-400 transition-colors font-medium"
                >
                  Change
                </button>
              </div>

              {/* Card Body */}
              <div className="p-4 bg-slate-800/50">
                {/* Avatar + Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/30 flex items-center justify-center text-amber-400 text-base font-bold flex-shrink-0">
                    {getInitials(selected.name)}
                  </div>
                  <div>
                    <p className="text-base font-bold text-white">{selected.name}</p>
                    <p className="text-xs text-slate-400">Zoho Contact</p>
                  </div>
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900 rounded-lg px-3 py-2.5 border border-slate-700/60">
                    <p className="text-xs text-slate-500 mb-0.5 font-medium uppercase tracking-wider">Mobile</p>
                    <p className="text-sm text-slate-200 font-medium truncate">{selected?.contact_persons?.mobile || "—"}</p>
                  </div>
                  <div className="bg-slate-900 rounded-lg px-3 py-2.5 border border-slate-700/60">
                    <p className="text-xs text-slate-500 mb-0.5 font-medium uppercase tracking-wider">GST</p>
                    <p className="text-sm text-slate-200 font-medium truncate">{selected.gst || "—"}</p>
                  </div>
                  <div className="col-span-2 bg-slate-900 rounded-lg px-3 py-2.5 border border-slate-700/60">
                    <p className="text-xs text-slate-500 mb-0.5 font-medium uppercase tracking-wider">Email</p>
                    <p className="text-sm text-slate-200 font-medium truncate">{selected.email || "—"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}