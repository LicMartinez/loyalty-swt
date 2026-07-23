import React from 'react'
import { LogOut, Shield } from 'lucide-react'

const SuperAdminLayout = ({ children, onLogout }) => {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20 }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
        paddingBottom: 16,
        borderBottom: '1px solid var(--border, #e5e7eb)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Shield size={28} color="var(--primary, #6366f1)" />
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem' }}>SW Loyalty</h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #6b7280)' }}>Super Admin</span>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </header>
      <main>{children}</main>
    </div>
  )
}

export default SuperAdminLayout
