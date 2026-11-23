import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { CheckCircle, Gift, Star, Loader2, AlertTriangle, Clock, QrCode, ScanLine } from 'lucide-react';
import { printRedemptionTicket } from '../utils/printer';
import { useBarcodeScanner, extractCustomerId, isValidCustomerId } from '../utils/useBarcodeScanner';
import KioskBranding from './KioskBranding';

async function shouldUseCamera() {
    const pref = localStorage.getItem('kiosk_camera') || 'auto';
    if (pref === 'off') return false;
    if (pref === 'on') return true;
    try {
        if (!navigator.mediaDevices?.enumerateDevices) return false;
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.some((d) => d.kind === 'videoinput');
    } catch {
        return false;
    }
}

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

/**
 * KioskMode — Modo automático de check-in para pantalla grande.
 *
 * Métodos de escaneo (coexisten):
 *  - Lector USB de código de barras/QR (HID keyboard-wedge) — método principal
 *  - Cámara del dispositivo (html5-qrcode) — método secundario
 *
 * Flujo:
 * 1. Muestra escáner (cámara) + escucha lector USB en pantalla completa
 * 2. Al escanear, ejecuta check-in automáticamente (single request)
 * 3. Muestra resultado (éxito + beneficios si hay)
 * 4. Countdown de INACTIVIDAD configurable: cada interacción del usuario lo
 *    reinicia desde cero; si no hay interacción, vuelve al escáner al llegar a 0
 */
const KioskMode = ({ timeout = 20, onExit }) => {
    const [phase, setPhase] = useState('scanning'); // scanning | processing | result | error
    const [customerData, setCustomerData] = useState(null);
    const [checkinResult, setCheckinResult] = useState(null);
    const [countdown, setCountdown] = useState(timeout);
    const [errorMsg, setErrorMsg] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [useCamera, setUseCamera] = useState(false);
    const [branding, setBranding] = useState({ name: '', kiosk_media: [] });

    const countdownRef = useRef(null);
    const phaseRef = useRef(phase);
    const processingRef = useRef(false); // evita escaneos concurrentes

    const tenantSlug = localStorage.getItem('staff_slug') || '';

    const handleExit = useCallback((e) => {
        e?.preventDefault?.();
        e?.stopPropagation?.();
        onExit?.();
    }, [onExit]);

    useEffect(() => {
        shouldUseCamera().then(setUseCamera);
        if (!tenantSlug) return;
        axios.get(`${API_URL}/kiosk/display`, { params: { tenant_slug: tenantSlug } })
            .then((res) => setBranding(res.data || { kiosk_media: [] }))
            .catch(() => {});
    }, [tenantSlug]);

    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            onExit?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onExit]);

    // Mantener phaseRef sincronizado para usarlo dentro de callbacks estables
    useEffect(() => { phaseRef.current = phase; }, [phase]);

    // ---------- Countdown de inactividad ----------
    const stopCountdown = useCallback(() => {
        if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
        }
    }, []);

    const resetToScanner = useCallback(() => {
        stopCountdown();
        setPhase('scanning');
        setCustomerData(null);
        setCheckinResult(null);
        setErrorMsg('');
        setCountdown(timeout);
        setCurrentPoints(0);
        processingRef.current = false;
    }, [timeout, stopCountdown]);

    // Inicia (o reinicia) el countdown desde el timeout completo.
    // Llamado al entrar a 'result' y en CADA interacción del usuario.
    const restartCountdown = useCallback(() => {
        if (phaseRef.current !== 'result') return;
        stopCountdown();
        setCountdown(timeout);
        countdownRef.current = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    stopCountdown();
                    resetToScanner();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, [timeout, stopCountdown, resetToScanner]);

    // Arranca el countdown al entrar a la fase de resultado
    useEffect(() => {
        if (phase === 'result') {
            restartCountdown();
        }
        return () => stopCountdown();
    }, [phase, restartCountdown, stopCountdown]);

    // Fase de error: vuelve al escáner tras 5s
    useEffect(() => {
        if (phase === 'error') {
            const timer = setTimeout(() => resetToScanner(), 5000);
            return () => clearTimeout(timer);
        }
    }, [phase, resetToScanner]);

    // Limpieza global al desmontar
    useEffect(() => () => stopCountdown(), [stopCountdown]);

    // ---------- Escaneo (cámara + lector USB) ----------
    const handleScan = useCallback(async (decodedText) => {
        // Evitar procesamiento concurrente o fuera de la fase de escaneo
        if (processingRef.current) return;
        if (phaseRef.current !== 'scanning') return;

        const customerId = extractCustomerId(decodedText);
        if (!isValidCustomerId(customerId)) {
            setErrorMsg('Código no válido');
            setPhase('error');
            return;
        }

        processingRef.current = true;
        setPhase('processing');

        try {
            const res = await axios.post(`${API_URL}/checkin/kiosk`, {
                customerId,
                scannedBy: 'Kiosk',
                tenant_slug: tenantSlug
            });

            const { checkin, customer, perks, pendingGifts } = res.data;
            setCheckinResult(checkin);
            setCustomerData({ customer, perks, pendingGifts });
            setCurrentPoints(checkin.points);
            setPhase('result');
        } catch (error) {
            const msg = error.response?.data?.error || 'Error al registrar visita';
            setErrorMsg(msg);
            setPhase('error');
        } finally {
            processingRef.current = false;
        }
    }, [tenantSlug]);

    // Lector USB (HID): activo solo durante la fase de escaneo
    useBarcodeScanner(handleScan, { enabled: phase === 'scanning' });

    // ---------- Redenciones ----------
    const handleRedeemGift = async (giftId) => {
        restartCountdown(); // la interacción reinicia el contador
        setActionLoading(true);
        try {
            const res = await axios.post(`${API_URL}/redemption/gift`, {
                customerId: customerData.customer.id,
                giftId,
                redeemedBy: 'Kiosk',
                tenant_slug: tenantSlug
            });
            const newPoints = res.data.remainingPoints;
            setCurrentPoints(newPoints);
            setCustomerData(prev => ({
                ...prev,
                customer: { ...prev.customer, points_balance: newPoints },
                pendingGifts: prev.pendingGifts.filter(g => g.id !== giftId)
            }));
            if (res.data.ticket) printRedemptionTicket(res.data.ticket, { target: 'bar' });
        } catch (error) {
            console.error('Error redeeming gift:', error);
        } finally {
            setActionLoading(false);
            restartCountdown();
        }
    };

    const handleRedeem = async (perkId) => {
        restartCountdown();
        setActionLoading(true);
        try {
            const res = await axios.post(`${API_URL}/redemption`, {
                customerId: customerData.customer.id,
                perkId,
                redeemedBy: 'Kiosk',
                tenant_slug: tenantSlug
            });
            const newPoints = res.data.remainingPoints;
            setCurrentPoints(newPoints);
            setCustomerData(prev => ({
                ...prev,
                customer: { ...prev.customer, points_balance: newPoints }
            }));
            setCheckinResult(prev => prev ? { ...prev, points: newPoints } : prev);
            if (res.data.ticket) printRedemptionTicket(res.data.ticket, { target: 'bar' });
        } catch (error) {
            console.error('Error redeeming perk:', error);
        } finally {
            setActionLoading(false);
            restartCountdown();
        }
    };

    // Cualquier interacción del usuario en la vista de resultado reinicia el contador
    const handleUserActivity = useCallback(() => {
        if (phaseRef.current === 'result') restartCountdown();
    }, [restartCountdown]);

    // ============ RENDER ============

    if (phase === 'scanning') {
        return (
            <div className="kiosk-container kiosk-idle">
                <KioskBranding media={branding.kiosk_media} />
                <div className="kiosk-idle-overlay">
                    <div className="kiosk-header">
                        {branding.wallet_logo_url && (
                            <img src={branding.wallet_logo_url} alt="" className="kiosk-brand-logo" />
                        )}
                        <QrCode size={56} color="var(--primary)" />
                        <h1 className="kiosk-title">Escanea tu pase</h1>
                        <p className="kiosk-subtitle">
                            {useCamera
                                ? 'Acerca tu código al lector o usa la cámara'
                                : 'Acerca tu código al lector'}
                        </p>
                        <div className="kiosk-reader-hint">
                            <ScanLine size={18} /> Lector activo — presenta tu QR
                        </div>
                    </div>
                    {useCamera && (
                        <div className="kiosk-scanner">
                            <KioskScanner onScan={handleScan} />
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    className="kiosk-exit-btn"
                    onClick={handleExit}
                    style={{ width: 'auto', padding: '10px 18px', fontSize: '13px', background: 'var(--surface-color)' }}
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
                <button
                    type="button"
                    className="kiosk-exit-btn"
                    onClick={handleExit}
                    style={{ width: 'auto', padding: '10px 18px', fontSize: '13px', background: 'var(--surface-color)' }}
                >
                    Salir del modo kiosco
                </button>
            </div>
        );
    }

    if (phase === 'error') {
        return (
            <div className="kiosk-container kiosk-center">
                <AlertTriangle size={64} color="var(--danger)" />
                <h2 style={{ marginTop: 24, color: 'var(--danger)' }}>{errorMsg}</h2>
                <p className="text-muted" style={{ marginTop: 12 }}>Regresando al escáner...</p>
                <button
                    type="button"
                    className="kiosk-exit-btn"
                    onClick={handleExit}
                    style={{ width: 'auto', padding: '10px 18px', fontSize: '13px', background: 'var(--surface-color)' }}
                >
                    Salir del modo kiosco
                </button>
            </div>
        );
    }

    // phase === 'result'
    const { customer, perks, pendingGifts } = customerData || {};
    const hasBenefits = (pendingGifts && pendingGifts.length > 0) || (perks && perks.some(p => currentPoints >= p.cost_points));

    return (
        <div
            className="kiosk-container"
            onClick={handleUserActivity}
            onTouchStart={handleUserActivity}
            onScroll={handleUserActivity}
            onMouseMove={handleUserActivity}
        >
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

                {/* Stats — always use currentPoints for accuracy */}
                <div className="kiosk-stats">
                    <div className="kiosk-stat">
                        <span className="kiosk-stat-value">{currentPoints}</span>
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
                    {perks && perks.filter(p => currentPoints >= p.cost_points).length > 0 && (
                        <div className="kiosk-section">
                            <h3><Gift size={20} style={{ verticalAlign: 'middle' }} /> Canjear con Puntos</h3>
                            {perks.filter(p => currentPoints >= p.cost_points).map(perk => (
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
            <button
                type="button"
                className="kiosk-exit-btn"
                onClick={handleExit}
                style={{ width: 'auto', padding: '10px 18px', fontSize: '13px', background: 'var(--surface-color)' }}
            >
                Salir del modo kiosco
            </button>
        </div>
    );
};

/**
 * Inner scanner component for kiosk mode (cámara).
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
