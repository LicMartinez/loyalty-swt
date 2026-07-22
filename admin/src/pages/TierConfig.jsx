import React, { useState, useEffect } from 'react'
import { Layers, Plus, Edit2, Trash2, GripVertical, AlertTriangle } from 'lucide-react'
import api from '../api'

const emptyForm = { name: '', points_per_visit: 1, benefit_description: '' }

const TierConfig = () => {
  const [tiers, setTiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTier, setEditingTier] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)

  useEffect(() => { loadTiers() }, [])

  const loadTiers = async () => {
    try {
      const res = await api.get('/tiers')
      setTiers(res.data.sort((a, b) => a.sort_order - b.sort_order))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Validation
  const validate = () => {
    const errs = {}
    if (!form.name.trim()) {
      errs.name = 'El nombre es obligatorio'
    } else if (form.name.trim().length > 50) {
      errs.name = 'Máximo 50 caracteres'
    }
    if (!form.points_per_visit || form.points_per_visit < 1 || form.points_per_visit > 1000) {
      errs.points_per_visit = 'Debe ser entre 1 y 1000'
    }
    if (form.benefit_description && form.benefit_description.length > 200) {
      errs.benefit_description = 'Máximo 200 caracteres'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const openNew = () => {
    setEditingTier(null)
    setForm(emptyForm)
    setErrors({})
    setServerError('')
    setShowModal(true)
  }

  const openEdit = (tier) => {
    setEditingTier(tier)
    setForm({
      name: tier.name,
      points_per_visit: tier.points_per_visit,
      benefit_description: tier.benefit_description || ''
    })
    setErrors({})
    setServerError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    setServerError('')

    const payload = {
      name: form.name.trim(),
      points_per_visit: parseInt(form.points_per_visit),
      benefit_description: form.benefit_description.trim() || null,
      sort_order: editingTier ? editingTier.sort_order : tiers.length
    }

    try {
      if (editingTier) {
        await api.put(`/tiers/${editingTier.id}`, payload)
      } else {
        await api.post('/tiers', payload)
      }
      setShowModal(false)
      loadTiers()
    } catch (err) {
      const msg = err.response?.data?.error || 'Error del servidor'
      setServerError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (tier) => {
    setDeleteError(null)
    if (!confirm(`¿Eliminar el nivel "${tier.name}"?`)) return

    try {
      await api.delete(`/tiers/${tier.id}`)
      loadTiers()
    } catch (err) {
      const data = err.response?.data
      if (data?.customersCount) {
        setDeleteError({ tierId: tier.id, message: data.error, count: data.customersCount })
      } else {
        alert(data?.error || 'Error al eliminar')
      }
    }
  }

  // Drag and drop reorder
  const handleDragStart = (e, index) => {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null)
      return
    }

    const reordered = [...tiers]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(dropIndex, 0, moved)

    // Update sort_order for each tier
    const updated = reordered.map((t, i) => ({ ...t, sort_order: i }))
    setTiers(updated)
    setDragIndex(null)

    // Persist changes for tiers whose sort_order changed
    try {
      const promises = updated
        .filter((t, i) => t.sort_order !== tiers.find(orig => orig.id === t.id)?.sort_order)
        .map(t => api.put(`/tiers/${t.id}`, {
          name: t.name,
          points_per_visit: t.points_per_visit,
          benefit_description: t.benefit_description,
          sort_order: t.sort_order
        }))
      await Promise.all(promises)
    } catch (err) {
      console.error('Error updating order:', err)
      loadTiers() // reload on failure
    }
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Niveles de Lealtad</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Nuevo Nivel
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Nombre</th>
                <th>Puntos por Visita</th>
                <th>Beneficio</th>
                <th>Orden</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Cargando...</td></tr>
              ) : tiers.length === 0 ? (
                <tr><td colSpan="6" className="text-muted" style={{ textAlign: 'center', padding: 20 }}>No hay niveles configurados</td></tr>
              ) : (
                tiers.map((tier, index) => (
                  <tr
                    key={tier.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    style={{
                      opacity: dragIndex === index ? 0.5 : 1,
                      cursor: 'grab'
                    }}
                  >
                    <td><GripVertical size={16} className="text-muted" /></td>
                    <td>
                      <strong>{tier.name}</strong>
                      {tier.is_default && <span className="badge badge-primary" style={{ marginLeft: 8 }}>Default</span>}
                    </td>
                    <td><span className="badge badge-primary">{tier.points_per_visit} pts</span></td>
                    <td className="text-muted">{tier.benefit_description || '—'}</td>
                    <td>{tier.sort_order}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(tier)}><Edit2 size={14} /></button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(tier)}><Trash2 size={14} /></button>
                      </div>
                      {deleteError?.tierId === tier.id && (
                        <div className="flex items-center gap-1" style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--danger)' }}>
                          <AlertTriangle size={12} />
                          <span>{deleteError.message}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{editingTier ? 'Editar Nivel' : 'Nuevo Nivel'}</h3>
            <form onSubmit={handleSubmit}>
              {serverError && (
                <div style={{ padding: '8px 12px', marginBottom: 12, background: 'var(--danger-bg, #fef2f2)', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', fontSize: '0.85rem' }}>
                  {serverError}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input
                  type="text"
                  className={`form-input ${errors.name ? 'input-error' : ''}`}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  maxLength={50}
                  placeholder="Ej: Oro, Plata, Bronce"
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Puntos por Visita</label>
                <input
                  type="number"
                  className={`form-input ${errors.points_per_visit ? 'input-error' : ''}`}
                  value={form.points_per_visit}
                  onChange={e => setForm({ ...form, points_per_visit: parseInt(e.target.value) || '' })}
                  min={1}
                  max={1000}
                />
                {errors.points_per_visit && <span className="field-error">{errors.points_per_visit}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Descripción del Beneficio <span className="text-muted">(opcional)</span></label>
                <textarea
                  className={`form-input ${errors.benefit_description ? 'input-error' : ''}`}
                  rows="2"
                  value={form.benefit_description}
                  onChange={e => setForm({ ...form, benefit_description: e.target.value })}
                  maxLength={200}
                  placeholder="Ej: 10% descuento en bebidas"
                />
                {errors.benefit_description && <span className="field-error">{errors.benefit_description}</span>}
                <span className="text-muted" style={{ fontSize: '0.75rem' }}>{form.benefit_description.length}/200</span>
              </div>
              <div className="flex gap-2" style={{ marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Guardando...' : (editingTier ? 'Guardar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TierConfig
