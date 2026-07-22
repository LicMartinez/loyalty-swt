import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

const Scanner = ({ onScanSuccess }) => {
    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        
        scanner.render(
            (decodedText) => {
                scanner.clear();
                onScanSuccess(decodedText);
            },
            (errorMessage) => {
                // Ignore parse errors as they are very common
            }
        );

        return () => {
            scanner.clear().catch(error => console.error("Failed to clear html5QrcodeScanner. ", error));
        };
    }, [onScanSuccess]);

    return <div id="reader"></div>;
};

export default Scanner;
