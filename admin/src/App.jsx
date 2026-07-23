import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import SuperAdminLayout from './components/SuperAdminLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Perks from './pages/Perks'
import Promotions from './pages/Promotions'
import Config from './pages/Config'
import Reports from './pages/Reports'
import TierConfig from './pages/TierConfig'
import Printers from './pages/Printers'
import SuperAdmin from './pages/SuperAdmin'
import SuperAdminUsers from './pages/SuperAdminUsers'

function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'))
  const [userData, setUserData] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user_data') || 'null')
    } catch {
      return null
    }
  })
  const [selectedTenant, setSelectedTenant] = useState(null)

  const handleLogin = (newToken, user) => {
    localStorage.setItem('admin_token', newToken)
    setToken(newToken)
    if (user) {
      localStorage.setItem('user_data', JSON.stringify(user))
      setUserData(user)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    localStorage.removeItem('user_data')
    localStorage.removeItem('tenant_data')
    setToken(null)
    setUserData(null)
    setSelectedTenant(null)
  }

  if (!token) {
    return <Login onLogin={handleLogin} />
  }

  // Super Admin view
  if (userData?.role === 'super_admin') {
    return (
      <SuperAdminLayout onLogout={handleLogout}>
        {selectedTenant ? (
          <SuperAdminUsers
            tenant={selectedTenant}
            onBack={() => setSelectedTenant(null)}
          />
        ) : (
          <SuperAdmin onSelectTenant={setSelectedTenant} />
        )}
      </SuperAdminLayout>
    )
  }

  // Normal tenant admin view
  return (
    <Layout onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/perks" element={<Perks />} />
        <Route path="/promotions" element={<Promotions />} />
        <Route path="/tiers" element={<TierConfig />} />
        <Route path="/printers" element={<Printers />} />
        <Route path="/config" element={<Config />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  )
}

export default App
