require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { auth } = require('google-auth-library');
const { printToAllPrinters } = require('./print-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(helmet());

// CORS — restrict to allowed origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
}));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: 'Demasiadas solicitudes' } });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Demasiados intentos. Espera 15 minutos.' } });
app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);

app.use(express.json());

// Supabase Client Initialization
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Basic Route
app.get('/', (req, res) => {
    res.json({ message: 'SW Loyalty API is running', status: 'OK' });
});

// Importar lógica de Wallet
const wallet = require('./wallet');

// Importar tier-engine y cycle-engine
const { getTierForCustomer, calculatePoints } = require('./tier-engine');
const { processCycleStep, getCycleProgress } = require('./cycle-engine');

// Importar rutas
const adminRoutes = require('./admin-routes');
const authRoutes = require('./auth-routes');
const superAdminRoutes = require('./super-admin-routes');

// Compartir supabase con las rutas
app.locals.supabase = supabase;

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/super', superAdminRoutes);
app.use('/api/admin', adminRoutes);

// Helper: obtener beneficios pendientes de un cliente para mostrar en Wallet
async function getClientBenefits(customerId) {
    const { data: gifts } = await supabase
        .from('direct_gifts')
        .select('perks(name)')
        .eq('customer_id', customerId)
        .eq('type', 'perk')
        .is('redeemed_at', null);
    return (gifts || []).map(g => g.perks?.name).filter(Boolean);
}

// Endpoint de diagnóstico para verificar configuración de Google Wallet
app.get('/api/wallet/status', async (req, res) => {
    try {
        const status = await wallet.checkStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 1. Endpoint: Crear Cliente y emitir Pase
app.post('/api/customers', async (req, res) => {
    const { name, email, phone, birthday } = req.body;
    try {
        // Generar un UUID para el cliente que crearemos
        const { v4: uuidv4 } = require('uuid');
        const tempId = uuidv4();

        // Crear el pase en Google Wallet usando JWT (más confiable para piloto)
        const { objectId, saveUrl } = await wallet.createWalletPassJWT(tempId, name);

        // Guardar cliente en Supabase
        const { data: customer, error } = await supabase
            .from('customers')
            .insert([{ 
                id: tempId, 
                name, 
                email, 
                phone, 
                birthday: birthday || null,
                wallet_pass_id: objectId 
            }])
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, customer, saveUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Endpoint: Leer Perfil de Cliente (Tras escaneo QR)
app.get('/api/customers/:id', async (req, res) => {
    const customerId = req.params.id;
    try {
        const { data: customer, error } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerId)
            .single();

        if (error || !customer) return res.status(404).json({ error: 'Cliente no encontrado' });
        
        // Obtener beneficios activos (canjeables con puntos)
        const { data: perks } = await supabase.from('perks').select('*').eq('is_active', true);
        
        // Obtener regalos directos pendientes (tipo perk que no se han redimido)
        const { data: pendingGifts } = await supabase
            .from('direct_gifts')
            .select('id, perk_id, reason, created_at, perks(id, name, description)')
            .eq('customer_id', customerId)
            .eq('type', 'perk')
            .is('redeemed_at', null);
        
        res.json({ customer, perks, pendingGifts: pendingGifts || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2b. Endpoint: Portal de beneficios del cliente (público, desde Google Wallet)
app.get('/api/customers/:id/benefits', async (req, res) => {
    const customerId = req.params.id;
    try {
        const { data: customer, error } = await supabase
            .from('customers')
            .select('name, visits_count, points_balance')
            .eq('id', customerId)
            .single();

        if (error || !customer) return res.status(404).json({ error: 'Cliente no encontrado' });
        
        const { data: perks } = await supabase.from('perks').select('id, name, description, cost_points').eq('is_active', true);
        
        const { data: pendingGifts } = await supabase
            .from('direct_gifts')
            .select('id, perk_id, reason, created_at, perks(id, name, description)')
            .eq('customer_id', customerId)
            .eq('type', 'perk')
            .is('redeemed_at', null);
        
        res.json({ customer, perks: perks || [], pendingGifts: pendingGifts || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2c. Endpoint: Progreso de tarjeta de sellos del cliente (público)
app.get('/api/customers/:id/progress', async (req, res) => {
    const customerId = req.params.id;

    // Validar formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(customerId)) {
        return res.status(400).json({ error: 'Identificador inválido' });
    }

    try {
        // Obtener cliente con información de nivel
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('id, name, tier_id, cycle_visits_count, loyalty_tiers(name, points_per_visit)')
            .eq('id', customerId)
            .single();

        if (customerError || !customer) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        // Obtener configuración del programa
        const { data: config, error: configError } = await supabase
            .from('loyalty_config')
            .select('program_name, cycle_visits_required, cycle_reward_perk_id')
            .single();

        if (configError || !config) {
            return res.status(500).json({ error: 'Error al obtener configuración' });
        }

        // Obtener progreso del ciclo
        const cycleProgress = await getCycleProgress(supabase, customerId, {
            cycle_visits_required: config.cycle_visits_required,
            cycle_reward_perk_id: config.cycle_reward_perk_id
        });

        // Construir arreglo de stamps (máximo 20 posiciones)
        const maxStamps = Math.min(cycleProgress.visitsRequired, 20);
        const stamps = [];
        for (let i = 1; i <= maxStamps; i++) {
            stamps.push({
                position: i,
                completed: i <= cycleProgress.visitsCompleted
            });
        }

        res.json({
            customer: {
                name: customer.name,
                memberId: customer.id
            },
            program: {
                name: config.program_name
            },
            tier: {
                name: customer.loyalty_tiers?.name || 'Bronce',
                pointsPerVisit: customer.loyalty_tiers?.points_per_visit || 3
            },
            cycle: {
                visitsCompleted: cycleProgress.visitsCompleted,
                visitsRequired: cycleProgress.visitsRequired,
                percentage: cycleProgress.percentage,
                rewardName: cycleProgress.rewardName,
                expiresAt: null
            },
            stamps
        });
    } catch (error) {
        // No exponer detalles internos
        res.status(500).json({ error: 'Error al obtener progreso' });
    }
});

// 3. Endpoint: Check-in (Visita) — Refactorizado con tier-engine y cycle-engine
app.post('/api/checkin', async (req, res) => {
    const { customerId, scannedBy } = req.body;

    // Estado previo para rollback manual
    let prevState = null;
    let checkinInserted = false;
    let checkinId = null;
    let autoGiftInserted = false;
    let autoGiftId = null;

    try {
        // 1. Obtener cliente con información básica
        const { data: customer, error: fetchErr } = await supabase
            .from('customers')
            .select('visits_count, points_balance, cycle_visits_count, cycles_completed, tier_id')
            .eq('id', customerId)
            .single();

        if (fetchErr || !customer) throw fetchErr || new Error("Cliente no encontrado");

        // Guardar estado previo para rollback
        prevState = {
            visits_count: customer.visits_count,
            points_balance: customer.points_balance,
            cycle_visits_count: customer.cycle_visits_count,
            cycles_completed: customer.cycles_completed,
        };

        // 2. Obtener nivel del cliente usando tier-engine
        const { tier, fallback } = await getTierForCustomer(supabase, customerId);
        if (fallback) {
            console.warn(`[CHECKIN] Customer ${customerId} using fallback tier (Bronce).`);
        }

        // 3. Calcular puntos según el nivel
        const pointsEarned = calculatePoints(tier);

        // 4. Obtener configuración de ciclo
        const { data: config } = await supabase
            .from('loyalty_config')
            .select('cycle_visits_required, cycle_reward_perk_id')
            .single();

        const cycleConfig = {
            cycle_visits_required: config?.cycle_visits_required || 10,
            cycle_reward_perk_id: config?.cycle_reward_perk_id || null,
        };

        // 5. Insertar registro de visita
        const { data: checkinData, error: checkinErr } = await supabase
            .from('checkins')
            .insert([{ customer_id: customerId, scanned_by: scannedBy }])
            .select('id')
            .single();

        if (checkinErr) throw new Error('Error al registrar check-in');
        checkinInserted = true;
        checkinId = checkinData?.id;

        // 6. Actualizar puntos y visitas del cliente
        const newVisits = customer.visits_count + 1;
        const newPoints = customer.points_balance + pointsEarned;

        const { error: updateErr } = await supabase
            .from('customers')
            .update({ visits_count: newVisits, points_balance: newPoints })
            .eq('id', customerId);

        if (updateErr) throw new Error('Error al actualizar puntos del cliente');

        // 7. Procesar paso de ciclo
        const cycleResult = await processCycleStep(supabase, customerId, cycleConfig);

        // 8. Auto-regalo para clientes de nivel Platino
        let autoGift = null;
        if (tier.benefit_description && tier.benefit_description.toLowerCase().includes('regalo')) {
            const { data: giftData, error: giftErr } = await supabase
                .from('direct_gifts')
                .insert([{
                    customer_id: customerId,
                    type: 'perk',
                    reason: tier.benefit_description,
                    status: 'pending',
                }])
                .select('id')
                .single();

            if (giftErr) {
                console.error('[CHECKIN] Error al crear auto-regalo:', giftErr.message);
            } else {
                autoGiftInserted = true;
                autoGiftId = giftData?.id;
                autoGift = { type: 'shot', status: 'pending' };
            }
        }

        // 9. Actualizar pase en Google Wallet (fire-and-forget)
        const benefits = await getClientBenefits(customerId);
        wallet.updateWalletPass(
            customerId,
            newVisits,
            newPoints,
            benefits,
            tier.name,
            {
                visitsCompleted: cycleResult.newCycleVisitsCount,
                visitsRequired: cycleConfig.cycle_visits_required
            }
        );

        // 10. Retornar respuesta extendida
        res.json({
            success: true,
            visits: newVisits,
            points: newPoints,
            pointsEarned,
            tier: {
                name: tier.name,
                pointsPerVisit: tier.points_per_visit,
            },
            cycle: {
                current: cycleResult.newCycleVisitsCount,
                required: cycleConfig.cycle_visits_required,
                completed: cycleResult.completed,
                rewardName: cycleResult.rewardName,
            },
            autoGift,
        });
    } catch (error) {
        console.error('[CHECKIN] Error:', error.message);

        // Rollback manual: revertir cambios parciales
        try {
            if (prevState) {
                await supabase
                    .from('customers')
                    .update(prevState)
                    .eq('id', customerId);
            }
            if (checkinInserted && checkinId) {
                await supabase.from('checkins').delete().eq('id', checkinId);
            }
            if (autoGiftInserted && autoGiftId) {
                await supabase.from('direct_gifts').delete().eq('id', autoGiftId);
            }
        } catch (rollbackErr) {
            console.error('[CHECKIN] Rollback failed:', rollbackErr.message);
        }

        res.status(500).json({ error: 'Error en check-in' });
    }
});

// 4. Endpoint: Redención de Beneficio
app.post('/api/redemption', async (req, res) => {
    const { customerId, perkId, redeemedBy } = req.body;
    try {
        // Obtener cliente y perk
        const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).single();
        const { data: perk } = await supabase.from('perks').select('*').eq('id', perkId).single();

        if (!customer || !perk) return res.status(404).json({ error: 'Cliente o Beneficio no encontrado' });

        // Validar que le alcancen los puntos
        if (perk.cost_points && customer.points_balance < perk.cost_points) {
            return res.status(400).json({ error: 'Puntos insuficientes' });
        }

        const newPoints = customer.points_balance - (perk.cost_points || 0);

        // Registrar canje
        await supabase.from('redemptions').insert([{ 
            customer_id: customerId, 
            perk_id: perkId, 
            redeemed_by: redeemedBy 
        }]);

        // Actualizar cliente
        await supabase.from('customers')
            .update({ points_balance: newPoints })
            .eq('id', customerId);

        // Actualizar Google Wallet
        const benefits = await getClientBenefits(customerId);
        await wallet.updateWalletPass(customerId, customer.visits_count, newPoints, benefits);

        res.json({ 
            success: true, 
            remainingPoints: newPoints,
            ticket: {
                customerName: customer.name,
                perkName: perk.name,
                perkDescription: perk.description,
                redeemedAt: new Date().toISOString(),
                type: 'points'
            }
        });

        // Impresión automática a todas las impresoras configuradas (fire-and-forget)
        printToAllPrinters(supabase, 'redemption', {
            programName: 'PANEM',
            customerName: customer.name,
            perkName: perk.name,
            perkDescription: perk.description,
            redeemedAt: new Date().toISOString(),
            type: 'redemption'
        }).catch(err => console.error('[print] Auto-print failed:', err.message));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Endpoint: Redención de Regalo Directo (sin costo de puntos)
app.post('/api/redemption/gift', async (req, res) => {
    const { customerId, giftId, redeemedBy } = req.body;
    try {
        const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).single();
        const { data: gift } = await supabase
            .from('direct_gifts')
            .select('*, perks(id, name, description)')
            .eq('id', giftId)
            .eq('customer_id', customerId)
            .is('redeemed_at', null)
            .single();

        if (!customer || !gift) return res.status(404).json({ error: 'Cliente o regalo no encontrado' });

        // Marcar regalo como redimido
        await supabase.from('direct_gifts')
            .update({ redeemed_at: new Date().toISOString() })
            .eq('id', giftId);

        // Registrar en redemptions
        await supabase.from('redemptions').insert([{
            customer_id: customerId,
            perk_id: gift.perk_id,
            redeemed_by: redeemedBy
        }]);

        res.json({
            success: true,
            remainingPoints: customer.points_balance,
            ticket: {
                customerName: customer.name,
                perkName: gift.perks?.name || 'Cortesía',
                perkDescription: gift.perks?.description || gift.reason,
                redeemedAt: new Date().toISOString(),
                type: 'gift',
                reason: gift.reason
            }
        });

        // Impresión automática (fire-and-forget)
        printToAllPrinters(supabase, 'redemption', {
            programName: 'PANEM',
            customerName: customer.name,
            perkName: gift.perks?.name || 'Cortesía',
            perkDescription: gift.perks?.description || gift.reason,
            redeemedAt: new Date().toISOString(),
            type: 'gift',
            reason: gift.reason
        }).catch(err => console.error('[print] Auto-print failed:', err.message));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Endpoint: Impresión por red (bridge TCP para impresoras térmicas)
app.post('/api/print', async (req, res) => {
    const { ip, port, data } = req.body;
    if (!ip || !data) return res.status(400).json({ error: 'IP y datos requeridos' });

    const net = require('net');
    const client = new net.Socket();

    client.connect(port || 9100, ip, () => {
        client.write(data, 'binary', () => {
            client.end();
            res.json({ success: true });
        });
    });

    client.on('error', (err) => {
        console.error('Error impresión red:', err.message);
        res.status(500).json({ error: `No se pudo conectar a ${ip}:${port}` });
    });

    client.setTimeout(5000, () => {
        client.destroy();
        res.status(500).json({ error: 'Timeout de conexión' });
    });
});

// Start Server (skip in Vercel serverless)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
