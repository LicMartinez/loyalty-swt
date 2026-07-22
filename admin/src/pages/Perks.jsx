import React, { useState, useEffect } from 'react'
import { Gift, Plus, Edit2, Trash2, Printer } from 'lucide-react'
import api from '../api'

const Perks = () => {
  const [perks, setPerks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editingPerk, setEditingPerk] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', cost_points: 0, is_active: true })

  useEffect(() => { loadPerks() }, [])

  const loadPerks = async () => {
    try {
      const res = await api.get('/perks')
      setPerks(res.data)
    } catch (err) { console.error(err) }
  }

  const openNew = () => {
    setEditingPerk(null)
    setForm({ name: '', description: '', cost_points: 0, is_active: true })
    setShowModal(true)
  }

  const openEdit = (perk) => {
    setEditingPerk(perk)
    setForm({ name: perk.name, description: perk.description || '', cost_points: perk.cost_points, is_active: perk.is_active })
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingPerk) {
        await api.put(`/perks/${editingPerk.id}`, form)
      } else {
        await api.post('/perks', form)
      }
      setShowModal(false)
      loadPerks()
    } catch (err) {
      alert(err.response?.data?.error || 'Error')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este beneficio?')) return
    try {
      await api.delete(`/perks/${id}`)
      loadPerks()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Premios y Beneficios</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Nuevo Premio
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Costo (pts)</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {perks.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td className="text-muted">{p.description || '—'}</td>
                  <td><span className="badge badge-primary">{p.cost_points} pts</span></td>
                  <td>
                    <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(p)}><Edit2 size={14} /></button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nota sobre impresión térmica */}
      <div className="card" style={{ borderColor: 'var(--warning)', borderWidth: 1 }}>
        <div className="flex items-center gap-2 mb-2">
          <Printer size={18} color="var(--warning)" />
          <strong style={{ color: 'var(--warning)' }}>Impresión Térmica</strong>
        </div>
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          Al redimir un beneficio desde el portal del staff, se generará automáticamente un ticket 
          para impresora térmica POS con los datos del canje. Configura la impresora en la sección de Configuración.
        </p>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{editingPerk ? 'Editar Premio' : 'Nuevo Premio'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input type="text" className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-input" rows="2" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Costo en Puntos</label>
                  <input type="number" className="form-input" min="0" value={form.cost_points} onChange={e => setForm({ ...form, cost_points: parseInt(e.target.value) || 0 })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-input" value={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}>
                    <option value="true">Activo</option>
                    <option value="false">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2" style={{ marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editingPerk ? 'Guardar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Perks

