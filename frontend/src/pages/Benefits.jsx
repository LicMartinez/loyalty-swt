import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Gift, Star, Award, Loader2, PartyPopper } from 'lucide-react';

const Benefits = () => {
    const { customerId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        axios.get(`/api/customers/${customerId}/benefits`)
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                setError('No se pudo cargar la información.');
                setLoading(false);
            });
    }, [customerId]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={32} className="animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                <div className="card text-center" style={{ maxWidth: 400 }}>
                    <p className="text-muted">{error}</p>
                </div>
            </div>
        );
    }

    const { customer, perks, pendingGifts } = data;

    // Filtrar solo los beneficios que el cliente YA puede canjear con sus puntos actuales
    const redeemablePerks = (perks || []).filter(p => customer.points_balance >= p.cost_points);

    const hasAnything = (pendingGifts && pendingGifts.length > 0) || redeemablePerks.length > 0;

    return (
        <div style={{ minHeight: '100vh', padding: 20, maxWidth: 500, margin: '0 auto' }}>
            <div className="text-center mb-4" style={{ paddingTop: 20 }}>
                <Award size={40} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
                <h2 style={{ marginBottom: 4 }}>Mis Beneficios</h2>
                <p className="text-muted">{customer.name}</p>
            </div>

            {/* Resumen */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Visitas</div>
                    <h3>{customer.visits_count}</h3>
                </div>
                <div>
                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>Puntos</div>
                    <h3 style={{ color: 'var(--primary)' }}>{customer.points_balance}</h3>
                </div>
            </div>

            {/* Cortesías pendientes (regalos directos) */}
            {pendingGifts && pendingGifts.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: 12, color: 'var(--success)', fontSize: '1rem' }}>
                        <Star size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Cortesías Disponibles
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {pendingGifts.map(gift => (
                            <div key={gift.id} style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: 14, borderRadius: 10 }}>
                                <strong style={{ color: 'var(--success)' }}>{gift.perks?.name || 'Cortesía'}</strong>
                                <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                                    {gift.reason || 'Regalo directo'} — Presenta tu QR para redimirlo
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Beneficios que YA puede canjear */}
            {redeemablePerks.length > 0 && (
                <div className="card">
                    <h3 style={{ marginBottom: 12, fontSize: '1rem' }}>
                        <Gift size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Listos para Canjear
                    </h3>
                    <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 12 }}>
                        Ya tienes suficientes puntos para estos beneficios:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {redeemablePerks.map(perk => (
                            <div key={perk.id} style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: 14, borderRadius: 10 }}>
                                <strong>{perk.name}</strong>
                                {perk.description && <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{perk.description}</p>}
                                <p style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: 6 }}>
                                    Costo: {perk.cost_points} pts — Presenta tu QR para canjearlo
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Si no tiene nada disponible */}
            {!hasAnything && (
                <div className="card text-center" style={{ padding: 30 }}>
                    <PartyPopper size={32} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                    <p className="text-muted">
                        Aún no tienes beneficios disponibles.<br />
                        ¡Sigue acumulando puntos con tus visitas!
                    </p>
                </div>
            )}

            <p className="text-muted text-center" style={{ fontSize: '0.75rem', marginTop: 16 }}>
                Para canjear, presenta tu código QR al personal del establecimiento.
            </p>
        </div>
    );
};

export default Benefits;
