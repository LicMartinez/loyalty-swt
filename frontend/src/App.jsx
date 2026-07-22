import React, { useState } from 'react';
import Scanner from './components/Scanner';
import CustomerProfile from './components/CustomerProfile';
import PrinterConfig from './components/PrinterConfig';
import { QrCode, Settings } from 'lucide-react';

function App() {
  const [scannedId, setScannedId] = useState(null);
  const [showPrinterConfig, setShowPrinterConfig] = useState(false);

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

  return (
    <>
      <header className="text-center mb-4" style={{ position: 'relative' }}>
        <h1>SW Loyalty</h1>
        <p className="text-muted">Staff Portal</p>
        <button
          onClick={() => setShowPrinterConfig(!showPrinterConfig)}
          style={{ position: 'absolute', top: 0, right: 0, background: 'transparent', padding: '8px', width: 'auto', color: 'var(--text-muted)' }}
          title="Configurar Impresora"
        >
          <Settings size={22} />
        </button>
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
