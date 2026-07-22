import React, { useState } from 'react';
import Scanner from './components/Scanner';
import CustomerProfile from './components/CustomerProfile';
import PrinterConfig from './components/PrinterConfig';
import StaffLogin from './components/StaffLogin';
import { QrCode, Settings, LogOut } from 'lucide-react';

function App() {
  const [scannedId, setScannedId] = useState(null);
  const [showPrinterConfig, setShowPrinterConfig] = useState(false);
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
    let customerId = decodedText.trim();
    if (customerId.includes('.')) {
      customerId = customerId.split('.').pop();
    }
    setScannedId(customerId);
  };

  const handleReset = () => {
    setScannedId(null);
  };

  if (!token) {
    return <StaffLogin onLogin={handleLogin} />;
  }

  return (
    <>
      <header className="text-center mb-4" style={{ position: 'relative' }}>
        <h1>{tenantName || 'SW Loyalty'}</h1>
        <p className="text-muted">Staff Portal</p>
        <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 4 }}>
          <button
            onClick={() => setShowPrinterConfig(!showPrinterConfig)}
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
        {showPrinterConfig ? (
          <PrinterConfig onClose={() => setShowPrinterConfig(false)} />
        ) : !scannedId ? (
          <div className="card text-center">
            <QrCode size={48} color="var(--primary)" className="mb-4" style={{ margin: '0 auto' }} />
            <h2 className="mb-2">Escanear Pase</h2>
            <p className="text-muted mb-4">Apunta la cámara al código QR de Google Wallet del cliente.</p>
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
