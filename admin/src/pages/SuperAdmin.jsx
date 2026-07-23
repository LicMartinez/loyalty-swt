import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Users, Edit2, XCircle, CheckCircle } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const getAuthHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` }
})

const SuperAdmin = ({ onSelectTenant }) => {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTenant, setEditTenant] = useState(null)
  const [form, setForm] = useState({ name: '', slug: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchTenants = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/super/tenants`, getAuthHeaders())
      setTenants(res.data)
    } catch (err) {
      setError('Error al cargar tenants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchTenants() }, [])

  const generateSlug = (name) => {
    return name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const handleNameChange = (value) => {
    setForm(prev => ({
      ...prev,
      name: value,
      slug: editTenant ? prev.slug : generateSlug(value)
    }))
  }

  const openCreateModal = () => {
    setEditTenant(null)
    setForm({ name: '', slug: '' })
    setError('')
    setShowModal(true)
  }

  const openEditModal = (tenant) => {
    setEditTenant(tenant)
    setForm({ name: tenant.name, slug: tenant.slug })
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      if (editTenant) {
        await axios.put(
          `${API_BASE}/api/super/tenants/${editTenant.id}`,
          { name: form.name },
          getAuthHeaders()
        )
      } else {
        await axios.post(
          `${API_BASE}/api/super/tenants`,
          { name: form.name, slug: form.slug },
          getAuthHeaders()
        )
      }
      setShowModal(false)
      fetchTenants()
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (tenant) => {
    try {
      await axios.put(
        `${API_BASE}/api/super/tenants/${tenant.id}`,
        { name: tenant.name, is_active: !tenant.is_active },
        getAuthHeaders()
      )
      fetchTenants()
    } catch (err) {
      setError('Error al cambiar estado')
    }
  }

  if (loading) {
    return <p>Cargando...</p>
  }

  return (
    <div>
      <div className="page-header">
        <h2 className="page-title">Marcas / Tenants</h2>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={18} style={{ marginRight: 6 }} />
          Nueva Marca
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
                <th>Nombre</th>
                <th>Slug</th>
                <th>Estado</th>
                <th>Fecha creación</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <tr key={tenant.id}>
                  <td><strong>{tenant.name}</strong></td>
                  <td><code>{tenant.slug}</code></td>
                  <td>
                    <span className={`badge ${tenant.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {tenant.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{new Date(tenant.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        onClick={() => onSelectTenant(tenant)}
                      >
                        <Users size={14} style={{ marginRight: 4 }} />
                        Usuarios
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        onClick={() => openEditModal(tenant)}
                      >
                        <Edit2 size={14} style={{ marginRight: 4 }} />
                        Editar
                      </button>
                      <button
                        className={`btn ${tenant.is_active ? 'btn-danger' : 'btn-primary'}`}
                        style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        onClick={() => toggleActive(tenant)}
                      >
                        {tenant.is_active ? (
                          <><XCircle size={14} style={{ marginRight: 4 }} />Desactivar</>
                        ) : (
                          <><CheckCircle size={14} style={{ marginRight: 4 }} />Activar</>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted, #6b7280)' }}>
                    No hay marcas registradas
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
            <h3 style={{ marginBottom: 16 }}>
              {editTenant ? 'Editar Marca' : 'Nueva Marca'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="Ej: Panem Bakery"
                  required
                />
              </div>
              {!editTenant && (
                <div className="form-group">
                  <label className="form-label">Slug</label>
                  <input
                    type="text"
                    className="form-input"
                    value={form.slug}
                    onChange={e => setForm(prev => ({ ...prev, slug: e.target.value }))}
                    placeholder="panem-bakery"
                    required
                    pattern="[a-z0-9\-]+"
                    title="Solo letras minúsculas, números y guiones"
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                    Se usa como identificador único. Solo minúsculas, números y guiones.
                  </span>
                </div>
              )}
              {error && (
                <p style={{ color: 'var(--danger, #ef4444)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>
              )}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Guardando...' : (editTenant ? 'Guardar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default SuperAdmin
