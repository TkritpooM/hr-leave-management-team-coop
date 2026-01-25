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
                                    <div className="role-perm-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                                        {/* Left Column: Access/View */}
                                        <div className="role-perm-column">
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
                                                paddingBottom: '12px', borderBottom: '1px solid #e2e8f0'
                                            }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 0 2px #dbeafe' }}></div>
                                                <h4 style={{ margin: 0, fontSize: '15px', color: '#1e293b', fontWeight: 'bold', letterSpacing: '-0.01em' }}>
                                                    {t("pages.roles.accessGroup", "Access & View")}
                                                </h4>
                                            </div>
                                            <div className="role-perm-list" style={{
                                                display: 'flex', flexDirection: 'column', gap: '10px',
                                                maxHeight: '320px', overflowY: 'auto', paddingRight: '8px'
                                            }}>
                                                {permissions.filter(p => p.name.startsWith("access_")).map(perm => {
                                                    const isChecked = selectedPermissionIds.includes(perm.permissionId);
                                                    return (
                                                        <label key={perm.permissionId} className={`role-perm-card compact ${isChecked ? 'active' : ''}`} style={{
                                                            display: 'flex', alignItems: 'center', gap: '12px',
                                                            padding: '12px 16px', background: isChecked ? '#eff6ff' : '#f8fafc',
                                                            border: `1px solid ${isChecked ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                                                            boxShadow: isChecked ? '0 2px 4px rgba(59, 130, 246, 0.05)' : 'none'
                                                        }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={(e) => {
                                                                    const checked = e.target.checked;
                                                                    setSelectedPermissionIds(prev =>
                                                                        checked ? [...prev, perm.permissionId] : prev.filter(id => id !== perm.permissionId)
                                                                    );
                                                                }}
                                                                style={{ accentColor: '#3b82f6', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                                                            />
                                                            <span style={{ fontSize: '14px', color: isChecked ? '#1e40af' : '#475569', fontWeight: isChecked ? '600' : '500' }}>
                                                                {perm.description || perm.name}
                                                            </span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Right Column: Management */}
                                        <div className="role-perm-column">
                                            <div style={{
                                                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
                                                paddingBottom: '12px', borderBottom: '1px solid #e2e8f0'
                                            }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' }}></div>
                                                <h4 style={{ margin: 0, fontSize: '15px', color: '#1e293b', fontWeight: 'bold', letterSpacing: '-0.01em' }}>
                                                    {t("pages.roles.manageGroup", "Management")}
                                                </h4>
                                            </div>
                                            <div className="role-perm-list" style={{
                                                display: 'flex', flexDirection: 'column', gap: '10px',
                                                maxHeight: '320px', overflowY: 'auto', paddingRight: '8px'
                                            }}>
                                                {permissions.filter(p => !p.name.startsWith("access_")).length === 0 ? (
                                                    <div style={{ fontSize: '14px', color: '#94a3b8', fontStyle: 'italic', padding: '16px', placeSelf: 'center' }}>
                                                        {t("common.noData", "No management permissions available.")}
                                                    </div>
                                                ) : (
                                                    permissions.filter(p => !p.name.startsWith("access_")).map(perm => {
                                                        const isChecked = selectedPermissionIds.includes(perm.permissionId);
                                                        return (
                                                            <label key={perm.permissionId} className={`role-perm-card compact ${isChecked ? 'active' : ''}`} style={{
                                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                                padding: '12px 16px', background: isChecked ? '#fffbeb' : '#f8fafc',
                                                                border: `1px solid ${isChecked ? '#fde68a' : '#e2e8f0'}`, borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s',
                                                                boxShadow: isChecked ? '0 2px 4px rgba(245, 158, 11, 0.05)' : 'none'
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setSelectedPermissionIds(prev =>
                                                                            checked ? [...prev, perm.permissionId] : prev.filter(id => id !== perm.permissionId)
                                                                        );
                                                                    }}
                                                                    style={{ accentColor: '#f59e0b', width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                                                                />
                                                                <span style={{ fontSize: '14px', color: isChecked ? '#92400e' : '#475569', fontWeight: isChecked ? '600' : '500' }}>
                                                                    {perm.description || perm.name}
                                                                </span>
                                                            </label>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
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
