import React from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Users, Gift, Megaphone, Settings, BarChart3, LogOut, Layers, Printer } from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers', icon: Users, label: 'Clientes' },
  { to: '/perks', icon: Gift, label: 'Premios' },
  { to: '/promotions', icon: Megaphone, label: 'Promociones' },
  { to: '/reports', icon: BarChart3, label: 'Reportes' },
  { to: '/tiers', icon: Layers, label: 'Niveles' },
  { to: '/printers', icon: Printer, label: 'Impresoras' },
  { to: '/config', icon: Settings, label: 'Configuración' },
]

const Layout = ({ children, onLogout }) => {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">SW Loyalty</div>
        <div className="sidebar-subtitle">Panel de Administración</div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} className="nav-item-icon" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={onLogout}>
            <LogOut size={20} className="nav-item-icon" />
            Cerrar Sesión
          </button>
        </div>
      </aside>
      <main className="main-content animate-slide-up">
        {children}
      </main>
    </div>
  )
}

export default Layout
