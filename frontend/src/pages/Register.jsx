import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

const Register = () => {
    const [searchParams] = useSearchParams();
    const tenantSlug = (searchParams.get('tenant') || '').trim().toLowerCase();

    const [form, setForm] = useState({ name: '', email: '', phone: '', birthday: '' });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});

    const tenantName = useMemo(() => {
        if (!tenantSlug) return '';
        return tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1);
    }, [tenantSlug]);

    const validate = () => {
        const errors = {};
        
        if (!form.name.trim() || form.name.trim().length < 2) {
            errors.name = 'El nombre debe tener al menos 2 caracteres';
        }
        
        if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
            errors.email = 'Ingresa un correo electrónico válido';
        } else {
            const domain = form.email.split('@')[1]?.toLowerCase();
            const blocked = ['tempmail.com','yopmail.com','guerrillamail.com','mailinator.com','10minutemail.com','throwaway.email','amupx.com','tmpmail.net','maildrop.cc','trashmail.com'];
            if (blocked.some(d => domain?.includes(d))) {
                errors.email = 'No se permiten correos temporales o desechables';
            }
        }
        
        if (form.phone) {
            const clean = form.phone.replace(/[\s\-\(\)\+]/g, '').replace(/^(52|521)/, '');
            if (!/^\d{10}$/.test(clean)) {
                errors.phone = 'El teléfono debe tener 10 dígitos';
            }
        }
        
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!tenantSlug) {
            setError('Link de registro inválido: falta el negocio.');
            setLoading(false);
            return;
        }

        if (!validate()) {
            setLoading(false);
            return;
        }

        const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

        try {
            const res = await axios.post(`${apiBase}/api/customers`, {
                name: form.name,
                email: form.email,
                phone: form.phone,
                birthday: form.birthday || null,
                tenant_slug: tenantSlug
            });
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al registrar. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    if (!tenantSlug) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div className="card text-center" style={{ maxWidth: 450 }}>
                    <AlertTriangle size={48} color="var(--warning, #f59e0b)" style={{ margin: '0 auto 16px' }} />
                    <h2 className="mb-2">Link de registro incompleto</h2>
                    <p className="text-muted">
                        Este portal es compartido entre varios negocios. Debes abrir el enlace o escanear el QR
                        que te proporcionó tu establecimiento (incluye el identificador de la marca).
                    </p>
                    <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 12 }}>
                        Formato correcto: <code>/register?tenant=tu-negocio</code>
                    </p>
                </div>
            </div>
        );
    }

    if (result) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div className="card text-center" style={{ maxWidth: 450 }}>
                    <CheckCircle size={56} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                    <h2 className="mb-2">¡Registro Exitoso!</h2>
                    <p className="text-muted mb-4">
                        Bienvenido al programa de lealtad {tenantName}, <strong>{form.name}</strong>.
                    </p>
                    <p style={{ fontSize: '0.9rem', marginBottom: 20 }}>
                        Agrega tu pase a tu Wallet para acumular puntos y recibir beneficios exclusivos.
                    </p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {result.applePassUrl && (
                            <a 
                                href={result.applePassUrl} 
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    background: '#000',
                                    color: '#fff',
                                    padding: '14px 28px',
                                    borderRadius: 12,
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '1rem'
                                }}
                            >
                                🍎 Agregar a Apple Wallet
                            </a>
                        )}

                        {result.saveUrl && (
                            <a 
                                href={result.saveUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    background: isIOS ? '#333' : '#000',
                                    color: '#fff',
                                    padding: '14px 28px',
                                    borderRadius: 12,
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '1rem'
                                }}
                            >
                                Agregar a Google Wallet
                            </a>
                        )}
                    </div>

                    <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 16 }}>
                        Una vez agregado, muestra el código QR de tu pase en el establecimiento para registrar tus visitas.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div className="card" style={{ maxWidth: 450, width: '100%' }}>
                <div className="text-center mb-4">
                    <UserPlus size={40} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
                    <h2 className="mb-2">{tenantName} Loyalty</h2>
                    <p className="text-muted">Regístrate para comenzar a acumular puntos y beneficios</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 14 }}>
                        <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Nombre completo *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            required
                            placeholder="Tu nombre"
                            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: `1px solid ${fieldErrors.name ? '#ef4444' : 'var(--glass-border)'}`, background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                        />
                        {fieldErrors.name && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{fieldErrors.name}</span>}
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Correo electrónico *</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            required
                            placeholder="tu@email.com"
                            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: `1px solid ${fieldErrors.email ? '#ef4444' : 'var(--glass-border)'}`, background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                        />
                        {fieldErrors.email && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{fieldErrors.email}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                        <div style={{ flex: 1 }}>
                            <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Teléfono</label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                placeholder="55 1234 5678"
                                style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: `1px solid ${fieldErrors.phone ? '#ef4444' : 'var(--glass-border)'}`, background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                            />
                            {fieldErrors.phone && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{fieldErrors.phone}</span>}
                        </div>
                        <div style={{ flex: 1 }}>
                            <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Fecha de nacimiento</label>
                            <input
                                type="date"
                                value={form.birthday}
                                onChange={e => setForm({ ...form, birthday: e.target.value })}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                            />
                        </div>
                    </div>

                    {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}

                    <button 
                        type="submit" 
                        className="btn-primary"
                        disabled={loading}
                        style={{ width: '100%', padding: '16px', fontSize: '1rem', marginTop: 8 }}
                    >
                        {loading ? <><Loader2 size={18} className="animate-spin" /> Registrando...</> : <><UserPlus size={18} /> Registrarme</>}
                    </button>
                </form>

                <p className="text-muted text-center" style={{ fontSize: '0.75rem', marginTop: 16 }}>
                    Al registrarte aceptas participar en el programa de lealtad {tenantName}.
                </p>
            </div>
        </div>
    );
};

export default Register;
