import Swal from "sweetalert2";

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

export const alertConfirm = async (title, html, confirmText = "ยืนยัน") => {
  const res = await Swal.fire({
    ...baseConfig,
    icon: "question",
    title,
    html,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: "ยกเลิก",
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
    confirmButtonText: "ปิด",
  });
};

export const alertInfo = (title, text = "") => {
  return Swal.fire({
    ...baseConfig,
    icon: "info",
    title,
    text,
    confirmButtonText: "ตกลง",
  });
};
