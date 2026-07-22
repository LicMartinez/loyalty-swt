import React, { useState, useEffect } from 'react'
import { Megaphone, Plus, Edit2, Trash2 } from 'lucide-react'
import api from '../api'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const TYPES = { double_points: 'Puntos Dobles', bonus_points: 'Puntos Extra', free_perk: 'Beneficio Gratis' }

const Promotions = () => {
  const [promotions, setPromotions] = useState([])
  const [perks, setPerks] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    name: '', description: '', type: 'double_points', value: 0,
    perk_id: '', start_date: '', end_date: '', is_active: true, days_of_week: []
  })

  useEffect(() => {
    loadPromotions()
    loadPerks()
  }, [])

  const loadPromotions = async () => {
    try {
      const res = await api.get('/promotions')
      setPromotions(res.data)
    } catch (err) { console.error(err) }
  }

  const loadPerks = async () => {
    try {
      const res = await api.get('/perks')
      setPerks(res.data)
    } catch (err) { console.error(err) }
  }

  const openNew = () => {
    setEditing(null)
    setForm({ name: '', description: '', type: 'double_points', value: 0, perk_id: '', start_date: '', end_date: '', is_active: true, days_of_week: [] })
    setShowModal(true)
  }

  const openEdit = (promo) => {
    setEditing(promo)
    setForm({
      name: promo.name,
      description: promo.description || '',
      type: promo.type,
      value: promo.value || 0,
      perk_id: promo.perk_id || '',
      start_date: promo.start_date?.slice(0, 16) || '',
      end_date: promo.end_date?.slice(0, 16) || '',
      is_active: promo.is_active,
      days_of_week: promo.days_of_week || []
    })
    setShowModal(true)
  }

  const toggleDay = (day) => {
    setForm(f => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter(d => d !== day)
        : [...f.days_of_week, day]
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editing) {
        await api.put(`/promotions/${editing.id}`, form)
      } else {
        await api.post('/promotions', form)
      }
      setShowModal(false)
      loadPromotions()
    } catch (err) {
      alert(err.response?.data?.error || 'Error')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta promoción?')) return
    try {
      await api.delete(`/promotions/${id}`)
      loadPromotions()
    } catch (err) { alert('Error al eliminar') }
  }

  const isActive = (promo) => {
    const now = new Date()
    return promo.is_active && new Date(promo.start_date) <= now && new Date(promo.end_date) >= now
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Promociones</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Nueva Promoción
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Periodo</th>
                <th>Días</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {promotions.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong></td>
                  <td><span className="badge badge-primary">{TYPES[p.type]}</span></td>
                  <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {new Date(p.start_date).toLocaleDateString('es-MX')} — {new Date(p.end_date).toLocaleDateString('es-MX')}
                  </td>
                  <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                    {p.days_of_week?.length > 0 ? p.days_of_week.map(d => DAYS[d]).join(', ') : 'Todos'}
                  </td>
                  <td>
                    <span className={`badge ${isActive(p) ? 'badge-success' : 'badge-danger'}`}>
                      {isActive(p) ? 'Activa' : 'Inactiva'}
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
              {promotions.length === 0 && (
                <tr><td colSpan="6" className="text-muted text-center">No hay promociones configuradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">{editing ? 'Editar Promoción' : 'Nueva Promoción'}</h3>
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
                  <label className="form-label">Tipo</label>
                  <select className="form-input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="double_points">Puntos Dobles</option>
                    <option value="bonus_points">Puntos Extra</option>
                    <option value="free_perk">Beneficio Gratis</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{form.type === 'bonus_points' ? 'Puntos extra' : 'Valor'}</label>
                  <input type="number" className="form-input" min="0" value={form.value} onChange={e => setForm({ ...form, value: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
              {form.type === 'free_perk' && (
                <div className="form-group">
                  <label className="form-label">Beneficio a regalar</label>
                  <select className="form-input" value={form.perk_id} onChange={e => setForm({ ...form, perk_id: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    {perks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Fecha inicio</label>
                  <input type="datetime-local" className="form-input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha fin</label>
                  <input type="datetime-local" className="form-input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Días de la semana (vacío = todos)</label>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {DAYS.map((day, i) => (
                    <button key={i} type="button" className={`btn btn-sm ${form.days_of_week.includes(i) ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleDay(i)}>
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2" style={{ marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Guardar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Promotions

