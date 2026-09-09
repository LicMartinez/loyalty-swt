import { useEffect, useRef } from 'react';

/**
 * useBarcodeScanner — Hook para lectores de código de barras / QR USB (HID keyboard-wedge).
 *
 * Los lectores USB omnidireccionales (ej. Jowvdy) se comportan como un teclado:
 * "teclean" el contenido del código muy rápido y terminan con un Enter.
 * Este hook escucha el teclado globalmente y detecta esa ráfaga rápida:
 * si varios caracteres llegan en < interKeyDelay ms y terminan en Enter,
 * lo interpreta como un escaneo y dispara onScan(code).
 *
 * A diferencia de escribir a mano, un humano no teclea 8+ caracteres en
 * milisegundos, por lo que el umbral de tiempo evita falsos positivos.
 *
 * @param {(code: string) => void} onScan - Callback con el texto escaneado.
 * @param {object} [options]
 * @param {boolean} [options.enabled=true] - Activa/desactiva el listener.
 * @param {number} [options.minLength=6] - Longitud mínima para considerar un escaneo válido.
 * @param {number} [options.interKeyDelay=50] - Máx. ms entre teclas de una misma ráfaga.
 */
export function useBarcodeScanner(onScan, options = {}) {
    const { enabled = true, minLength = 6, interKeyDelay = 50 } = options;
    const bufferRef = useRef('');
    const lastKeyTimeRef = useRef(0);
    const onScanRef = useRef(onScan);

    // Mantener el callback actualizado sin re-registrar el listener
    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        if (!enabled) return;

        const handleKeyDown = (e) => {
            // Ignorar si el foco está en un input/textarea (escritura manual real)
            const tag = (e.target?.tagName || '').toLowerCase();
            const isEditable = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
            if (isEditable) return;

            const now = Date.now();
            const elapsed = now - lastKeyTimeRef.current;

            // Si pasó demasiado tiempo desde la última tecla, es una nueva secuencia
            if (elapsed > interKeyDelay) {
                bufferRef.current = '';
            }
            lastKeyTimeRef.current = now;

            if (e.key === 'Enter') {
                const code = bufferRef.current.trim();
                bufferRef.current = '';
                if (code.length >= minLength) {
                    e.preventDefault();
                    onScanRef.current?.(code);
                }
                return;
            }

            // Solo acumular caracteres imprimibles de longitud 1
            if (e.key.length === 1) {
                bufferRef.current += e.key;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled, minLength, interKeyDelay]);
}

/**
 * Extrae el UUID del cliente de un texto escaneado.
 * Los pases usan el UUID directo, o el formato Google `issuerId.customerId`.
 * @param {string} decodedText
 * @returns {string} customerId
 */
export function extractCustomerId(decodedText) {
    let customerId = String(decodedText || '').trim();
    if (customerId.includes('.')) {
        customerId = customerId.split('.').pop();
    }
    return customerId;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidCustomerId(id) {
    return UUID_REGEX.test(id);
}
