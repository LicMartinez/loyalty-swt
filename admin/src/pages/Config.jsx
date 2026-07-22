import React, { useState, useEffect } from 'react'
import { Settings, Save, Printer, RefreshCw } from 'lucide-react'
import api from '../api'

const Config = () => {
  const [config, setConfig] = useState({ points_per_visit: 10, program_name: 'Loyalty PANEM', cycle_visits_required: 10, cycle_reward_perk_id: null })
  const [saved, setSaved] = useState(false)
  const [perks, setPerks] = useState([])
  const [cycleError, setCycleError] = useState('')
  const [adminForm, setAdminForm] = useState({ current_password: '', new_password: '', confirm_password: '' })

  useEffect(() => {
    loadConfig()
    loadPerks()
  }, [])

  const loadConfig = async () => {
    try {
      const res = await api.get('/config')
      setConfig(res.data)
    } catch (err) { console.error(err) }
  }

  const loadPerks = async () => {
    try {
      const res = await api.get('/perks')
      setPerks(res.data)
    } catch (err) { console.error(err) }
  }

  const handleCycleVisitsChange = (e) => {
    const value = parseInt(e.target.value) || ''
    if (value !== '' && (value < 2 || value > 50)) {
      setCycleError('El valor debe estar entre 2 y 50')
    } else {
      setCycleError('')
    }
    setConfig({ ...config, cycle_visits_required: value === '' ? '' : value })
  }

  const saveConfig = async (e) => {
    e.preventDefault()
    if (config.cycle_visits_required < 2 || config.cycle_visits_required > 50) {
      setCycleError('El valor debe estar entre 2 y 50')
      return
    }
    try {
      await api.put('/config', config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar')
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (adminForm.new_password !== adminForm.confirm_password) {
      alert('Las contraseñas no coinciden')
      return
    }
    try {
      await api.put('/password', {
        current_password: adminForm.current_password,
        new_password: adminForm.new_password
      })
      alert('Contraseña actualizada')
      setAdminForm({ current_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      alert(err.response?.data?.error || 'Error')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configuración</h1>
      </div>

      {/* Configuración del programa */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><Settings size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Programa de Lealtad</h3>
          {saved && <span className="badge badge-success">Guardado ✓</span>}
        </div>
        <form onSubmit={saveConfig}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre del Programa</label>
              <input type="text" className="form-input" value={config.program_name} onChange={e => setConfig({ ...config, program_name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Puntos por Visita</label>
              <input type="number" className="form-input" min="1" value={config.points_per_visit} onChange={e => setConfig({ ...config, points_per_visit: parseInt(e.target.value) || 1 })} />
            </div>
          </div>

          {/* Configuración del Ciclo de Visitas */}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '1.5rem', paddingTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshCw size={16} /> Ciclo de Visitas
            </h4>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Visitas por Ciclo</label>
                <input
                  type="number"
                  className="form-input"
                  min="2"
                  max="50"
                  value={config.cycle_visits_required}
                  onChange={handleCycleVisitsChange}
                />
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Cuántas visitas necesita un cliente para obtener la recompensa (2-50)</span>
                {cycleError && <span style={{ color: 'var(--danger)', fontSize: '0.8rem', display: 'block', marginTop: 4 }}>{cycleError}</span>}
              </div>
              <div className="form-group">
                <label className="form-label">Recompensa del Ciclo</label>
                <select
                  className="form-input"
                  value={config.cycle_reward_perk_id || ''}
                  onChange={e => setConfig({ ...config, cycle_reward_perk_id: e.target.value || null })}
                >
                  <option value="">Sin recompensa</option>
                  {perks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Beneficio otorgado al completar el ciclo de visitas</span>
              </div>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            <Save size={16} /> Guardar Configuración
          </button>
        </form>
      </div>

      {/* Impresora Térmica */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title"><Printer size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Impresora Térmica POS</h3>
        </div>
        <p className="text-muted mb-4" style={{ fontSize: '0.85rem' }}>
          La impresión de tickets de canje se realiza desde el portal del staff al momento de redimir un beneficio. 
          El ticket se genera en formato compatible con impresoras térmicas de 80mm vía Web Serial API o impresión directa del navegador.
        </p>
        <div className="form-group">
          <label className="form-label">Método de impresión</label>
          <select className="form-input" style={{ maxWidth: 300 }}>
            <option value="browser">Impresión del navegador (window.print)</option>
            <option value="serial">Web Serial API (conexión directa USB)</option>
          </select>
        </div>
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>
          Nota: La configuración de impresora se aplica en el portal del staff, no en este panel admin.
        </p>
      </div>

      {/* Cambiar contraseña */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Cambiar Contraseña</h3>
        </div>
        <form onSubmit={changePassword}>
          <div className="form-group">
            <label className="form-label">Contraseña actual</label>
            <input type="password" className="form-input" style={{ maxWidth: 300 }} value={adminForm.current_password} onChange={e => setAdminForm({ ...adminForm, current_password: e.target.value })} required />
          </div>
          <div className="form-row" style={{ maxWidth: 620 }}>
            <div className="form-group">
              <label className="form-label">Nueva contraseña</label>
              <input type="password" className="form-input" value={adminForm.new_password} onChange={e => setAdminForm({ ...adminForm, new_password: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Confirmar contraseña</label>
              <input type="password" className="form-input" value={adminForm.confirm_password} onChange={e => setAdminForm({ ...adminForm, confirm_password: e.target.value })} required />
            </div>
          </div>
          <button type="submit" className="btn btn-ghost">Actualizar Contraseña</button>
        </form>
      </div>
    </div>
  )
}

export default Config

