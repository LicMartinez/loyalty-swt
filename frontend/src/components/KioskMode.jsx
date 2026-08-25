import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { CheckCircle, Gift, Star, Loader2, AlertTriangle, Clock, QrCode } from 'lucide-react';
import { printRedemptionTicket } from '../utils/printer';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

/**
 * KioskMode — Modo automático de check-in para pantalla grande.
 * 
 * Flujo:
 * 1. Muestra escáner QR en pantalla completa
 * 2. Al escanear, ejecuta check-in automáticamente
 * 3. Muestra resultado (éxito + beneficios si hay)
 * 4. Si hay beneficios, muestra countdown configurable
 * 5. Regresa automáticamente al escáner al terminar el countdown
 */
const KioskMode = ({ timeout = 20, onExit }) => {
    const [phase, setPhase] = useState('scanning'); // scanning | processing | result | error
    const [customerData, setCustomerData] = useState(null);
    const [checkinResult, setCheckinResult] = useState(null);
    const [countdown, setCountdown] = useState(timeout);
    const [errorMsg, setErrorMsg] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const countdownRef = useRef(null);
    const scannerRef = useRef(null);
    const interactionRef = useRef(false);

    const tenantSlug = localStorage.getItem('staff_slug') || '';

    // Cleanup countdown on unmount
    useEffect(() => {
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    // Start countdown when entering result phase
    useEffect(() => {
        if (phase === 'result') {
            interactionRef.current = false;
            setCountdown(timeout);
            countdownRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        resetToScanner();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [phase, timeout]);

    // Start countdown for error phase (5 seconds)
    useEffect(() => {
        if (phase === 'error') {
            const timer = setTimeout(() => {
                resetToScanner();
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    const resetToScanner = useCallback(() => {
        setPhase('scanning');
        setCustomerData(null);
        setCheckinResult(null);
        setErrorMsg('');
        setCountdown(timeout);
        interactionRef.current = false;
    }, [timeout]);

    const pauseCountdown = () => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
        interactionRef.current = true;
    };

    const resumeCountdown = () => {
        if (!countdownRef.current && phase === 'result') {
            countdownRef.current = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(countdownRef.current);
                        resetToScanner();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
    };

    const handleScan = useCallback(async (decodedText) => {
        // Extract customer ID from scanned QR
        let customerId = decodedText.trim();
        if (customerId.includes('.')) {
            customerId = customerId.split('.').pop();
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(customerId)) {
            setErrorMsg('Código QR no válido');
            setPhase('error');
            return;
        }

        setPhase('processing');

        try {
            // 1. Perform check-in automatically
            const checkinRes = await axios.post(`${API_URL}/checkin`, {
                customerId,
                scannedBy: 'Kiosk',
                tenant_slug: tenantSlug
            });

            // 2. Get customer details (perks + gifts)
            const profileRes = await axios.get(`${API_URL}/customers/${customerId}?tenant_slug=${tenantSlug}`);

            setCheckinResult(checkinRes.data);
            setCustomerData(profileRes.data);
            setPhase('result');
        } catch (error) {
            const msg = error.response?.data?.error || 'Error al registrar visita';
            setErrorMsg(msg);
            setPhase('error');
        }
    }, [tenantSlug]);

    const handleRedeemGift = async (giftId) => {
        pauseCountdown();
        setActionLoading(true);
        try {
            const res = await axios.post(`${API_URL}/redemption/gift`, {
                customerId: customerData.customer.id,
                giftId,
                redeemedBy: 'Kiosk',
                tenant_slug: tenantSlug
            });
            // Update local state
            setCustomerData(prev => ({
                ...prev,
                customer: { ...prev.customer, points_balance: res.data.remainingPoints },
                pendingGifts: prev.pendingGifts.filter(g => g.id !== giftId)
            }));
            // Print ticket
            if (res.data.ticket) {
                printRedemptionTicket(res.data.ticket);
            }
        } catch (error) {
            console.error('Error redeeming gift:', error);
        } finally {
            setActionLoading(false);
            resumeCountdown();
        }
    };

    const handleRedeem = async (perkId) => {
        pauseCountdown();
        setActionLoading(true);
        try {
            const res = await axios.post(`${API_URL}/redemption`, {
                customerId: customerData.customer.id,
                perkId,
                redeemedBy: 'Kiosk',
                tenant_slug: tenantSlug
            });
            setCustomerData(prev => ({
                ...prev,
                customer: { ...prev.customer, points_balance: res.data.remainingPoints }
            }));
            if (res.data.ticket) {
                printRedemptionTicket(res.data.ticket);
            }
        } catch (error) {
            console.error('Error redeeming perk:', error);
        } finally {
            setActionLoading(false);
            resumeCountdown();
        }
    };

    // ============ RENDER ============

    if (phase === 'scanning') {
        return (
            <div className="kiosk-container">
                <div className="kiosk-header">
                    <QrCode size={64} color="var(--primary)" />
                    <h1 className="kiosk-title">Escanea tu pase</h1>
                    <p className="kiosk-subtitle">Presenta el código QR de tu Google Wallet o Apple Wallet</p>
                </div>
                <div className="kiosk-scanner">
                    <KioskScanner onScan={handleScan} />
                </div>
                <button
                    className="kiosk-exit-btn"
                    onClick={onExit}
                    style={{ position: 'fixed', bottom: 20, right: 20, width: 'auto', padding: '8px 16px', fontSize: '12px', opacity: 0.5, background: 'var(--surface-color)' }}
                >
                    Salir del modo kiosco
                </button>
            </div>
        );
    }

    if (phase === 'processing') {
        return (
            <div className="kiosk-container kiosk-center">
                <Loader2 size={64} className="animate-spin" color="var(--primary)" />
                <h2 style={{ marginTop: 24 }}>Registrando visita...</h2>
            </div>
        );
    }

    if (phase === 'error') {
        return (
            <div className="kiosk-container kiosk-center">
                <AlertTriangle size={64} color="var(--danger)" />
                <h2 style={{ marginTop: 24, color: 'var(--danger)' }}>{errorMsg}</h2>
                <p className="text-muted" style={{ marginTop: 12 }}>Regresando al escáner...</p>
            </div>
        );
    }

    // phase === 'result'
    const { customer, perks, pendingGifts } = customerData || {};
    const hasBenefits = (pendingGifts && pendingGifts.length > 0) || (perks && perks.some(p => customer?.points_balance >= p.cost_points));

    return (
        <div className="kiosk-container" onClick={() => { if (!interactionRef.current) pauseCountdown(); }}>
            {/* Countdown bar */}
            <div className="kiosk-countdown-bar">
                <div
                    className="kiosk-countdown-fill"
                    style={{ width: `${(countdown / timeout) * 100}%` }}
                />
            </div>

            {/* Success message */}
            <div className="kiosk-success animate-slide-up">
                <CheckCircle size={80} color="var(--success)" />
                <h1 style={{ marginTop: 16 }}>
                    ¡Bienvenido{customer?.name ? `, ${customer.name.split(' ')[0]}` : ''}!
                </h1>
                <p className="text-muted" style={{ fontSize: '1.2em', marginTop: 8 }}>
                    Visita registrada exitosamente
                </p>

                {/* Stats */}
                <div className="kiosk-stats">
                    <div className="kiosk-stat">
                        <span className="kiosk-stat-value">{checkinResult?.points || customer?.points_balance || 0}</span>
                        <span className="kiosk-stat-label">Puntos</span>
                    </div>
                    <div className="kiosk-stat">
                        <span className="kiosk-stat-value">{checkinResult?.visits || customer?.visits_count || 0}</span>
                        <span className="kiosk-stat-label">Visitas</span>
                    </div>
                    {checkinResult?.tierName && (
                        <div className="kiosk-stat">
                            <span className="kiosk-stat-value">{checkinResult.tierName}</span>
                            <span className="kiosk-stat-label">Nivel</span>
                        </div>
                    )}
                </div>

                {/* Cycle progress */}
                {checkinResult?.cycleProgress && (
                    <div className="kiosk-cycle">
                        <p>Progreso: <strong>{checkinResult.cycleProgress.visitsCompleted}/{checkinResult.cycleProgress.visitsRequired}</strong> visitas para tu recompensa</p>
                    </div>
                )}

                {/* Cycle reward notification */}
                {checkinResult?.cycleCompleted && (
                    <div className="kiosk-reward animate-slide-up">
                        <Star size={32} color="#FBBF24" />
                        <h3>¡Ciclo completado!</h3>
                        {checkinResult.rewardName && <p>Ganaste: <strong>{checkinResult.rewardName}</strong></p>}
                    </div>
                )}
            </div>

            {/* Benefits section */}
            {hasBenefits && (
                <div className="kiosk-benefits animate-slide-up">
                    {/* Pending gifts */}
                    {pendingGifts && pendingGifts.length > 0 && (
                        <div className="kiosk-section">
                            <h3><Star size={20} style={{ verticalAlign: 'middle' }} /> Cortesías Disponibles</h3>
                            {pendingGifts.map(gift => (
                                <div key={gift.id} className="kiosk-benefit-item kiosk-gift">
                                    <div>
                                        <strong>{gift.perks?.name || 'Cortesía'}</strong>
                                        <span className="text-muted"> — GRATIS</span>
                                    </div>
                                    <button
                                        className="btn-success"
                                        style={{ width: 'auto', padding: '12px 24px' }}
                                        onClick={() => handleRedeemGift(gift.id)}
                                        disabled={actionLoading}
                                    >
                                        <Gift size={18} /> Redimir
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Redeemable perks */}
                    {perks && perks.filter(p => customer?.points_balance >= p.cost_points).length > 0 && (
                        <div className="kiosk-section">
                            <h3><Gift size={20} style={{ verticalAlign: 'middle' }} /> Canjear con Puntos</h3>
                            {perks.filter(p => customer?.points_balance >= p.cost_points).map(perk => (
                                <div key={perk.id} className="kiosk-benefit-item">
                                    <div>
                                        <strong>{perk.name}</strong>
                                        <span className="text-muted"> — {perk.cost_points} pts</span>
                                    </div>
                                    <button
                                        className="btn-primary"
                                        style={{ width: 'auto', padding: '12px 24px' }}
                                        onClick={() => handleRedeem(perk.id)}
                                        disabled={actionLoading}
                                    >
                                        <Gift size={18} /> Canjear
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Timer display */}
            <div className="kiosk-timer">
                <Clock size={16} />
                <span>{countdown}s</span>
            </div>

            {/* Manual return button */}
            <button
                className="kiosk-back-btn"
                onClick={resetToScanner}
            >
                Volver al escáner
            </button>
        </div>
    );
};

/**
 * Inner scanner component for kiosk mode.
 * Re-initializes cleanly on each mount.
 */
const KioskScanner = ({ onScan }) => {
    const hasScanned = useRef(false);

    useEffect(() => {
        hasScanned.current = false;

        const scanner = new Html5QrcodeScanner(
            "kiosk-reader",
            { fps: 10, qrbox: { width: 300, height: 300 }, aspectRatio: 1.0 },
            false
        );

        scanner.render(
            (decodedText) => {
                if (hasScanned.current) return;
                hasScanned.current = true;
                scanner.clear().catch(() => {});
                onScan(decodedText);
            },
            () => {} // Ignore errors
        );

        return () => {
            scanner.clear().catch(() => {});
        };
    }, [onScan]);

    return <div id="kiosk-reader"></div>;
};

export default KioskMode;
