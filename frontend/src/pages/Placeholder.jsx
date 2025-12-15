import React from "react";

export default function Placeholder({ title }) {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p style={{ marginTop: 8, color: "#4b5563" }}>Coming soon...</p>
    </div>
  );
}
