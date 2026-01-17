import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import moment from "moment";
import { FiChevronLeft, FiChevronRight, FiTrash2 } from "react-icons/fi";
import { alertInput } from "../utils/sweetAlert";
import "../pages/HRAttendancePolicy.css"; // Ensure styles are applied

export default function HolidayManagerModal({ isOpen, onClose, initialHolidays, onSave }) {
    const { t } = useTranslation();
    const [viewDate, setViewDate] = useState(moment());
    const [holidays, setHolidays] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setHolidays([...(initialHolidays || [])]);
            setViewDate(moment());
        }
    }, [isOpen, initialHolidays]);

    const calendarDays = useMemo(() => {
        const start = viewDate.clone().startOf("month").startOf("week");
        const end = viewDate.clone().endOf("month").endOf("week");
        const days = [];
        let day = start.clone();

        // Ensure we have a fixed grid (6 weeks) to prevent jumping
        const limit = start.clone().add(42, "days");

        while (day.isBefore(limit)) {
            days.push(day.clone());
            day.add(1, "day");
        }
        return days;
    }, [viewDate]);

    const toggleDay = async (d) => {
        const dateStr = d.format("YYYY-MM-DD");
        const existingIndex = holidays.findIndex((h) => h.split("|")[0] === dateStr);

        if (existingIndex >= 0) {
            const currentDesc = holidays[existingIndex].split("|")[1] || "";
            const val = await alertInput(
                t("pages.attendancePolicy.editHoliday"),
                t("pages.attendancePolicy.holidayDesc"),
                currentDesc
            );

            if (val === undefined) return;

            const newEntry = `${dateStr}|${val}`;
            setHolidays((prev) => {
                const copy = [...prev];
                copy[existingIndex] = newEntry;
                return copy;
            });
        } else {
            // Add immediately with empty description
            setHolidays((prev) => [...prev, `${dateStr}|`]);
        }
    };

    const removeHoliday = (e, dateStr) => {
        e.stopPropagation();
        setHolidays((prev) => prev.filter((h) => h.split("|")[0] !== dateStr));
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" style={{ maxWidth: "600px", width: "95%" }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-head-row">
                    <h3>{t("pages.attendancePolicy.manageHolidays")}</h3>
                    <button className="close-x" onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div
                    className="calendar-top"
                    style={{ marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                    <button className="nav-btn" onClick={() => setViewDate((d) => d.clone().subtract(1, "month"))}>
                        <FiChevronLeft />
                    </button>
                    <h4 style={{ margin: 0 }}>{viewDate.format("MMMM YYYY")}</h4>
                    <button className="nav-btn" onClick={() => setViewDate((d) => d.clone().add(1, "month"))}>
                        <FiChevronRight />
                    </button>
                </div>

                <div
                    className="calendar-grid"
                    style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "5px", marginBottom: "20px" }}
                >
                    {[
                        t("common.daysShort.sun"),
                        t("common.daysShort.mon"),
                        t("common.daysShort.tue"),
                        t("common.daysShort.wed"),
                        t("common.daysShort.thu"),
                        t("common.daysShort.fri"),
                        t("common.daysShort.sat"),
                    ].map((d) => (
                        <div
                            key={d}
                            style={{ textAlign: "center", fontSize: "0.8rem", color: "#64748b", fontWeight: "600", padding: "5px" }}
                        >
                            {d}
                        </div>
                    ))}

                    {calendarDays.map((d) => {
                        const dateStr = d.format("YYYY-MM-DD");
                        const entry = holidays.find((h) => h.split("|")[0] === dateStr);
                        const isCurrentMonth = d.month() === viewDate.month();

                        return (
                            <div
                                key={dateStr}
                                onClick={() => toggleDay(d)}
                                style={{
                                    height: "60px",
                                    border: "1px solid #e2e8f0",
                                    borderRadius: "8px",
                                    background: entry ? "#eff6ff" : isCurrentMonth ? "#fff" : "#f8fafc",
                                    borderColor: entry ? "#3b82f6" : "#e2e8f0",
                                    cursor: "pointer",
                                    padding: "4px",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "space-between",
                                    opacity: isCurrentMonth ? 1 : 0.5,
                                    overflow: "hidden",
                                }}
                            >
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span
                                        style={{
                                            fontSize: "0.8rem",
                                            fontWeight: entry ? "bold" : "normal",
                                            color: entry ? "#2563eb" : "#1e293b",
                                        }}
                                    >
                                        {d.date()}
                                    </span>
                                    {entry && <FiTrash2 size={12} color="#ef4444" onClick={(e) => removeHoliday(e, dateStr)} />}
                                </div>
                                {entry && (
                                    <div
                                        style={{
                                            fontSize: "0.65rem",
                                            color: "#3b82f6",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            width: "100%",
                                        }}
                                    >
                                        {entry.split("|")[1]}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div
                    style={{
                        padding: "10px",
                        background: "#f8fafc",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        color: "#64748b",
                        marginBottom: "20px",
                    }}
                >
                    {t("pages.attendancePolicy.clickDayHint")}
                </div>

                <div className="modal-actions">
                    <button className="btn outline" onClick={onClose}>
                        {t("common.cancel")}
                    </button>
                    <button className="btn primary" onClick={() => onSave(holidays)}>
                        {t("common.save")}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
