import Swal from "sweetalert2";
import i18n from "../i18n";

/**
 * Corporate SweetAlert2 wrapper (Red/Black theme)
 * - pill buttons
 * - consistent spacing/typography
 * - safe defaults (no heightAuto issues)
 */

const baseConfig = {
  heightAuto: false,
  backdrop: "rgba(17,24,39,0.55)",
  confirmButtonColor: "#16A34A",
  cancelButtonColor: "#111827",
  buttonsStyling: true,
  reverseButtons: true,
  focusCancel: true,
  customClass: {
    popup: "swal2-corp",
    title: "swal2-title-corp",
    htmlContainer: "swal2-html-corp",
    confirmButton: "swal2-confirm-corp",
    cancelButton: "swal2-cancel-corp",
  },
};

export const alertConfirm = async (title, html, confirmText) => {
  const res = await Swal.fire({
    ...baseConfig,
    icon: "question",
    title,
    html,
    showCancelButton: true,
    confirmButtonText: confirmText || i18n.t("common.confirm"),
    cancelButtonText: i18n.t("common.cancel"),
  });
  return res.isConfirmed;
};

export const alertSuccess = (title, text = "") => {
  return Swal.fire({
    ...baseConfig,
    icon: "success",
    title,
    text,
    timer: 1600,
    showConfirmButton: false,
  });
};

export const alertError = (title, text = "") => {
  return Swal.fire({
    ...baseConfig,
    icon: "error",
    title,
    text,
    confirmButtonText: i18n.t("common.close"),
  });
};

export const alertInfo = (title, text = "") => {
  return Swal.fire({
    ...baseConfig,
    icon: "info",
    title,
    text,
    confirmButtonText: i18n.t("common.ok"),
  });
};

export const alertInput = async (title, label, defaultValue = "") => {
  const { value: text } = await Swal.fire({
    ...baseConfig,
    title,
    input: 'text',
    inputLabel: label,
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonText: i18n.t("common.save"),
    cancelButtonText: i18n.t("common.cancel"),
    inputValidator: (value) => {
      if (!value) {
        return i18n.t("common.required", "Required");
      }
    }
  });
  return text;
};
