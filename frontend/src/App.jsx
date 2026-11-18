import React, { useState } from 'react';
import Scanner from './components/Scanner';
import CustomerProfile from './components/CustomerProfile';
import PrinterConfig from './components/PrinterConfig';
import KioskMode from './components/KioskMode';
import StaffLogin from './components/StaffLogin';
import CoverDispatch from './components/CoverDispatch';
import { QrCode, Settings, LogOut, Monitor, ScanLine, Ticket } from 'lucide-react';
import { useBarcodeScanner, extractCustomerId, isValidCustomerId } from './utils/useBarcodeScanner';

function App() {
  const [scannedId, setScannedId] = useState(null);
  const [showPrinterConfig, setShowPrinterConfig] = useState(false);
  const [showKioskSettings, setShowKioskSettings] = useState(false);
  const [showCover, setShowCover] = useState(false);
  const [kioskCamera, setKioskCamera] = useState(
    () => localStorage.getItem('kiosk_camera') || 'auto'
  );
  const [kioskActive, setKioskActive] = useState(false);
  const [kioskTimeout, setKioskTimeout] = useState(
    () => parseInt(localStorage.getItem('kiosk_timeout') || '20', 10)
  );
  const [token, setToken] = useState(localStorage.getItem('staff_token'));
  const [tenantName, setTenantName] = useState(localStorage.getItem('staff_tenant_name') || '');

  const handleLogin = (loginData) => {
    localStorage.setItem('staff_token', loginData.token);
    localStorage.setItem('staff_tenant_name', loginData.tenant?.name || '');
    setToken(loginData.token);
    setTenantName(loginData.tenant?.name || '');
  };

  const handleLogout = () => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_tenant_name');
    setToken(null);
    setTenantName('');
  };

  const handleScanSuccess = (decodedText) => {
    const customerId = extractCustomerId(decodedText);
    setScannedId(customerId);
  };

  const handleReset = () => {
    setScannedId(null);
  };

  // Lector USB (HID) como método secundario en el flujo normal de staff.
  // Activo solo en la vista de escaneo (sin cliente seleccionado ni paneles abiertos).
  const usbScanEnabled = !!token && !kioskActive && !scannedId && !showPrinterConfig && !showKioskSettings && !showCover;

  const closePanels = () => {
    setShowPrinterConfig(false);
    setShowKioskSettings(false);
    setShowCover(false);
  };
  useBarcodeScanner((code) => {
    const customerId = extractCustomerId(code);
    if (isValidCustomerId(customerId)) {
      setScannedId(customerId);
    }
  }, { enabled: usbScanEnabled });

  const handleKioskTimeoutChange = (value) => {
    const val = Math.max(5, Math.min(120, parseInt(value, 10) || 20));
    setKioskTimeout(val);
    localStorage.setItem('kiosk_timeout', val.toString());
  };

  const activateKiosk = () => {
    setKioskActive(true);
    setShowKioskSettings(false);
  };

  if (!token) {
    return <StaffLogin onLogin={handleLogin} />;
  }

  // Kiosk mode (full screen, autonomous)
  if (kioskActive) {
    return <KioskMode timeout={kioskTimeout} onExit={() => setKioskActive(false)} />;
  }

  return (
    <>
      <header className="text-center mb-4" style={{ position: 'relative' }}>
        <h1>{tenantName || 'SW Loyalty'}</h1>
        <p className="text-muted">Staff Portal</p>
        <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 4 }}>
          <button
            onClick={() => { closePanels(); setShowCover(!showCover); }}
            style={{ background: 'transparent', padding: '8px', width: 'auto', color: 'var(--text-muted)' }}
            title="Despachar cover"
          >
            <Ticket size={22} />
          </button>
          <button
            onClick={() => { closePanels(); setShowKioskSettings(!showKioskSettings); }}
            style={{ background: 'transparent', padding: '8px', width: 'auto', color: 'var(--text-muted)' }}
            title="Modo Kiosco"
          >
            <Monitor size={22} />
          </button>
          <button
            onClick={() => { closePanels(); setShowPrinterConfig(!showPrinterConfig); }}
            style={{ background: 'transparent', padding: '8px', width: 'auto', color: 'var(--text-muted)' }}
            title="Configurar Impresora"
          >
            <Settings size={22} />
          </button>
          <button
            onClick={handleLogout}
            style={{ background: 'transparent', padding: '8px', width: 'auto', color: 'var(--text-muted)' }}
            title="Cerrar sesión"
          >
            <LogOut size={22} />
          </button>
        </div>
      </header>

      <main className="animate-slide-up">
        {showKioskSettings ? (
          <div className="card">
            <h2 className="mb-4"><Monitor size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} /> Modo Kiosco</h2>
            <p className="text-muted mb-4">
              El modo kiosco permite el check-in automático en una pantalla grande sin necesidad de interacción del staff. 
              Al escanear un QR, la visita se registra automáticamente.
            </p>
            
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Cámara en kiosco
              </label>
              <p className="text-muted" style={{ fontSize: '0.85em', marginBottom: 8 }}>
                En una PC sin cámara déjalo en automático o desactívalo para no mostrar “Request Camera Permissions”.
              </p>
              <select
                value={kioskCamera}
                onChange={(e) => {
                  setKioskCamera(e.target.value);
                  localStorage.setItem('kiosk_camera', e.target.value);
                }}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--glass-border)',
                  background: 'var(--surface-color)', color: 'var(--text-main)'
                }}
              >
                <option value="auto">Automático (ocultar si no hay cámara)</option>
                <option value="off">Nunca usar cámara (solo lector USB)</option>
                <option value="on">Forzar cámara</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Tiempo de espera (segundos)
              </label>
              <p className="text-muted" style={{ fontSize: '0.85em', marginBottom: 8 }}>
                Tiempo que se muestra la pantalla de resultado antes de volver al escáner. 
                Si el cliente tiene beneficios, puede interactuar durante este tiempo.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range"
                  min="5"
                  max="120"
                  value={kioskTimeout}
                  onChange={(e) => handleKioskTimeoutChange(e.target.value)}
                  style={{ flex: 1, accentColor: 'var(--primary)' }}
                />
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={kioskTimeout}
                  onChange={(e) => handleKioskTimeoutChange(e.target.value)}
                  style={{ 
                    width: 70, padding: '8px 12px', borderRadius: 8, 
                    border: '1px solid var(--glass-border)', 
                    background: 'var(--surface-color)', color: 'var(--text-main)',
                    textAlign: 'center', fontSize: '16px'
                  }}
                />
                <span className="text-muted">seg</span>
              </div>
            </div>

            <button className="btn-primary" onClick={activateKiosk} style={{ marginBottom: 12 }}>
              <Monitor size={20} /> Activar Modo Kiosco
            </button>
            <button
              onClick={() => setShowKioskSettings(false)}
              style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}
            >
              Cancelar
            </button>
          </div>
        ) : showCover ? (
          <CoverDispatch onClose={() => setShowCover(false)} />
        ) : showPrinterConfig ? (
          <PrinterConfig onClose={() => setShowPrinterConfig(false)} />
        ) : !scannedId ? (
          <div className="card text-center">
            <QrCode size={48} color="var(--primary)" className="mb-4" style={{ margin: '0 auto' }} />
            <h2 className="mb-2">Escanear Pase</h2>
            <p className="text-muted mb-4">Usa el lector USB o apunta la cámara al código QR del cliente.</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--success)', marginBottom: 12 }}>
              <ScanLine size={16} /> Lector USB activo
            </div>
            <Scanner onScanSuccess={handleScanSuccess} />
          </div>
        ) : (
          <CustomerProfile customerId={scannedId} onReset={handleReset} />
        )}
      </main>
    </>
  );
}

export default App;
