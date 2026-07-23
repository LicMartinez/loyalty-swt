import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { ArrowLeft, Plus, XCircle, RefreshCw, Pencil } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
})

const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pass = ''
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return pass
}

const SuperAdminUsers = ({ tenant, onBack }) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'admin' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editForm, setEditForm] = useState({ id: '', email: '', password: '' })
  const [editSaving, setEditSaving] = useState(false)

  const fetchUsers = async () => {
    try {
      const res = await axios.get(
        `${API_BASE}/api/super/tenants/${tenant.id}/users`,
        getAuthHeaders()
      )
      setUsers(res.data)
    } catch (err) {
      setError('Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [tenant.id])

  const openCreateModal = () => {
    setForm({ username: '', email: '', password: generatePassword(), role: 'admin' })
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      await axios.post(
        `${API_BASE}/api/super/tenants/${tenant.id}/users`,
        {
          username: form.username,
          email: form.email || undefined,
          password: form.password,
          role: form.role
        },
        getAuthHeaders()
      )
      setShowModal(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear usuario')
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = (user) => {
    setEditForm({ id: user.id, email: user.email || '', password: '' })
    setError('')
    setShowEditModal(true)
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditSaving(true)
    setError('')

    try {
      const payload = {}
      if (editForm.email) payload.email = editForm.email
      if (editForm.password) payload.password = editForm.password

      await axios.put(
        `${API_BASE}/api/super/users/${editForm.id}`,
        payload,
        getAuthHeaders()
      )
      setShowEditModal(false)
      fetchUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar usuario')
    } finally {
      setEditSaving(false)
    }
  }

  const deactivateUser = async (userId) => {
    if (!confirm('¿Desactivar este usuario?')) return
    try {
      await axios.delete(
        `${API_BASE}/api/super/users/${userId}`,
        getAuthHeaders()
      )
      fetchUsers()
    } catch (err) {
      setError('Error al desactivar usuario')
    }
  }

  if (loading) {
    return <p>Cargando usuarios...</p>
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <h2 className="page-title" style={{ margin: 0 }}>
            Usuarios de {tenant.name}
          </h2>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={18} style={{ marginRight: 6 }} />
          Nuevo Usuario
        </button>
      </div>

      {error && !showModal && (
        <p style={{ color: 'var(--danger, #ef4444)', marginBottom: 16 }}>{error}</p>
      )}

      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Último login</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td><strong>{user.username}</strong></td>
                  <td>{user.email || '—'}</td>
                  <td>
                    <span className="badge">{user.role}</span>
                  </td>
                  <td>
                    <span className={`badge ${user.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {user.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    {user.last_login
                      ? new Date(user.last_login).toLocaleString()
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        onClick={() => openEditModal(user)}
                      >
                        <Pencil size={14} style={{ marginRight: 4 }} />
                        Editar
                      </button>
                      {user.is_active && (
                        <button
                          className="btn btn-danger"
                          style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                          onClick={() => deactivateUser(user.id)}
                        >
                          <XCircle size={14} style={{ marginRight: 4 }} />
                          Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted, #6b7280)' }}>
                    No hay usuarios para este tenant
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Nuevo Usuario</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.username}
                  onChange={e => setForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="admin"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="admin@ejemplo.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Password</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    value={form.password}
                    onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setForm(prev => ({ ...prev, password: generatePassword() }))}
                    title="Generar contraseña"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Rol</label>
                <select
                  className="form-input"
                  value={form.role}
                  onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>
              </div>
              {error && (
                <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Editar Usuario</h3>
            <form onSubmit={handleEditSubmit}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={editForm.email}
                  onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="nuevo@email.com"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nueva Contraseña (dejar vacío para no cambiar)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    className="form-input"
                    value={editForm.password}
                    onChange={e => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Dejar vacío para mantener"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditForm(prev => ({ ...prev, password: generatePassword() }))}
                    title="Generar contraseña"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              </div>
              {error && (
                <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  {editSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default SuperAdminUsers
