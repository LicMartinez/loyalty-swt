import React, { useState } from 'react'
import { Lock } from 'lucide-react'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

const Login = ({ onLogin }) => {
  const [slug, setSlug] = useState(localStorage.getItem('tenant_slug') || '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, {
        slug: slug.trim() || undefined,
        username: username.trim(),
        password
      })

      // Guardar token y datos del tenant
      localStorage.setItem('tenant_slug', slug.trim())
      if (res.data.tenant) {
        localStorage.setItem('tenant_data', JSON.stringify(res.data.tenant))
      }

      onLogin(res.data.token)
    } catch (err) {
      setError(err.response?.data?.error || 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="text-center mb-4">
          <Lock size={40} color="var(--primary)" style={{ margin: '0 auto 16px' }} />
          <h2>SW Loyalty</h2>
          <p className="text-muted">Panel de Administración</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Negocio</label>
            <input
              type="text"
              className="form-input"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase())}
              placeholder="ej: panem"
              autoComplete="organization"
            />
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>Dejar vacío para Super Admin</span>
          </div>
          <div className="form-group">
            <label className="form-label">Usuario</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-danger mb-4" style={{ fontSize: '0.85rem', color: 'var(--danger, #ef4444)' }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
