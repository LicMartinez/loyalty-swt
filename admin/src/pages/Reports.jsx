import React, { useState, useEffect } from 'react'
import { BarChart3, Download, Calendar, Users, TrendingUp } from 'lucide-react'
import api from '../api'

const Reports = () => {
  const [reportType, setReportType] = useState('visits')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateError, setDateError] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState(null)
  const [emptyMessage, setEmptyMessage] = useState('')

  const needsDateFilter = !['tiers'].includes(reportType)
  const needsPagination = reportType === 'cycle_rewards'

  const validateDates = () => {
    if (!needsDateFilter) return true
    if (dateFrom > dateTo) {
      setDateError('La fecha de inicio no puede ser posterior a la fecha de fin')
      return false
    }
    setDateError('')
    return true
  }

  const loadReport = async (pageNum = 1) => {
    if (!validateDates()) return

    setLoading(true)
    setEmptyMessage('')
    try {
      let res
      if (reportType === 'tiers') {
        res = await api.get('/reports/tiers')
        setData(res.data.data || res.data)
        setPagination(null)
        setEmptyMessage(res.data.data?.length === 0 ? (res.data.message || 'No hay datos disponibles') : '')
      } else if (reportType === 'cycle_rewards') {
        res = await api.get('/reports/cycle-rewards', {
          params: { from: dateFrom, to: dateTo, page: pageNum }
        })
        setData(res.data.data || [])
        setPagination(res.data.pagination || null)
        setPage(pageNum)
        setEmptyMessage(res.data.data?.length === 0 ? (res.data.message || 'No hay registros para el periodo seleccionado') : '')
      } else {
        res = await api.get(`/reports/${reportType}`, {
          params: { from: dateFrom, to: dateTo }
        })
        setData(res.data)
        setPagination(null)
        setEmptyMessage('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    setPagination(null)
    setEmptyMessage('')
    setDateError('')
    loadReport(1)
  }, [reportType])

  useEffect(() => {
    if (reportType !== 'tiers') {
      loadReport(1)
    }
  }, [dateFrom, dateTo])

  const exportCSV = () => {
    if (reportType === 'tiers' || reportType === 'cycle_rewards') {
      if (!Array.isArray(data) || data.length === 0) return
      const headers = Object.keys(data[0]).join(',')
      const rows = data.map(r => Object.values(r).join(',')).join('\n')
      const csv = headers + '\n' + rows
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_${reportType}_${dateFrom}_${dateTo}.csv`
      a.click()
      return
    }
    if (!data?.rows) return
    const headers = Object.keys(data.rows[0] || {}).join(',')
    const rows = data.rows.map(r => Object.values(r).join(',')).join('\n')
    const csv = headers + '\n' + rows
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_${reportType}_${dateFrom}_${dateTo}.csv`
    a.click()
  }

  const hasExportableData = () => {
    if (reportType === 'tiers' || reportType === 'cycle_rewards') {
      return Array.isArray(data) && data.length > 0
    }
    return data?.rows?.length > 0
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.perPage) : 1

  const renderTiersReport = () => {
    if (!Array.isArray(data)) return null
    if (data.length === 0) {
      return (
        <p className="text-muted text-center">
          {emptyMessage || 'No hay datos disponibles'}
        </p>
      )
    }
    return (
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Nivel</th>
              <th>Clientes</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.tier_id || i}>
                <td>{row.tier_name}</td>
                <td>{row.customer_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderCycleRewardsReport = () => {
    if (!Array.isArray(data)) return null
    if (data.length === 0) {
      return (
        <p className="text-muted text-center">
          {emptyMessage || 'No hay registros para el periodo seleccionado'}
        </p>
      )
    }
    return (
      <>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Recompensa</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  <td>{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                  <td>{row.customer_name ?? '—'}</td>
                  <td>{row.reward_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pagination && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button
              className="btn btn-ghost"
              disabled={page <= 1}
              onClick={() => loadReport(page - 1)}
            >
              Anterior
            </button>
            <span>Página {page} de {totalPages}</span>
            <button
              className="btn btn-ghost"
              disabled={page >= totalPages}
              onClick={() => loadReport(page + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </>
    )
  }

  const renderLegacyReport = () => {
    if (!data) return null
    return (
      <>
        {data.summary && (
          <div className="stats-grid" style={{ marginBottom: 20 }}>
            {Object.entries(data.summary).map(([key, value]) => (
              <div className="stat-card" key={key}>
                <div className="stat-label">{key.replace(/_/g, ' ')}</div>
                <div className="stat-value">{value}</div>
              </div>
            ))}
          </div>
        )}

        {data.rows?.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  {Object.keys(data.rows[0]).map(key => (
                    <th key={key}>{key.replace(/_/g, ' ')}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val, j) => (
                      <td key={j}>{val ?? '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted text-center">
            {loading ? 'Cargando reporte...' : 'No hay datos para el periodo seleccionado'}
          </p>
        )}
      </>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reportes</h1>
        {hasExportableData() && (
          <button className="btn btn-ghost" onClick={exportCSV}>
            <Download size={16} /> Exportar CSV
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="card">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Tipo de Reporte</label>
            <select className="form-input" value={reportType} onChange={e => setReportType(e.target.value)}>
              <option value="visits">Visitas por periodo</option>
              <option value="top_customers">Top Clientes</option>
              <option value="redemptions">Canjes realizados</option>
              <option value="birthdays">Cumpleaños del mes</option>
              <option value="tiers">Distribución por Nivel</option>
              <option value="cycle_rewards">Recompensas por Ciclo</option>
            </select>
          </div>
          {needsDateFilter && (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <button className="btn btn-primary" onClick={() => loadReport(1)} disabled={loading}>
            {loading ? 'Cargando...' : 'Generar'}
          </button>
        </div>
        {dateError && (
          <p style={{ color: 'var(--color-error, #e53e3e)', marginTop: 8, marginBottom: 0, fontSize: 14 }}>
            {dateError}
          </p>
        )}
      </div>

      {/* Resultados */}
      <div className="card">
        {loading && (
          <p className="text-muted text-center">Cargando reporte...</p>
        )}
        {!loading && reportType === 'tiers' && renderTiersReport()}
        {!loading && reportType === 'cycle_rewards' && renderCycleRewardsReport()}
        {!loading && reportType !== 'tiers' && reportType !== 'cycle_rewards' && renderLegacyReport()}
      </div>
    </div>
  )
}

export default Reports
