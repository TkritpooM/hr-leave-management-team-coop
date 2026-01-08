import axios from "axios";

// ✅ Root axios instance (NO /api prefix)
// Use this when backend routes are mounted at "/" instead of "/api".
// Examples: /notifications/hr, /notifications/my, /profile-requests

const rootURL = (import.meta.env.VITE_API_ROOT || "http://localhost:8000").replace(/\/$/, "");

const axiosRoot = axios.create({
  baseURL: rootURL,
  timeout: 20000,
});

// Attach token automatically (same behavior as axiosClient)
axiosRoot.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally (mirror axiosClient)
axiosRoot.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.dispatchEvent(new Event("auth:logout"));
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default axiosRoot;
export { rootURL };
