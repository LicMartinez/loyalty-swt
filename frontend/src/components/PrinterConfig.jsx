import React, { useEffect, useState } from 'react';
import { Printer, Save, X, Wifi, Usb, Monitor, Plus, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import {
    getPrinterConfig,
    savePrinterConfig,
    printRedemptionTicket,
    checkPrintBridge,
    probePrinter,
} from '../utils/printer';

const PrinterConfig = ({ onClose }) => {
    const [config, setConfig] = useState(getPrinterConfig());
    const [saved, setSaved] = useState(false);
    const [bridgeStatus, setBridgeStatus] = useState({ checking: false, ok: null, error: '', url: '' });
    const [testMsg, setTestMsg] = useState('');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const persist = (next = config) => {
        savePrinterConfig(next);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const pingBridge = async (next = config) => {
        setBridgeStatus((s) => ({ ...s, checking: true }));
        const result = await checkPrintBridge(next);
        setBridgeStatus({ checking: false, ...result });
        return result;
    };

    useEffect(() => {
        if (config.method === 'network') pingBridge(config);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.method, config.printBridgeUrl]);

    const handleSave = () => persist(config);

    const handleTestPrint = async (printerIndex) => {
        persist(config);
        setTestMsg('Probando…');
        const printer = (config.printers || [])[printerIndex];
        if (config.method === 'network') {
            const bridge = await pingBridge(config);
            if (!bridge.ok) {
                setTestMsg(bridge.error);
                alert(
                    `${bridge.error}\n\nEn Windows, Print Bridge debe estar corriendo en esta misma PC:\ncd print-bridge\nnode index.js\n\nLuego abre ${bridge.url || 'https://127.0.0.1:4001'} y acepta el certificado.\n\nAlternativa: cambia el método a “Navegador” y elige la impresora COVER instalada.`
                );
                return;
            }
            const probe = await probePrinter(config, printer);
            if (!probe.ok) {
                setTestMsg(probe.error);
                alert(
                    `${probe.error}\n\nLa impresora COVER de Windows usa el puerto TCP/IP ${printer?.ip || '192.168.0.10'}:9100. Verifica que esa IP responda en la LAN.\n\nSi Print Bridge no está, usa el método Navegador y selecciona COVER.`
                );
                return;
            }
        }
        await printRedemptionTicket({
            customerName: 'Cliente de Prueba',
            perkName: 'Bebida Gratis',
            perkDescription: 'Ticket de prueba',
            redeemedAt: new Date().toISOString(),
            type: 'test',
        }, printerIndex, config);
        setTestMsg('Ticket de prueba enviado.');
    };

    const addPrinter = () => {
        const printers = [...(config.printers || []), {
            name: `Impresora ${(config.printers || []).length + 1}`,
            ip: '',
            port: 9100,
            role: 'bar',
        }];
        setConfig({ ...config, printers });
    };

    const removePrinter = (index) => {
        const printers = [...(config.printers || [])];
        printers.splice(index, 1);
        setConfig({ ...config, printers });
    };

    const updatePrinter = (index, field, value) => {
        const printers = [...(config.printers || [])];
        printers[index] = { ...printers[index], [field]: value };
        setConfig({ ...config, printers });
    };

    const printers = config.printers || (config.networkIp ? [{ name: 'Impresora 1', ip: config.networkIp, port: config.networkPort || 9100 }] : []);
    if (!config.printers && config.networkIp) {
        config.printers = printers;
    }

    return (
        <div className="card animate-slide-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Printer size={20} /> Configurar Impresoras
                </h3>
                <button onClick={onClose} style={{ background: 'transparent', padding: '8px', width: 'auto', color: 'var(--text-muted)' }}>
                    <X size={20} />
                </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label className="text-muted" style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem' }}>Método de impresión</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setConfig({ ...config, method: 'browser' })}
                        style={{
                            flex: 1, padding: '14px', borderRadius: '12px', border: `2px solid ${config.method === 'browser' ? 'var(--primary)' : 'var(--glass-border)'}`,
                            background: config.method === 'browser' ? 'rgba(59,130,246,0.1)' : 'var(--surface-color)',
                            color: 'var(--text-main)', cursor: 'pointer', textAlign: 'center', width: 'auto'
                        }}
                    >
                        <Monitor size={24} style={{ margin: '0 auto 6px', display: 'block' }} />
                        <div style={{ fontSize: '0.8rem' }}>Navegador / Windows</div>
                    </button>
                    {!isIOS && (
                        <button
                            onClick={() => setConfig({ ...config, method: 'serial' })}
                            style={{
                                flex: 1, padding: '14px', borderRadius: '12px', border: `2px solid ${config.method === 'serial' ? 'var(--primary)' : 'var(--glass-border)'}`,
                                background: config.method === 'serial' ? 'rgba(59,130,246,0.1)' : 'var(--surface-color)',
                                color: 'var(--text-main)', cursor: 'pointer', textAlign: 'center', width: 'auto'
                            }}
                        >
                            <Usb size={24} style={{ margin: '0 auto 6px', display: 'block' }} />
                            <div style={{ fontSize: '0.8rem' }}>USB Directo</div>
                        </button>
                    )}
                    <button
                        onClick={() => setConfig({ ...config, method: 'network' })}
                        style={{
                            flex: 1, padding: '14px', borderRadius: '12px', border: `2px solid ${config.method === 'network' ? 'var(--primary)' : 'var(--glass-border)'}`,
                            background: config.method === 'network' ? 'rgba(59,130,246,0.1)' : 'var(--surface-color)',
                            color: 'var(--text-main)', cursor: 'pointer', textAlign: 'center', width: 'auto'
                        }}
                    >
                        <Wifi size={24} style={{ margin: '0 auto 6px', display: 'block' }} />
                        <div style={{ fontSize: '0.8rem' }}>Red (IP)</div>
                    </button>
                </div>
            </div>

            {config.method === 'network' && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ marginBottom: '12px' }}>
                        <label className="text-muted" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem' }}>Print Bridge (esta PC)</label>
                        <input
                            type="text"
                            value={config.printBridgeUrl || ''}
                            onChange={e => setConfig({ ...config, printBridgeUrl: e.target.value })}
                            placeholder="https://127.0.0.1:4001"
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                        />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                            {bridgeStatus.checking ? (
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Comprobando Print Bridge…</span>
                            ) : bridgeStatus.ok ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle size={14} /> Print Bridge listo
                                </span>
                            ) : (
                                <span style={{ fontSize: '0.8rem', color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <AlertTriangle size={14} /> {bridgeStatus.error || 'Print Bridge no responde'}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => pingBridge(config)}
                                style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-main)', width: 'auto', fontSize: '0.75rem' }}
                            >
                                Reintentar
                            </button>
                            <a
                                href={config.printBridgeUrl || 'https://127.0.0.1:4001'}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '0.75rem', color: 'var(--primary)' }}
                            >
                                Abrir y aceptar certificado
                            </a>
                        </div>
                        <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: 8, lineHeight: 1.45 }}>
                            El navegador no habla TCP con la impresora. En esta PC Windows hay que dejar Print Bridge corriendo
                            (<code>cd print-bridge</code> → <code>node index.js</code>) y aceptar el certificado de
                            {' '}<code>https://127.0.0.1:4001</code>.
                            La impresora COVER instalada en Windows (puerto TCP/IP 192.168.0.10:9100) es el mismo destino: pon esa IP aquí
                            y márcala como <strong>Cover (exclusiva)</strong>.
                        </p>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <label className="text-muted" style={{ fontSize: '0.85rem' }}>Impresoras IP</label>
                        <button
                            onClick={addPrinter}
                            style={{ background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4, width: 'auto' }}
                        >
                            <Plus size={14} /> Agregar por IP
                        </button>
                    </div>
                    <p className="text-muted" style={{ fontSize: '0.75rem', marginBottom: 10 }}>
                        <strong>Barra:</strong> tragos y canjes — se imprimen en todas las de barra.{' '}
                        <strong>Cover:</strong> boletos de acceso — 1 sola impresión en esa impresora.
                    </p>

                    {(config.printers || []).length === 0 && (
                        <p className="text-muted" style={{ fontSize: '0.8rem', textAlign: 'center', padding: '16px' }}>
                            No hay impresoras configuradas. Haz clic en "Agregar por IP" para añadir una.
                        </p>
                    )}

                    {(config.printers || []).map((printer, index) => (
                        <div key={index} style={{ background: 'var(--surface-color)', borderRadius: '10px', padding: '12px', marginBottom: '10px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    value={printer.name}
                                    onChange={e => updatePrinter(index, 'name', e.target.value)}
                                    placeholder="Nombre (ej. COVER)"
                                    style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', fontWeight: 'bold', fontSize: '0.9rem', padding: 0, width: '60%' }}
                                />
                                <button
                                    onClick={() => removePrinter(index)}
                                    style={{ background: 'transparent', padding: '4px', width: 'auto', color: 'var(--text-muted)' }}
                                    title="Eliminar"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    value={printer.ip}
                                    onChange={e => updatePrinter(index, 'ip', e.target.value)}
                                    placeholder="192.168.0.10"
                                    style={{ flex: 2, minWidth: 120, padding: '8px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                />
                                <input
                                    type="number"
                                    value={printer.port}
                                    onChange={e => updatePrinter(index, 'port', parseInt(e.target.value) || 9100)}
                                    style={{ width: 80, padding: '8px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                />
                                <select
                                    value={printer.role || 'bar'}
                                    onChange={e => updatePrinter(index, 'role', e.target.value)}
                                    style={{ flex: 1, minWidth: 140, padding: '8px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--bg-color)', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                >
                                    <option value="bar">Barra (todas)</option>
                                    <option value="cover">Cover (exclusiva)</option>
                                </select>
                                <button
                                    onClick={() => handleTestPrint(index)}
                                    style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 12px', cursor: 'pointer', color: 'var(--text-main)', width: 'auto' }}
                                    title="Probar impresora"
                                >
                                    <Printer size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {testMsg && <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>{testMsg}</p>}
                </div>
            )}

            {config.method === 'serial' && (
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '16px' }}>
                    Al imprimir, el navegador te pedirá seleccionar el puerto USB de la impresora.
                    Requiere Chrome o Edge. La impresora debe estar conectada por USB.
                </p>
            )}

            {config.method === 'browser' && (
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '16px', lineHeight: 1.45 }}>
                    {isIOS
                        ? 'Al redimir un beneficio, se mostrará el ticket y aparecerá el diálogo de impresión de iOS. Selecciona tu impresora AirPrint o guarda como PDF.'
                        : 'Usa la impresora COVER ya instalada en Windows. Al imprimir se abre el diálogo del sistema: elige COVER (u otra). No hace falta Print Bridge ni IP.'}
                </p>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleSave} className="btn-primary" style={{ flex: 1 }}>
                    <Save size={16} /> {saved ? '¡Guardado!' : 'Guardar'}
                </button>
            </div>
        </div>
    );
};

export default PrinterConfig;
