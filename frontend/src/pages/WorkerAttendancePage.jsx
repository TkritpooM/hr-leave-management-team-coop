import React, { useEffect, useMemo, useState } from "react";
import moment from "moment";
import "./WorkerAttendancePage.css";
import Pagination from "../components/Pagination";
import { getMyTimeRecords, getMyLateSummary } from "../api/timeRecordService";
import { alertError, alertSuccess } from "../utils/sweetAlert";

import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { enUS } from 'date-fns/locale';
import { useTranslation } from "react-i18next";

// Helper: Format date to YYYY-MM-DD
const pad2 = (n) => String(n).padStart(2, "0");
const toYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// CSV Builder
const buildCSV = (rows) => {
  const escape = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = ["Date", "Check In", "Check Out", "Status", "Note"].join(",");
  const body = rows
    .map((r) => [r.date, r.in, r.out, r.late ? "LATE" : "ON TIME", r.note].map(escape).join(","))
    .join("\n");
  return `${header}\n${body}`;
};

export default function WorkerAttendancePage() {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  
  // State
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: toYMD(start), end: toYMD(end) };
  });

  const [q, setQ] = useState("");
  const [onlyLate, setOnlyLate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [lateInfo, setLateInfo] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch Data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [recRes, lateRes] = await Promise.all([
        getMyTimeRecords({ startDate: range.start, endDate: range.end }),
        getMyLateSummary(),
      ]);

      const fetchedRecords = recRes.data?.records || recRes.data?.data?.records || [];
      setRecords(fetchedRecords);
      setLateInfo(lateRes.data || null);
    } catch (err) {
      console.error(err);
      await alertError("Fetch Failed", "Could not retrieve attendance records.");
    } finally {
      setLoading(false);
    }
  };

  // Sync data on range change
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [q, onlyLate, range.start, range.end]);

  // Filter and Normalize Logic
  const filteredData = useMemo(() => {
    const query = q.trim().toLowerCase();

    const mapped = records.map((r) => {
      const date = r.workDate ? moment(r.workDate).format("YYYY-MM-DD") : "";
      const inTime = r.checkInTime ? moment(r.checkInTime).format("HH:mm") : "-";
      const outTime = r.checkOutTime ? moment(r.checkOutTime).format("HH:mm") : "-";
      return {
        id: r.recordId || r.timeRecordId || r.id || `${date}-${inTime}`,
        date,
        in: inTime,
        out: outTime,
        late: !!r.isLate,
        note: r.note || "",
      };
    });

    return mapped.filter((item) => {
      const matchesLate = onlyLate ? item.late : true;
      const matchesSearch = !query || [item.date, item.in, item.out, item.note, item.late ? "late" : "on time"]
        .some((v) => String(v).toLowerCase().includes(query));
      
      return matchesLate && matchesSearch;
    });
  }, [records, q, onlyLate]);

  const total = filteredData.length;
  const startIdx = (page - 1) * pageSize;
  const pagedRecords = useMemo(
    () => filteredData.slice(startIdx, startIdx + pageSize),
    [filteredData, startIdx, pageSize]
  );

  const handleExportCSV = async () => {
    try {
      const csv = buildCSV(filteredData);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance_report_${range.start}_to_${range.end}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await alertSuccess("Export Successful", "CSV file has been downloaded.");
    } catch (e) {
      await alertError("Export Failed", "Could not generate CSV file.");
    }
  };

  const { lateCount = null, lateLimit = 5, isExceeded = false } = lateInfo || {};

  return (
    <div className="wa-page">
      <header className="wa-header">
        <div>
          <h1 className="wa-title">{t("pages.workerAttendancePage.My Attendance")}</h1>
          <p className="wa-subtitle">{t("pages.workerAttendancePage.Attendance history with search, filter, and export options")}</p>
        </div>

        <div className="wa-header-right">
          <div className={`wa-pill ${isExceeded ? "danger" : ""}`}>
            Late this month: <strong>{lateCount ?? "-"}</strong> / {lateLimit}
          </div>
          <button className="wa-btn wa-btn-primary" type="button" onClick={handleExportCSV} disabled={loading}>{t("pages.workerAttendancePage.Export CSV")}</button>
        </div>
      </header>

      <section className="wa-panel">
        <div className="wa-controls">
          <div className="wa-control">
            <label>{t("pages.workerAttendancePage.Start Date")}</label>
            <DatePicker
              selected={new Date(range.start)}
              onChange={(date) => setRange((p) => ({ ...p, start: toYMD(date) }))}
              dateFormat="yyyy-MM-dd"
              locale={enUS}
              maxDate={new Date(range.end)}
              className="wa-datepicker-input"
            />
          </div>

          <div className="wa-control">
            <label>{t("pages.workerAttendancePage.End Date")}</label>
            <DatePicker
              selected={new Date(range.end)}
              onChange={(date) => setRange((p) => ({ ...p, end: toYMD(date) }))}
              dateFormat="yyyy-MM-dd"
              locale={enUS}
              minDate={new Date(range.start)}
              maxDate={today}
              className="wa-datepicker-input"
            />
          </div>

          <div className="wa-control wa-search">
            <label>{t("pages.workerAttendancePage.Search")}</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("common.placeholders.filterDateNoteTime")}
            />
          </div>

          <label className="wa-toggle">
            <input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} />
            <span>{t("pages.workerAttendancePage.Show only late")}</span>
          </label>

          <button className="wa-btn wa-btn-ghost" type="button" onClick={fetchData} disabled={loading}>{t("pages.workerAttendancePage.Refresh")}</button>
        </div>

        <div className="wa-table-wrap">
          {loading ? (
            <div className="wa-empty">{t("common.loadingRecords")}</div>
          ) : total === 0 ? (
            <div className="wa-empty">{t("pages.workerAttendancePage.noRecordsInRange")}</div>
          ) : (
            <table className="wa-table">
              <thead>
                <tr>
                  <th>{t("pages.workerAttendancePage.Date")}</th>
                  <th>{t("pages.workerAttendancePage.Check In")}</th>
                  <th>{t("pages.workerAttendancePage.Check Out")}</th>
                  <th>{t("pages.workerAttendancePage.Status")}</th>
                  <th>{t("pages.workerAttendancePage.Note")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((r) => (
                  <tr key={r.id}>
                    <td className="wa-mono">{r.date}</td>
                    <td className="wa-mono">{r.in}</td>
                    <td className="wa-mono">{r.out}</td>
                    <td>
                      <span className={`wa-badge ${r.late ? "late" : "ok"}`}>
                        {r.late ? "Late" : "On Time"}
                      </span>
                    </td>
                    <td className="wa-note">{r.note || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="wa-pagination">
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </section>
    </div>
  );
}