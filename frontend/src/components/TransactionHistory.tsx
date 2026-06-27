"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Filter } from "lucide-react";

interface Transaction {
  id: string;
  hash: string;
  date: number;
  type: "deposit" | "withdraw" | "swap";
  amount: number;
  status: "pending" | "success" | "failed";
}

type SortKey = "date" | "amount" | "status" | "type";
type SortOrder = "asc" | "desc";
type ItemsPerPage = 25 | 50 | 100;

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<ItemsPerPage>(25);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Filters
  const [filterType, setFilterType] = useState<"all" | Transaction["type"]>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | Transaction["status"]>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [searchHash, setSearchHash] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, []);

  async function fetchTransactions() {
    setLoading(true);
    try {
      const res = await fetch("/api/vault/transactions?limit=10000");
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      } else {
        generateMockTransactions();
      }
    } catch {
      generateMockTransactions();
    } finally {
      setLoading(false);
    }
  }

  function generateMockTransactions() {
    const types: Transaction["type"][] = ["deposit", "withdraw", "swap"];
    const statuses: Transaction["status"][] = ["pending", "success", "failed"];
    const txs: Transaction[] = [];

    for (let i = 0; i < 500; i++) {
      txs.push({
        id: `tx-${i}`,
        hash: `0x${Math.random().toString(16).slice(2)}`,
        date: Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000,
        type: types[Math.floor(Math.random() * types.length)],
        amount: Math.random() * 10000,
        status: statuses[Math.floor(Math.random() * statuses.length)],
      });
    }

    setTransactions(txs);
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (filterStatus !== "all" && tx.status !== filterStatus) return false;

      if (filterDateFrom) {
        const from = new Date(filterDateFrom).getTime();
        if (tx.date < from) return false;
      }

      if (filterDateTo) {
        const to = new Date(filterDateTo).getTime();
        if (tx.date > to) return false;
      }

      if (searchHash && !tx.hash.includes(searchHash.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [transactions, filterType, filterStatus, filterDateFrom, filterDateTo, searchHash]);

  const sortedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions];
    sorted.sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];

      if (sortKey === "date") {
        aVal = a.date;
        bVal = b.date;
      }

      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortOrder === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredTransactions, sortKey, sortOrder]);

  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return sortedTransactions.slice(start, start + itemsPerPage);
  }, [sortedTransactions, page, itemsPerPage]);

  const totalPages = Math.ceil(sortedTransactions.length / itemsPerPage);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  }

  function exportCSV() {
    const headers = ["Date", "Type", "Amount", "Status", "Hash"];
    const rows = sortedTransactions.map((tx) => [
      new Date(tx.date).toISOString(),
      tx.type,
      tx.amount.toFixed(2),
      tx.status,
      tx.hash,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setFilterType("all");
    setFilterStatus("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchHash("");
    setPage(1);
  }

  const hasActiveFilters =
    filterType !== "all" ||
    filterStatus !== "all" ||
    filterDateFrom ||
    filterDateTo ||
    searchHash;

  return (
    <div
      data-cy="transaction-history"
      className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-700"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Transaction History
        </h2>
        <div className="flex items-center gap-2">
          <button
            data-cy="toggle-filters-btn"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              showFilters || hasActiveFilters
                ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-400"
                : "border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
            }`}
          >
            <Filter size={16} />
            Filters
          </button>
          <button
            data-cy="export-csv-btn"
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div
          data-cy="filter-panel"
          className="mb-6 grid grid-cols-2 gap-4 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50 md:grid-cols-3 lg:grid-cols-5"
        >
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Type
            </label>
            <select
              data-cy="filter-type"
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value as any);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="deposit">Deposit</option>
              <option value="withdraw">Withdraw</option>
              <option value="swap">Swap</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Status
            </label>
            <select
              data-cy="filter-status"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value as any);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              From Date
            </label>
            <input
              data-cy="filter-date-from"
              type="date"
              value={filterDateFrom}
              onChange={(e) => {
                setFilterDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              To Date
            </label>
            <input
              data-cy="filter-date-to"
              type="date"
              value={filterDateTo}
              onChange={(e) => {
                setFilterDateTo(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Hash
            </label>
            <input
              data-cy="filter-hash"
              type="text"
              placeholder="Search hash..."
              value={searchHash}
              onChange={(e) => {
                setSearchHash(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            />
          </div>

          {hasActiveFilters && (
            <div className="flex items-end">
              <button
                data-cy="clear-filters-btn"
                onClick={clearFilters}
                className="w-full rounded-lg bg-zinc-200 px-3 py-1.5 text-sm font-medium hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}

      {/* Results info */}
      <div className="mb-4 flex items-center justify-between text-sm">
        <p data-cy="results-count" className="text-zinc-600 dark:text-zinc-400">
          Showing {paginatedTransactions.length > 0 ? (page - 1) * itemsPerPage + 1 : 0}–
          {Math.min(page * itemsPerPage, sortedTransactions.length)} of{" "}
          {sortedTransactions.length} transactions
        </p>

        <select
          data-cy="items-per-page"
          value={itemsPerPage}
          onChange={(e) => {
            setItemsPerPage(parseInt(e.target.value) as ItemsPerPage);
            setPage(1);
          }}
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
        >
          <option value={25}>25 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table data-cy="transactions-table" className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                <button
                  onClick={() => handleSort("date")}
                  className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Date
                  {sortKey === "date" && (
                    <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                <button
                  onClick={() => handleSort("type")}
                  className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Type
                  {sortKey === "type" && (
                    <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-right px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                <button
                  onClick={() => handleSort("amount")}
                  className="flex items-center gap-1 ml-auto hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Amount
                  {sortKey === "amount" && (
                    <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                <button
                  onClick={() => handleSort("status")}
                  className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Status
                  {sortKey === "status" && (
                    <span>{sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </button>
              </th>
              <th className="text-left px-4 py-3 font-semibold text-zinc-900 dark:text-zinc-50">
                Hash
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                </td>
              </tr>
            ) : paginatedTransactions.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400"
                >
                  No transactions found
                </td>
              </tr>
            ) : (
              paginatedTransactions.map((tx) => (
                <tr
                  key={tx.id}
                  data-cy={`tx-row-${tx.id}`}
                  className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-100">
                    {new Date(tx.date).toLocaleDateString()} (
                    {new Date(tx.date).toLocaleTimeString()})
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        tx.type === "deposit"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : tx.type === "withdraw"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}
                    >
                      {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-900 dark:text-zinc-100">
                    {tx.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        tx.status === "success"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : tx.status === "pending"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <a
                      data-cy={`tx-explorer-link-${tx.id}`}
                      href={`https://stellar.expert/explorer/public/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 font-mono text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {tx.hash.slice(0, 12)}…
                      <ExternalLink size={14} />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-6 flex items-center justify-between">
        <button
          data-cy="prev-page-btn"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          <ChevronLeft size={16} />
          Previous
        </button>

        <div data-cy="page-info" className="text-sm text-zinc-600 dark:text-zinc-400">
          Page <span className="font-semibold">{page}</span> of{" "}
          <span className="font-semibold">{totalPages}</span>
        </div>

        <button
          data-cy="next-page-btn"
          onClick={() => setPage(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
