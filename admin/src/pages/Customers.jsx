import React, { useState, useEffect } from 'react'
import { Users, Search, Gift, Plus, Edit2, Trash2, Download } from 'lucide-react'
import api from '../api'

const Customers = () => {
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [showGiftModal, setShowGiftModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [giftForm, setGiftForm] = useState({ type: 'points', points_amount: 0, perk_id: '', reason: '' })
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', birthday: '', notes: '' })
  const [perks, setPerks] = useState([])
  const [tiers, setTiers] = useState([])

  useEffect(() => {
    loadCustomers()
    loadPerks()
    loadTiers()
  }, [])

  const loadCustomers = async () => {
    try {
      const res = await api.get('/customers')
      setCustomers(res.data)
    } catch (err) { console.error(err) }
  }

  const loadPerks = async () => {
    try {
      const res = await api.get('/perks')
      setPerks(res.data)
    } catch (err) { console.error(err) }
  }

  const loadTiers = async () => {
    try {
      const res = await api.get('/tiers')
      setTiers(res.data)
    } catch (err) { console.error(err) }
  }

  const handleTierChange = async (newTierId) => {
    if (!selectedCustomer || newTierId === selectedCustomer.tier_id) return
    try {
      await api.put(`/customers/${selectedCustomer.id}/tier`, { tier_id: newTierId, changed_by: 'admin' })
      alert('Nivel actualizado correctamente')
      loadCustomers()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar nivel')
    }
  }

  const handleGift = (customer) => {
    setSelectedCustomer(customer)
    setGiftForm({ type: 'points', points_amount: 0, perk_id: '', reason: '' })
    setShowGiftModal(true)
  }

  const handleEdit = (customer) => {
    setSelectedCustomer(customer)
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone || '',
      birthday: customer.birthday || '',
      notes: customer.notes || ''
    })
    setShowEditModal(true)
  }

  const submitGift = async (e) => {
    e.preventDefault()
    try {
      await api.post('/gifts', {
        customer_id: selectedCustomer.id,
        ...giftForm
      })
      setShowGiftModal(false)
      loadCustomers()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al enviar regalo')
    }
  }

  const submitEdit = async (e) => {
    e.preventDefault()
    try {
      await api.put(`/customers/${selectedCustomer.id}`, editForm)
      setShowEditModal(false)
      loadCustomers()
    } catch (err) {
      alert(err.response?.data?.error || 'Error al actualizar')
    }
  }

  const handleDelete = async (customer) => {
    if (!confirm(`¿Eliminar al cliente "${customer.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      loadCustomers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar');
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/customers/export');
      const data = res.data;

      const headers = ['Nombre', 'Email', 'Teléfono', 'Cumpleaños', 'Visitas', 'Puntos', 'Nivel', 'Fecha Registro', 'Último Check-in'];
      const rows = data.map(c => {
        const birthday = c.birthday ? new Date(c.birthday + 'T12:00:00').toLocaleDateString('es-MX') : '';
        const registered = new Date(c.created_at).toLocaleDateString('es-MX');
        const lastCheckin = c.last_checkin ? new Date(c.last_checkin).toLocaleDateString('es-MX') + ' ' + new Date(c.last_checkin).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
        return [
          `"${c.name}"`, `"${c.email || ''}"`, `"${c.phone || ''}"`,
          `"${birthday}"`, c.visits_count, c.points_balance,
          `"${c.tier_name}"`, `"${registered}"`, `"${lastCheckin}"`
        ].join(',');
      });

      const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error al exportar');
    }
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <button className="btn btn-ghost" onClick={handleExport}>
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div style={{ position: 'relative', width: 300 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: 36 }}
              placeholder="Buscar por nombre, email o teléfono..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span className="text-muted">{filtered.length} clientes</span>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Nivel</th>
                <th>Email</th>
                <th>Visitas</th>
                <th>Puntos</th>
                <th>Cumpleaños</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td>
                  <td>
                    <span className="badge badge-secondary">
                      {tiers.find(t => t.id === c.tier_id)?.name || 'Bronce'}
                    </span>
                  </td>
                  <td className="text-muted">{c.email}</td>
                  <td>{c.visits_count}</td>
                  <td><span className="badge badge-primary">{c.points_balance} pts</span></td>
                  <td className="text-muted">
                    {c.birthday ? new Date(c.birthday + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-sm btn-ghost" onClick={() => handleEdit(c)} title="Editar">
                        <Edit2 size={14} />
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => handleGift(c)} title="Regalar">
                        <Gift size={14} />
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c)} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Regalo Directo */}
      {showGiftModal && (
        <div className="modal-overlay" onClick={() => setShowGiftModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Regalo para {selectedCustomer?.name}</h3>
            <form onSubmit={submitGift}>
              <div className="form-group">
                <label className="form-label">Tipo de regalo</label>
                <select className="form-input" value={giftForm.type} onChange={e => setGiftForm({ ...giftForm, type: e.target.value })}>
                  <option value="points">Puntos</option>
                  <option value="perk">Beneficio</option>
                </select>
              </div>
              {giftForm.type === 'points' ? (
                <div className="form-group">
                  <label className="form-label">Cantidad de puntos</label>
                  <input type="number" className="form-input" min="1" value={giftForm.points_amount} onChange={e => setGiftForm({ ...giftForm, points_amount: parseInt(e.target.value) || 0 })} required />
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Beneficio</label>
                  <select className="form-input" value={giftForm.perk_id} onChange={e => setGiftForm({ ...giftForm, perk_id: e.target.value })} required>
                    <option value="">Seleccionar...</option>
                    {perks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Razón</label>
                <input type="text" className="form-input" value={giftForm.reason} onChange={e => setGiftForm({ ...giftForm, reason: e.target.value })} placeholder="Ej: Cumpleaños, cortesía..." />
              </div>
              <div className="flex gap-2" style={{ marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowGiftModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Enviar Regalo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Cliente */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Editar Cliente</h3>
            <form onSubmit={submitEdit}>
              <div className="form-group">
                <label className="form-label">Nombre</label>
                <input type="text" className="form-input" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input type="text" className="form-input" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de Nacimiento</label>
                <input type="date" className="form-input" value={editForm.birthday} onChange={e => setEditForm({ ...editForm, birthday: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows="3" value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Notas internas sobre el cliente..." />
              </div>
              <div className="form-group">
                <label className="form-label">Nivel</label>
                <select className="form-input" value={selectedCustomer?.tier_id || ''} onChange={e => handleTierChange(e.target.value)}>
                  {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2" style={{ marginTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Customers

