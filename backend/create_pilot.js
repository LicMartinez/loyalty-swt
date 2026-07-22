const axios = require('axios');

async function createPilot() {
    try {
        console.log("Registrando cliente de prueba en el backend...");
        const res = await axios.post('http://localhost:3000/api/customers', {
            name: "Cesar Martinez (Piloto)",
            email: "cesar@swtools.com",
            phone: "5551234567"
        });
        
        console.log("¡Cliente creado con éxito en Supabase!");
        console.log("-------------------------------------------------");
        console.log("Abre el siguiente enlace desde tu celular Android para añadir tu pase a Google Wallet:");
        console.log("\n" + res.data.saveUrl + "\n");
        console.log("-------------------------------------------------");
        console.log("Una vez añadido a tu Wallet, abre la aplicación de Wallet en tu celular, muestra el código QR a la cámara de la computadora (donde tienes abierta la interfaz del Staff) y escanea el pase.");
    } catch (error) {
        console.error("Error:", error.response ? error.response.data : error.message);
    }
}

createPilot();
