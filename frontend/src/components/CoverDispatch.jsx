import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Ticket, X, Printer, Loader2 } from 'lucide-react';
import { printRedemptionTicket } from '../utils/printer';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') + '/api';

const CoverDispatch = ({ onClose }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [printingId, setPrintingId] = useState(null);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const tenantSlug = localStorage.getItem('staff_slug') || '';
    const brandName = localStorage.getItem('staff_tenant_name') || '';

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await axios.get(`${API_URL}/cover-products`, { params: { tenant_slug: tenantSlug } });
                if (!cancelled) setProducts(res.data || []);
            } catch (err) {
                if (!cancelled) setError(err.response?.data?.error || 'No se pudieron cargar los boletos de cover');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tenantSlug]);

    const dispatchProduct = async (product) => {
        setError('');
        setOkMsg('');
        setPrintingId(product.id);
        try {
            await axios.post(`${API_URL}/cover-products/${product.id}/dispatch`, {
                tenant_slug: tenantSlug,
                printed_by: 'Staff',
            });
            await printRedemptionTicket({
                ticketKind: 'cover',
                brandName,
                perkName: product.name,
                perkDescription: product.description,
                customerName: '1 ACCESO',
                redeemedAt: new Date().toISOString(),
            }, { target: 'cover' });
            setOkMsg(`Impreso: ${product.name}`);
            setTimeout(() => setOkMsg(''), 2500);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Error al imprimir cover');
        } finally {
            setPrintingId(null);
        }
    };

    return (
        <div className="card animate-slide-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Ticket size={20} /> Despachar cover
                </h3>
                <button onClick={onClose} style={{ background: 'transparent', padding: 8, width: 'auto', color: 'var(--text-muted)' }}>
                    <X size={20} />
                </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                Cada boleto sale <strong>una sola vez</strong> en la impresora marcada como Cover.
                Los tragos y canjes siguen yendo a todas las impresoras de barra.
            </p>

            {loading && <p className="text-muted">Cargando productos…</p>}
            {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}
            {okMsg && <p style={{ color: 'var(--success)', fontSize: '0.85rem', marginBottom: 12 }}>{okMsg}</p>}

            {!loading && products.length === 0 && (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                    No hay productos de cover. Créalos en Admin → Configuración → Boletos de cover.
                </p>
            )}

            {products.map((p) => (
                <button
                    key={p.id}
                    className="btn-primary"
                    style={{ marginBottom: 10 }}
                    disabled={!!printingId}
                    onClick={() => dispatchProduct(p)}
                >
                    {printingId === p.id ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                    {p.name}
                </button>
            ))}
        </div>
    );
};

export default CoverDispatch;
