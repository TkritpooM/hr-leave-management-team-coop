import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import axiosClient from "../api/axiosClient";
import { alertSuccess, alertError, alertConfirm } from "../utils/sweetAlert";
import {
    FiPlus, FiTrash2, FiEdit, FiSearch
} from "react-icons/fi";
import DataTable from "react-data-table-component";

import "./RoleManagementPage.css";

export default function RoleManagementPage() {
    const { t } = useTranslation();
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]); // New
    const [loading, setLoading] = useState(false);
    const [filterText, setFilterText] = useState("");

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [form, setForm] = useState({ roleName: "" });
    const [selectedPermissionIds, setSelectedPermissionIds] = useState([]); // New

    const fetchData = async () => {
        try {
            setLoading(true);
            const [rolesRes, permsRes] = await Promise.all([
                axiosClient.get("/admin/roles"),
                axiosClient.get("/admin/permissions")
            ]);

            if (rolesRes.data.success) {
                setRoles(rolesRes.data.roles);
            }
            if (permsRes.data.success) {
                setPermissions(permsRes.data.permissions);
            }
        } catch (err) {
            console.error(err);
            alertError(t("common.error"), t("alerts.loadFailed") || "Failed to load data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
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
        // Map permission objects to IDs
        const ids = (role.permissions || []).map(p => p.permissionId);
        setSelectedPermissionIds(ids);
        setModalOpen(true);
    };

    const handleDelete = async (role) => {
        const isConfirmed = await alertConfirm(
            t("pages.roles.deleteConfirmTitle", "Delete Role?"),
            t("pages.roles.deleteConfirmText", { name: role.roleName })
        );
        if (!isConfirmed) return;

        try {
            await axiosClient.delete(`/admin/roles/${role.roleId}`);
            alertSuccess(t("common.success"), t("pages.roles.deleted", "Role deleted."));
            fetchData();
        } catch (err) {
            console.error(err);
            const msg = err.response?.data?.message || err.message;
            alertError(t("common.error"), msg);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.roleName.trim()) return;

        const payload = { ...form, permissionIds: selectedPermissionIds };

        try {
            if (editingRole) {
                // Update
                await axiosClient.put(`/admin/roles/${editingRole.roleId}`, payload);
                alertSuccess(t("common.success"), t("pages.roles.updated", "Role updated."));
            } else {
                // Create
                await axiosClient.post("/admin/roles", payload);
                alertSuccess(t("common.success"), t("pages.roles.created", "Role created."));
            }
            setModalOpen(false);
            setEditingRole(null);
            setForm({ roleName: "" });
            setSelectedPermissionIds([]);
            fetchData();
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
            name: t("pages.roles.roleName", "Role Name"),
            selector: row => row.roleName,
            sortable: true,
        },
        {
            name: t("common.actions", "Actions"),
            cell: (row) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="role-action-btn edit"
                        onClick={() => handleEdit(row)}
                        title={t("common.edit")}
                    >
                        <FiEdit />
                    </button>

                    {/* Prevent deleting system roles */}
                    {!['Admin', 'HR', 'Worker'].includes(row.roleName) && (
                        <button
                            className="role-action-btn delete"
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

    const customStyles = {
        headRow: {
            style: {
                border: 'none',
            },
        },
        headCells: {
            style: {
                color: '#94a3b8',
                fontSize: '12px',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
            },
        },
        rows: {
            style: {
                minHeight: '60px',
                borderBottom: '1px solid #f1f5f9',
            },
            highlightOnHoverStyle: {
                backgroundColor: '#f8fafc',
                borderBottomColor: '#f1f5f9',
                borderRadius: '12px',
                outline: '1px solid #ffffff',
            },
        },
        pagination: {
            style: {
                border: 'none',
            },
        },
    };

    return (
        <div className="page-card role-mgmt">
            <div className="role-head">
                <div>
                    <h1 className="role-title">
                        {t("pages.roles.title", "Roles Management")}
                    </h1>
                    <p className="role-sub">
                        {t("pages.roles.subtitle", "Manage user roles and permissions.")}
                    </p>
                </div>
            </div>

            <div className="role-tools">
                {/* Search */}
                <div className="role-search-box">
                    <FiSearch className="role-search-icon" />
                    <input
                        type="text"
                        className="role-search-input"
                        placeholder={t("common.search", "Search...")}
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                    />
                </div>

                <button
                    className="role-btn role-btn-primary"
                    onClick={() => {
                        setEditingRole(null);
                        setForm({ roleName: "" });
                        setSelectedPermissionIds([]);
                        setModalOpen(true);
                    }}
                >
                    <FiPlus />
                    {t("pages.roles.addNew", "Add Role")}
                </button>
            </div>

            <div className="role-table-card">
                <DataTable
                    columns={columns}
                    data={filteredRoles}
                    progressPending={loading}
                    pagination
                    highlightOnHover
                    responsive
                    customStyles={customStyles}
                    theme={localStorage.getItem("theme") === "dark" ? "dark" : "default"}
                />
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="role-modal-overlay" onClick={() => setModalOpen(false)}>
                    <div className="role-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="role-modal-header">
                            <h2 className="role-modal-title">
                                {editingRole ? t("pages.roles.editRole", "Edit Role") : t("pages.roles.newRole", "New Role")}
                            </h2>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="role-modal-body">
                                <div className="role-form-group">
                                    <span className="role-label">
                                        {t("pages.roles.roleName", "Role Name")}
                                    </span>
                                    <input
                                        type="text"
                                        className="role-input"
                                        value={form.roleName}
                                        onChange={(e) => setForm({ ...form, roleName: e.target.value })}
                                        required
                                        placeholder="e.g. Supervisor"
                                        disabled={['Admin', 'HR', 'Worker'].includes(form.roleName)} // Lock system role names
                                    />
                                </div>

                                <div className="role-form-group">
                                    <span className="role-label">
                                        {t("pages.roles.permissions", "Permissions")}
                                    </span>
                                    <div className="role-perm-grid">
                                        {permissions.map(perm => (
                                            <label key={perm.permissionId} className="role-perm-item">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPermissionIds.includes(perm.permissionId)}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setSelectedPermissionIds(prev =>
                                                            checked
                                                                ? [...prev, perm.permissionId]
                                                                : prev.filter(id => id !== perm.permissionId)
                                                        );
                                                    }}
                                                />
                                                <span title={perm.description}>{perm.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="role-modal-footer">
                                <button
                                    type="button"
                                    className="role-btn role-btn-secondary"
                                    onClick={() => setModalOpen(false)}
                                >
                                    {t("common.cancel", "Cancel")}
                                </button>
                                <button
                                    type="submit"
                                    className="role-btn role-btn-primary"
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
