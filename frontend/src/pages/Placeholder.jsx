import React from "react";
import { useTranslation } from "react-i18next";

export default function Placeholder({ title }) {
  const { t } = useTranslation();

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p style={{ marginTop: 8, color: "#4b5563" }}>{t("common.comingSoon")}</p>
    </div>
  );
}