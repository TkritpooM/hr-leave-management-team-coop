import React from "react";
import { useTranslation } from "react-i18next";

export default function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
}) {
  const { t } = useTranslation();

  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  return (
    <div
      className="pager"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "center",
        marginTop: 12,
        flexWrap: "wrap",
      }}
    >
      <div className="pager-label" style={{ fontSize: 12, opacity: 0.8 }}>
        {t("components.pagination.range", { start, end, total })}
      </div>

      <div className="pager-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="pager-select"
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(parseInt(e.target.value, 10))}
          aria-label={t("components.pagination.pageSizeAria")}
          title={t("components.pagination.pageSizeTitle")}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {t("components.pagination.perPage", { n })}
            </option>
          ))}
        </select>

        <button className="btn small outline" onClick={() => onPageChange?.(1)} disabled={safePage === 1}>
          {t("components.pagination.first")}
        </button>
        <button className="btn small outline" onClick={() => onPageChange?.(safePage - 1)} disabled={safePage === 1}>
          {t("components.pagination.prev")}
        </button>

        <span style={{ fontWeight: 800 }}>
          {t("components.pagination.pageXofY", { page: safePage, totalPages })}
        </span>

        <button className="btn small outline" onClick={() => onPageChange?.(safePage + 1)} disabled={safePage === totalPages}>
          {t("components.pagination.next")}
        </button>
        <button className="btn small outline" onClick={() => onPageChange?.(totalPages)} disabled={safePage === totalPages}>
          {t("components.pagination.last")}
        </button>
      </div>
    </div>
  );
}
