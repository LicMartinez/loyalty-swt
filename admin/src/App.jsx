import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Customers from './pages/Customers'
import Perks from './pages/Perks'
import Promotions from './pages/Promotions'
import Config from './pages/Config'
import Reports from './pages/Reports'
import TierConfig from './pages/TierConfig'
import Printers from './pages/Printers'

function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token'))

  const handleLogin = (newToken) => {
    localStorage.setItem('admin_token', newToken)
    setToken(newToken)
  }

  const handleLogout = () => {
    localStorage.removeItem('admin_token')
    setToken(null)
  }

  if (!token) {
    return <Login onLogin={handleLogin} />
  }

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
