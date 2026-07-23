import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { ArrowLeft, CheckCircle, Gift, Loader2, Star, Printer } from 'lucide-react';
import { printRedemptionTicket } from '../utils/printer';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

const CustomerProfile = ({ customerId, onReset }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const tenantSlug = localStorage.getItem('staff_slug') || '';

    useEffect(() => {
        axios.get(`${API_URL}/customers/${customerId}?tenant_slug=${tenantSlug}`)
            .then(res => {
                setData(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                alert("Cliente no encontrado o error de conexión.");
                onReset();
            });
    }, [customerId, onReset]);

    const handleCheckIn = async () => {
        setActionLoading(true);
        try {
            const res = await axios.post(`${API_URL}/checkin`, { 
                customerId, 
                scannedBy: 'Staff',
                tenant_slug: tenantSlug
            });
            setData(prev => ({
                ...prev,
                customer: {
                    ...prev.customer,
                    visits_count: res.data.visits,
                    points_balance: res.data.points
                }
            }));
            alert('¡Check-in exitoso!');
        } catch (error) {
            console.error(error);
            alert(error.response?.data?.error || 'Error en check-in');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRedeem = async (perkId) => {
        if(!window.confirm('¿Confirmar canje de beneficio?')) return;
        
        setActionLoading(true);
        try {
            const res = await axios.post(`${API_URL}/redemption`, { 
                customerId, 
                perkId, 
                redeemedBy: 'Staff',
                tenant_slug: tenantSlug
            });
            setData(prev => ({
                ...prev,
                customer: {
                    ...prev.customer,
                    points_balance: res.data.remainingPoints
                }
            }));
            // Imprimir ticket
            if (res.data.ticket) {
                printRedemptionTicket(res.data.ticket);
            }
            alert('¡Beneficio canjeado! Imprimiendo ticket...');
        } catch (error) {
            console.error(error);
            alert(error.response?.data?.error || 'Error al canjear');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRedeemGift = async (giftId) => {
        if(!window.confirm('¿Confirmar redención de cortesía?')) return;
        
        setActionLoading(true);
        try {
            const res = await axios.post(`${API_URL}/redemption/gift`, { 
                customerId, 
                giftId, 
                redeemedBy: 'Staff',
                tenant_slug: tenantSlug
            });
            // Remover el regalo de la lista
            setData(prev => ({
                ...prev,
                customer: { ...prev.customer, points_balance: res.data.remainingPoints },
                pendingGifts: prev.pendingGifts.filter(g => g.id !== giftId)
            }));
            // Imprimir ticket
            if (res.data.ticket) {
                printRedemptionTicket(res.data.ticket);
            }
            alert('¡Cortesía redimida! Imprimiendo ticket...');
        } catch (error) {
            console.error(error);
            alert(error.response?.data?.error || 'Error al redimir');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) return <div className="text-center" style={{display: 'flex', justifyContent: 'center', padding: '40px'}}><Loader2 className="animate-spin" size={32} /></div>;

    const { customer, perks, pendingGifts } = data;

    return (
        <div className="card animate-slide-up">
            <button className="mb-4" style={{ background: 'transparent', padding: 0, justifyContent: 'flex-start', color: 'var(--text-muted)' }} onClick={onReset}>
                <ArrowLeft size={20} /> Volver al Escáner
            </button>
            
            <div className="text-center mb-4">
                <h2 className="mb-2">{customer.name}</h2>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <div style={{ background: 'var(--surface-color)', padding: '10px 20px', borderRadius: '12px' }}>
                        <div className="text-muted">Visitas</div>
                        <h3>{customer.visits_count}</h3>
                    </div>
                    <div style={{ background: 'var(--surface-color)', padding: '10px 20px', borderRadius: '12px' }}>
                        <div className="text-muted">Puntos</div>
                        <h3>{customer.points_balance}</h3>
                    </div>
                </div>
            </div>

            <button 
                className="btn-success mb-4" 
                onClick={handleCheckIn}
                disabled={actionLoading}
                style={{ padding: '20px', fontSize: '18px' }}
            >
                <CheckCircle /> {actionLoading ? 'Procesando...' : 'Registrar Visita'}
            </button>

            {/* Regalos/Cortesías Pendientes */}
            {pendingGifts && pendingGifts.length > 0 && (
                <>
                    <h3 className="mb-2" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px', color: 'var(--success)' }}>
                        <Star size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                        Cortesías Disponibles
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                        {pendingGifts.map(gift => (
                            <div key={gift.id} style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h4 style={{marginBottom: '4px', color: 'var(--success)'}}>{gift.perks?.name || 'Cortesía'}</h4>
                                    <div className="text-muted" style={{ fontSize: '0.8rem' }}>
                                        {gift.reason || 'Regalo directo'} • GRATIS
                                    </div>
                                </div>
                                <button 
                                    className="btn-success" 
                                    style={{ width: 'auto', padding: '10px 16px' }}
                                    onClick={() => handleRedeemGift(gift.id)}
                                    disabled={actionLoading}
                                >
                                    <Gift size={18} /> Redimir
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* Beneficios canjeables con puntos */}
            <h3 className="mb-2" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                <Gift size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Canjear con Puntos
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {perks && perks.length > 0 ? perks.map(perk => {
                    const canRedeem = customer.points_balance >= (perk.cost_points || 0);
                    return (
                        <div key={perk.id} style={{ background: 'var(--surface-color)', padding: '16px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h4 style={{marginBottom: '4px'}}>{perk.name}</h4>
                                <div className="text-muted">{perk.cost_points} Puntos</div>
                            </div>
                            <button 
                                className="btn-primary" 
                                style={{ width: 'auto', padding: '10px 16px', opacity: canRedeem ? 1 : 0.5 }}
                                onClick={() => handleRedeem(perk.id)}
                                disabled={!canRedeem || actionLoading}
                            >
                                <Gift size={18} /> Canjear
                            </button>
                        </div>
                    )
                }) : (
                    <div className="text-muted text-center" style={{ padding: '16px' }}>No hay beneficios configurados.</div>
                )}
            </div>
        </div>
    );
};

export default CustomerProfile;
