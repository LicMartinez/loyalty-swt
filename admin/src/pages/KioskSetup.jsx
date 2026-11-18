import React, { useEffect, useState } from 'react'
import { Monitor, Plus, Trash2, Save, Ticket, Image, Film } from 'lucide-react'
import api from '../api'

const KioskSetup = () => {
  const [products, setProducts] = useState([])
  const [media, setMedia] = useState([])
  const [form, setForm] = useState({ name: '', description: '' })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    try {
      const [p, b] = await Promise.all([
        api.get('/cover-products'),
        api.get('/branding')
      ])
      setProducts(p.data || [])
      setMedia(Array.isArray(b.data?.kiosk_media) ? b.data.kiosk_media : [])
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar')
    }
  }

  useEffect(() => { load() }, [])

  const addProduct = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/cover-products', { name: form.name, description: form.description, is_active: true })
      setForm({ name: '', description: '' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear')
    }
  }

  const toggleProduct = async (p) => {
    await api.put(`/cover-products/${p.id}`, { is_active: !p.is_active })
    load()
  }

  const deleteProduct = async (id) => {
    if (!confirm('¿Eliminar este boleto de cover?')) return
    await api.delete(`/cover-products/${id}`)
    load()
  }

  const uploadMedia = async (file) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await api.post('/branding/kiosk-media', {
        contentType: file.type,
        data: dataUrl
      })
      setMedia(res.data.kiosk_media || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Error al subir el archivo')
    } finally {
      setUploading(false)
    }
  }

  const removeMedia = async (url) => {
    try {
      const res = await api.delete('/branding/kiosk-media', { data: { url } })
      setMedia(res.data.kiosk_media || [])
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo quitar')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Kiosco y cover</h1>
        {saved && <span className="badge badge-success">Guardado ✓</span>}
      </div>
      {error && <p className="field-error" style={{ marginBottom: 16 }}>{error}</p>}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <Ticket size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Boletos de cover
          </h3>
        </div>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
          Cada producto se imprime <strong>una sola vez</strong> en la impresora Cover del portal staff.
          Los canjes de barra salen en todas las impresoras de barra.
        </p>
        <form onSubmit={addProduct} className="form-row" style={{ alignItems: 'end' }}>
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Cover general" required />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción (opcional)</label>
            <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group">
            <button type="submit" className="btn btn-primary"><Plus size={16} /> Agregar</button>
          </div>
        </form>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong>{p.description ? <div className="text-muted" style={{ fontSize: '0.8rem' }}>{p.description}</div> : null}</td>
                  <td>
                    <button type="button" className={`btn btn-sm ${p.is_active ? 'btn-primary' : 'btn-ghost'}`} onClick={() => toggleProduct(p)}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => deleteProduct(p.id)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: 20 }}>Aún no hay boletos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <Monitor size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Branding del kiosco (loop)
          </h3>
        </div>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
          Fotos y videos que rotan en la pantalla de espera del kiosco. PNG/JPEG/WebP (4 MB) o MP4/WebM (20 MB).
        </p>
        <label className="form-label">
          <Image size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Subir archivo
        </label>
        <input
          type="file"
          className="form-input"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          disabled={uploading}
          onChange={(e) => uploadMedia(e.target.files?.[0])}
        />
        {uploading && <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>Subiendo…</p>}

        <div className="kiosk-media-grid">
          {media.map((item) => (
            <div key={item.url} className="kiosk-media-card">
              {item.type === 'video' ? (
                <video src={item.url} muted playsInline />
              ) : (
                <img src={item.url} alt="" />
              )}
              <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                {item.type === 'video' ? <Film size={12} /> : <Image size={12} />} {item.type}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeMedia(item.url)}>
                <Trash2 size={14} /> Quitar
              </button>
            </div>
          ))}
        </div>
        {media.length === 0 && (
          <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 12 }}>Sin archivos. El kiosco mostrará solo el mensaje de escaneo.</p>
        )}
        <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 12 }}>
          <Save size={12} style={{ verticalAlign: 'middle' }} /> Los archivos se guardan al subirlos; no hace falta otro botón.
        </p>
      </div>
    </div>
  )
}

export default KioskSetup
