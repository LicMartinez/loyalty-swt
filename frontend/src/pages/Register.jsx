import React, { useState } from 'react';
import axios from 'axios';
import { UserPlus, CheckCircle, Loader2 } from 'lucide-react';

const Register = () => {
    const [form, setForm] = useState({ name: '', email: '', phone: '', birthday: '' });
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const res = await axios.post('/api/customers', {
                name: form.name,
                email: form.email,
                phone: form.phone,
                birthday: form.birthday || null
            });
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Error al registrar. Intenta de nuevo.');
        } finally {
            setLoading(false);
        }
    };

    if (result) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div className="card text-center" style={{ maxWidth: 450 }}>
                    <CheckCircle size={56} color="var(--success)" style={{ margin: '0 auto 16px' }} />
                    <h2 className="mb-2">¡Registro Exitoso!</h2>
                    <p className="text-muted mb-4">
                        Bienvenido al programa de lealtad PANEM, <strong>{form.name}</strong>.
                    </p>
                    <p style={{ fontSize: '0.9rem', marginBottom: 20 }}>
                        Agrega tu pase a Google Wallet para acumular puntos y recibir beneficios exclusivos.
                    </p>
                    <a 
                        href={result.saveUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
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
                        <img 
                            src="https://pay.google.com/about/static_kcs/images/logos/google-pay-logo.png" 
                            alt="Google Wallet" 
                            style={{ height: 24 }} 
                        />
                        Agregar a Google Wallet
                    </a>
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
                    <h2 className="mb-2">PANEM Loyalty</h2>
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
                            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                        />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                        <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Correo electrónico *</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            required
                            placeholder="tu@email.com"
                            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                        <div style={{ flex: 1 }}>
                            <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: '0.85rem' }}>Teléfono</label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={e => setForm({ ...form, phone: e.target.value })}
                                placeholder="55 1234 5678"
                                style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.95rem' }}
                            />
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
                    Al registrarte aceptas participar en el programa de lealtad PANEM.
                </p>
            </div>
        </div>
    );
};

export default Register;
