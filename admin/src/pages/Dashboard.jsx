import React, { useState, useEffect } from 'react'
import { Users, CalendarCheck, Gift, TrendingUp, Cake } from 'lucide-react'
import api from '../api'

const Dashboard = () => {
  const [stats, setStats] = useState(null)
  const [birthdays, setBirthdays] = useState([])
  const [recentCheckins, setRecentCheckins] = useState([])
  const [tierData, setTierData] = useState([])

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const [statsRes, birthdaysRes, checkinsRes, tiersRes] = await Promise.all([
        api.get('/stats'),
        api.get('/birthdays'),
        api.get('/checkins/recent'),
        api.get('/reports/tiers')
      ])
      setStats(statsRes.data)
      setBirthdays(birthdaysRes.data)
      setRecentCheckins(checkinsRes.data)
      setTierData(tiersRes.data.data || [])
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-bg)' }}>
            <Users size={20} color="var(--primary)" />
          </div>
          <div className="stat-label">Clientes Totales</div>
          <div className="stat-value">{stats?.totalCustomers || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-bg)' }}>
            <CalendarCheck size={20} color="var(--success)" />
          </div>
          <div className="stat-label">Visitas Hoy</div>
          <div className="stat-value">{stats?.todayCheckins || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}>
            <Gift size={20} color="var(--warning)" />
          </div>
          <div className="stat-label">Canjes del Mes</div>
          <div className="stat-value">{stats?.monthRedemptions || 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--danger-bg)' }}>
            <TrendingUp size={20} color="var(--danger)" />
          </div>
          <div className="stat-label">Puntos Emitidos Hoy</div>
          <div className="stat-value">{stats?.todayPoints || 0}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Cumpleañeros del mes */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><Cake size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Cumpleaños del Mes</h3>
          </div>
          {birthdays.length === 0 ? (
            <p className="text-muted">No hay cumpleañeros este mes</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Cliente</th><th>Fecha</th></tr>
                </thead>
                <tbody>
                  {birthdays.map(b => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td>{new Date(b.birthday).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Últimas visitas */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><CalendarCheck size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Últimas Visitas</h3>
          </div>
          {recentCheckins.length === 0 ? (
            <p className="text-muted">Sin visitas recientes</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Cliente</th><th>Hora</th></tr>
                </thead>
                <tbody>
                  {recentCheckins.map(c => (
                    <tr key={c.id}>
                      <td>{c.customer_name}</td>
                      <td>{new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Distribución por Nivel */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title"><TrendingUp size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />Distribución por Nivel</h3>
          </div>
          {tierData.length === 0 ? (
            <p className="text-muted">No hay datos de niveles</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr><th>Nivel</th><th>Clientes</th></tr>
                </thead>
                <tbody>
                  {tierData.map(t => (
                    <tr key={t.tier_id}>
                      <td>{t.tier_name}</td>
                      <td><span className="badge badge-primary">{t.customer_count}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
