import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const StaffLogin = ({ onLogin }) => {
  const [slug, setSlug] = useState(localStorage.getItem('staff_slug') || '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/api/auth/login`, {
        slug: slug.trim(),
        username: username.trim(),
        password
      });

      localStorage.setItem('staff_slug', slug.trim());
      onLogin(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: '100%', maxWidth: 380 }}>
        <div className="text-center mb-4">
          <Lock size={40} color="var(--primary)" style={{ margin: '0 auto 16px', display: 'block' }} />
          <h2>SW Loyalty</h2>
          <p className="text-muted">Staff Portal</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Negocio</label>
            <input
              type="text"
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase())}
              placeholder="ej: panem"
              required
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '1rem' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="usuario"
              required
              autoComplete="username"
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '1rem' }}
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '1rem' }}
            />
          </div>
          {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StaffLogin;
