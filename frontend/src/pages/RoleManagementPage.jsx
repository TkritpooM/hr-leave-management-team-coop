import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import axiosClient from "../api/axiosClient";
import { alertSuccess, alertError, alertConfirm } from "../utils/sweetAlert";
import {
    FiPlus, FiTrash2, FiEdit, FiSearch
} from "react-icons/fi";
import DataTable from "react-data-table-component";


export default function RoleManagementPage() {
    const { t } = useTranslation();
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filterText, setFilterText] = useState("");

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [form, setForm] = useState({ roleName: "" });

    const fetchRoles = async () => {
        try {
            setLoading(true);
            const res = await axiosClient.get("/admin/roles");
            if (res.data.success) {
                setRoles(res.data.roles);
            }
        } catch (err) {
            console.error(err);
            alertError(t("common.error"), t("alerts.loadFailed") || "Failed to load roles.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    // Filter
    const filteredRoles = useMemo(() => {
        return roles.filter(r =>
            r.roleName.toLowerCase().includes(filterText.toLowerCase())
        );
    }, [roles, filterText]);

    // Actions
    const handleEdit = (role) => {
        setEditingRole(role);
        setForm({ roleName: role.roleName });
        setModalOpen(true);
    };

    const handleDelete = async (role) => {
        const isConfirmed = await alertConfirm(
            t("roles.deleteConfirmTitle", "Delete Role?"),
            t("roles.deleteConfirmText", `Are you sure you want to delete role "${role.roleName}"?`)
        );
        if (!isConfirmed) return;

        try {
            await axiosClient.delete(`/admin/roles/${role.roleId}`);
            alertSuccess(t("common.success"), t("roles.deleted", "Role deleted."));
            fetchRoles();
        } catch (err) {
            console.error(err);
            const msg = err.response?.data?.message || err.message;
            alertError(t("common.error"), msg);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.roleName.trim()) return;

        try {
            if (editingRole) {
                // Update
                await axiosClient.put(`/admin/roles/${editingRole.roleId}`, form);
                alertSuccess(t("common.success"), t("roles.updated", "Role updated."));
            } else {
                // Create
                await axiosClient.post("/admin/roles", form);
                alertSuccess(t("common.success"), t("roles.created", "Role created."));
            }
            setModalOpen(false);
            setEditingRole(null);
            setForm({ roleName: "" });
            fetchRoles();
        } catch (err) {
            console.error(err);
            const msg = err.response?.data?.message || err.message;
            alertError(t("common.error"), msg);
        }
    };

    // Columns
    const columns = [
        {
            name: "ID",
            selector: row => row.roleId,
            sortable: true,
            width: "80px",
        },
        {
            name: t("roles.roleName", "Role Name"),
            selector: row => row.roleName,
            sortable: true,
        },
        {
            name: t("common.actions", "Actions"),
            cell: (row) => (
                <div className="table-actions">
                    <button
                        className="btn-icon warning"
                        onClick={() => handleEdit(row)}
                        title={t("common.edit")}
                    >
                        <FiEdit />
                    </button>

                    {/* Prevent deleting system roles */}
                    {!['Admin', 'HR', 'Worker'].includes(row.roleName) && (
                        <button
                            className="btn-icon danger"
                            onClick={() => handleDelete(row)}
                            title={t("common.delete")}
                        >
                            <FiTrash2 />
                        </button>
                    )}
                </div>
            ),
            ignoreRowClick: true,
        },
    ];

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {t("sidebar.items.rolesManagement", "Roles Management")}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                        {t("roles.subtitle", "Manage user roles and permissions.")}
                    </p>
                </div>
                <button
                    className="btn-primary flex items-center gap-2"
                    onClick={() => {
                        setEditingRole(null);
                        setForm({ roleName: "" });
                        setModalOpen(true);
                    }}
                >
                    <FiPlus />
                    {t("roles.addNew", "Add Role")}
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                {/* Search */}
                <div className="mb-4 flex items-center bg-gray-100 dark:bg-gray-700 rounded-md px-3 py-2 w-full md:w-64">
                    <FiSearch className="text-gray-400 mr-2" />
                    <input
                        type="text"
                        className="bg-transparent border-none outline-none text-sm w-full dark:text-white"
                        placeholder={t("common.search", "Search...")}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                </div>

                <DataTable
                    columns={columns}
                    data={filteredRoles}
                    progressPending={loading}
                    pagination
                    highlightOnHover
                    responsive
                    theme={localStorage.getItem("theme") === "dark" ? "dark" : "default"}
                />
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6 animate-fade-in-up">
                        <h2 className="text-xl font-bold mb-4 dark:text-white">
                            {editingRole ? t("roles.editRole", "Edit Role") : t("roles.newRole", "New Role")}
                        </h2>
                        <form onSubmit={handleSubmit}>
                            <label className="block mb-4">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {t("roles.roleName", "Role Name")}
                                </span>
                                <input
                                    type="text"
                                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                    value={form.roleName}
                                    onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                                    required
                                />
                            </label>

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                                    onClick={() => setModalOpen(false)}
                                >
                                    {t("common.cancel", "Cancel")}
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                                >
                                    {t("common.save", "Save")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
