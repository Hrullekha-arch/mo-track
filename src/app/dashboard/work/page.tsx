"use client";

import { useEffect, useState } from "react";
import { CalendarIcon, ChevronDownIcon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";

export default function WorkDashboard() {

  // Replace with your Firebase Auth context
  const userEmail = "admin@gmail.com";

  const [search, setSearch] = useState("");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);




  // Stats
  const [pendingCount, setPendingCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startDateObj, setStartDateObj] = useState<Date | undefined>();
  const [endDateObj, setEndDateObj] = useState<Date | undefined>();
  const [department, setDepartment] = useState("all");
  const [frequency, setFrequency] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // pagination logic
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;


  // Fetch tasks
  useEffect(() => {
    async function loadTasks() {
      try {
        const res = await fetch(`/api/task/pending?email=${userEmail}`);
        const data = await res.json();

        if (data.success) {
          setTasks(data.tasks);

          const today = new Date().toISOString().split("T")[0];
          const pending = data.tasks.length;
          const todayTasks = data.tasks.filter((t: any) => t["Planned"] === today).length;
          const overdue = data.tasks.filter((t: any) => {
            const planned = t["Planned"];
            if (!planned) return false;
            return new Date(planned) < new Date() && !t["Actual"];
          }).length;

          setPendingCount(pending);
          setTodayCount(todayTasks);
          setOverdueCount(overdue);
        }
      } finally {
        setLoading(false);
      }
    }

    loadTasks();
  }, []);

    // Filter Logic
 const filteredTasks = tasks.filter((t: any) => {
  const searchLower = search.toLowerCase();

  // Universal search filter
  const matchesSearch =
    t["Task"]?.toLowerCase().includes(searchLower) ||
    t["Task ID"]?.toString().includes(searchLower) ||
    t["Department"]?.toLowerCase().includes(searchLower);

  if (!matchesSearch) return false;

  // Department Filter
  if (department !== "all" && t["Department"] !== department) {
    return false;
  }

  // Frequency Filter
  if (frequency !== "all" && t["Freq"] !== frequency) {
    return false;
  }

  // Date Range Filter
  if (startDate || endDate) {
    const planned = t["Planned"];
    if (!planned) return false;

    const p = new Date(planned);

    if (startDate && p < new Date(startDate)) return false;
    if (endDate && p > new Date(endDate)) return false;
  }

  // Status logic
  const isOverdue =
    t["Planned"] && new Date(t["Planned"]) < new Date() && !t["Actual"];

  if (statusFilter === "Pending" && isOverdue) return false;
  if (statusFilter === "Overdue" && !isOverdue) return false;

  // If statusFilter === "all", show everything
  return true;
});

// pagination logic
const totalPages = Math.ceil(filteredTasks.length / rowsPerPage);

const paginatedTasks = filteredTasks.slice(
  (currentPage - 1) * rowsPerPage,
  currentPage * rowsPerPage
);

useEffect(() => {
  setCurrentPage(1);
}, [search, department, frequency, statusFilter, startDate, endDate]);


  return (
    <div className="p-6 bg-gray-100 min-h-screen space-y-6">

      <h1 className="text-3xl font-bold text-gray-800">Work Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        <Card>
          <CardHeader>
            <CardTitle>Total Pending</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-10 w-20" /> : <p className="text-3xl font-bold text-blue-600">{pendingCount}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today's Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-10 w-20" /> : <p className="text-3xl font-bold text-yellow-500">{todayCount}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-10 w-20" /> : <p className="text-3xl font-bold text-red-600">{overdueCount}</p>}
          </CardContent>
        </Card>

      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          <div className="flex flex-col md:flex-row md:space-x-4 gap-3">

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <CalendarIcon size={32} />
              {/* START DATE PICKER */}
                <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-48 justify-between">
                    {startDateObj ? startDateObj.toLocaleDateString() : "Start Date"}
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="p-0">
                    <Calendar
                    mode="single"
                    selected={startDateObj}
                    captionLayout="dropdown"
                    onSelect={(date) => {
                        setStartDateObj(date || undefined);
                        setStartDate(date ? date.toISOString().split("T")[0] : "");
                    }}
                    />
                </PopoverContent>
                </Popover>

                <span className="mx-2 text-gray-500">to</span>

                {/* END DATE PICKER */}
                <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" className="w-48 justify-between">
                    {endDateObj ? endDateObj.toLocaleDateString() : "End Date"}
                    <ChevronDownIcon className="ml-2 h-4 w-4" />
                    </Button>
                </PopoverTrigger>

                <PopoverContent className="p-0">
                    <Calendar
                    mode="single"
                    selected={endDateObj}
                    captionLayout="dropdown"
                    onSelect={(date) => {
                        setEndDateObj(date || undefined);
                        setEndDate(date ? date.toISOString().split("T")[0] : "");
                    }}
                    />
                </PopoverContent>
                </Popover>

            </div>

            {/* Department */}
            <Select onValueChange={setDepartment} value={department}>
            <SelectTrigger>
                <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="MIS">MIS</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
                <SelectItem value="Sales">Sales</SelectItem>
            </SelectContent>
            </Select>


            {/* Frequency */}
            <Select onValueChange={setFrequency} value={frequency}>
            <SelectTrigger>
                <SelectValue placeholder="Frequency" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="D">Daily</SelectItem>
                <SelectItem value="W">Weekly</SelectItem>
                <SelectItem value="M">Monthly</SelectItem>
            </SelectContent>
            </Select>


            {/* Status */}
           <Select onValueChange={setStatusFilter} value={statusFilter}>
            <SelectTrigger>
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
            </SelectContent>
            </Select>


          </div>

          {/* Search */}
          <div className="flex items-center gap-4 border rounded-full px-3 py-2 bg-gray-50 w-[350px]">
            <Search className="rounded-3xl text-gray-500" size={18} />
            <Input
            
              placeholder="Search task..."
              className="border-0 shadow-none rounded-3xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Task List</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task ID</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Planned</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Freq</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTasks.map((t: any, i) => {
                  const isOverdue =
                    t["Planned"] && new Date(t["Planned"]) < new Date() && !t["Actual"];

                  return (
                    <TableRow key={i}>
                      <TableCell>{t["Task ID"]}</TableCell>
                      <TableCell>{t["Task"]}</TableCell>
                      <TableCell>{t["Department"]}</TableCell>
                      <TableCell>{t["Planned"]}</TableCell>
                      <TableCell>{t["Actual"] || "—"}</TableCell>
                      <TableCell>{t["Freq"]}</TableCell>
                      <TableCell>
                        <span
                          className={`px-2 py-1 text-sm rounded-lg ${
                            isOverdue ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                          }`}
                        >
                          {isOverdue ? "Overdue" : "Pending"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            
          )}
          <div className="flex justify-between items-center mt-4">
            {/* Prev Button */}
            <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className={`px-4 py-2 rounded-lg text-sm border ${
                currentPage === 1
                    ? "bg-gray-200 text-gray-400"
                    : "bg-white hover:bg-gray-100"
                }`}
            >
                Previous
            </button>

            {/* Page Indicator */}
            <span className="text-gray-600 text-sm">
                Page {currentPage} of {totalPages}
            </span>

            {/* Next Button */}
            <button
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage((p) => p + 1)}
                className={`px-4 py-2 rounded-lg text-sm border ${
                currentPage === totalPages || totalPages === 0
                    ? "bg-gray-200 text-gray-400"
                    : "bg-white hover:bg-gray-100"
                }`}
            >
                Next
            </button>
            </div>

        </CardContent>
      </Card>

    </div>
  );
}
