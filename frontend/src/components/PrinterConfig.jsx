import React, { useState } from 'react';
import { Printer, Save, X, Wifi, Usb, Monitor, Plus, Trash2 } from 'lucide-react';
import { getPrinterConfig, savePrinterConfig, printRedemptionTicket } from '../utils/printer';

const PrinterConfig = ({ onClose }) => {
    const [config, setConfig] = useState(getPrinterConfig());
    const [saved, setSaved] = useState(false);
    
    // Detectar iOS/iPad
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const handleSave = () => {
        savePrinterConfig(config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleTestPrint = (printerIndex) => {
        printRedemptionTicket({
            customerName: 'Cliente de Prueba',
            perkName: 'Bebida Gratis',
            perkDescription: 'Ticket de prueba',
            redeemedAt: new Date().toISOString(),
            type: 'test'
        }, printerIndex);
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

    // Migrar config vieja (single IP) a nuevo formato (array de printers)
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
                        <div style={{ fontSize: '0.8rem' }}>Navegador</div>
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
                        <label className="text-muted" style={{ display: 'block', marginBottom: '6px', fontSize: '0.8rem' }}>Print Bridge (esta PC o la del local)</label>
                        <input
                            type="text"
                            value={config.printBridgeUrl || ''}
                            onChange={e => setConfig({ ...config, printBridgeUrl: e.target.value })}
                            placeholder="https://127.0.0.1:4001"
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'var(--surface-color)', color: 'var(--text-main)', fontSize: '0.9rem' }}
                        />
                        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                            En esta PC usa <code>https://127.0.0.1:4001</code> (Print Bridge). El navegador no puede hablar TCP directo a la impresora.
                        </span>
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
                            No hay impresoras configuradas. Haz clic en "Agregar" para añadir una.
                        </p>
                    )}

                    {(config.printers || []).map((printer, index) => (
                        <div key={index} style={{ background: 'var(--surface-color)', borderRadius: '10px', padding: '12px', marginBottom: '10px', border: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <input
                                    type="text"
                                    value={printer.name}
                                    onChange={e => updatePrinter(index, 'name', e.target.value)}
                                    placeholder="Nombre"
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
                                    placeholder="192.168.0.100"
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
                                    title="Test"
                                >
                                    <Printer size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {config.method === 'serial' && (
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '16px' }}>
                    Al imprimir, el navegador te pedirá seleccionar el puerto USB de la impresora. 
                    Requiere Chrome o Edge. La impresora debe estar conectada por USB.
                </p>
            )}

            {config.method === 'browser' && (
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '16px' }}>
                    {isIOS 
                        ? 'Al redimir un beneficio, se mostrará el ticket y aparecerá el diálogo de impresión de iOS. Selecciona tu impresora AirPrint o guarda como PDF.'
                        : 'Se abrirá una ventana de impresión del navegador. Selecciona tu impresora térmica desde el diálogo de impresión del sistema.'
                    }
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
