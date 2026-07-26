import { API_BASE_URL } from "../../api/http-client.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function resolveImage(reference) {
  if (!reference || String(reference).startsWith("asset://")) return "";
  try {
    return new URL(reference, API_BASE_URL).toString();
  } catch {
    return "";
  }
}

export function imageOrPlaceholder(url, alt = "") {
  const safe = resolveImage(url);
  return safe
    ? `<img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" />`
    : `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 35 18 24l7 7 6-8 9 12M11 10h26v28H11z"/><circle cx="18" cy="18" r="3"/></svg>`;
}

export function formatMoney(value) {
  const amount = Number(value || 0);
  return `¥${amount.toLocaleString("zh-CN")}`;
}
