import React, { useState, useEffect } from 'react'
import { Printer, Plus, Edit2, Trash2, Play, Wifi, WifiOff } from 'lucide-react'
import api from '../api'

const emptyForm = { name: '', ip_address: '', port: 9100, is_active: true, print_on_checkin: false, print_on_redemption: true, print_on_cycle_reward: true }

const Printers = () => {
  const [printers, setPrinters] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingPrinter, setEditingPrinter] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [testing, setTesting] = useState(null)

  useEffect(() => { loadPrinters() }, [])

  const loadPrinters = async () => {
    try {
      const res = await api.get('/printers')
      setPrinters(res.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const openNew = () => {
    setEditingPrinter(null)
    setForm(emptyForm)
    setServerError('')
    setShowModal(true)
  }

  const openEdit = (printer) => {
    setEditingPrinter(printer)
    setForm({
      name: printer.name,
      ip_address: printer.ip_address,
      port: printer.port,
      is_active: printer.is_active,
      print_on_checkin: printer.print_on_checkin,
      print_on_redemption: printer.print_on_redemption,
      print_on_cycle_reward: printer.print_on_cycle_reward
    })
    setServerError('')
    setShowModal(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.ip_address.trim()) {
      setServerError('Nombre e IP son requeridos')
      return
    }
    setSubmitting(true)
    setServerError('')
    try {
      if (editingPrinter) {
        await api.put(`/printers/${editingPrinter.id}`, form)
      } else {
        await api.post('/printers', form)
      }
      setShowModal(false)
      loadPrinters()
    } catch (err) {
      setServerError(err.response?.data?.error || 'Error del servidor')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (printer) => {
    if (!confirm(`¿Eliminar la impresora "${printer.name}"?`)) return
    try {
      await api.delete(`/printers/${printer.id}`)
      loadPrinters()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar')
    }
  }

  const handleTest = async (printer) => {
    setTesting(printer.id)
    try {
      await api.post(`/printers/${printer.id}/test`)
      alert(`✓ Ticket de prueba enviado a "${printer.name}"`)
    } catch (err) {
      alert(`✗ Error: ${err.response?.data?.error || 'No se pudo conectar'}`)
    } finally {
      setTesting(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Impresoras</h1>
        <button className="btn btn-primary" onClick={openNew}>
          <Plus size={16} /> Agregar Impresora
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>IP : Puerto</th>
                <th>Estado</th>
                <th>Imprime en</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Cargando...</td></tr>
              ) : printers.length === 0 ? (
                <tr><td colSpan="5" className="text-muted" style={{ textAlign: 'center', padding: 20 }}>No hay impresoras configuradas. El ticket se imprimirá desde el navegador del staff.</td></tr>
              ) : (
                printers.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    <td className="text-muted">{p.ip_address}:{p.port}</td>
                    <td>
                      {p.is_active
                        ? <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Wifi size={12} /> Activa</span>
                        : <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><WifiOff size={12} /> Inactiva</span>
                      }
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.8rem' }}>
                      {[
                        p.print_on_checkin && 'Check-in',
                        p.print_on_redemption && 'Canje',
                        p.print_on_cycle_reward && 'Ciclo'
                      ].filter(Boolean).join(', ') || 'Ninguno'}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-ghost" onClick={() => handleTest(p)} disabled={testing === p.id} title="Test">
                          <Play size={14} />
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => openEdit(p)} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleDelete(p)} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </div>
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
            <h3 className="modal-title">{editingPrinter ? 'Editar Impresora' : 'Nueva Impresora'}</h3>
            <form onSubmit={handleSubmit}>
              {serverError && (
                <div style={{ padding: '8px 12px', marginBottom: 12, background: 'var(--danger-bg, #fef2f2)', border: '1px solid var(--danger)', borderRadius: 6, color: 'var(--danger)', fontSize: '0.85rem' }}>
                  {serverError}
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input type="text" className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej: Impresora Barra" required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Dirección IP</label>
                  <input type="text" className="form-input" value={form.ip_address} onChange={e => setForm({ ...form, ip_address: e.target.value })} placeholder="192.168.0.100" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Puerto</label>
                  <input type="number" className="form-input" value={form.port} onChange={e => setForm({ ...form, port: parseInt(e.target.value) || 9100 })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ marginBottom: 8 }}>Imprimir automáticamente en:</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.print_on_checkin} onChange={e => setForm({ ...form, print_on_checkin: e.target.checked })} />
                    Check-in (registrar visita)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.print_on_redemption} onChange={e => setForm({ ...form, print_on_redemption: e.target.checked })} />
                    Canje de beneficio
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.print_on_cycle_reward} onChange={e => setForm({ ...form, print_on_cycle_reward: e.target.checked })} />
                    Recompensa por ciclo completado
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
                  Impresora activa
                </label>
              </div>
              <div className="flex gap-2" style={{ marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Guardando...' : (editingPrinter ? 'Guardar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Printers
