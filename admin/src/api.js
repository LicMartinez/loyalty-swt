import axios from 'axios'

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const api = axios.create({
  baseURL: `${API_BASE}/api/admin`
})

// Interceptor para agregar token a todas las peticiones
api.interceptors.request.use(config => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor para manejar 401 (sesión expirada)
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('tenant_data')
      window.location.reload()
    }
    return Promise.reject(error)
  }
)

export default api
