const express = require('express');
const { validateTierConfig } = require('./tier-engine');
const { validateCycleConfig } = require('./cycle-engine');
const { sendToPrinter, generateTicketESCPOS } = require('./print-service');
const { authMiddleware } = require('./auth-middleware');
const router = express.Router();

// All admin routes require authentication
const adminAuth = authMiddleware(['owner', 'admin', 'staff']);

// ============ DASHBOARD STATS ============

router.get('/stats', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const today = new Date().toISOString().slice(0, 10);
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const [customersRes, todayCheckinsRes, monthRedemptionsRes] = await Promise.all([
            supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', req.tenantId),
            supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('tenant_id', req.tenantId).gte('created_at', today),
            supabase.from('redemptions').select('id', { count: 'exact', head: true }).eq('tenant_id', req.tenantId).gte('created_at', monthStart)
        ]);

        // Puntos emitidos hoy (visitas de hoy * puntos por visita)
        const { data: config } = await supabase.from('loyalty_config').select('points_per_visit').eq('tenant_id', req.tenantId).single();
        const pointsPerVisit = config?.points_per_visit || 10;

        res.json({
            totalCustomers: customersRes.count || 0,
            todayCheckins: todayCheckinsRes.count || 0,
            monthRedemptions: monthRedemptionsRes.count || 0,
            todayPoints: (todayCheckinsRes.count || 0) * pointsPerVisit
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ BIRTHDAYS ============

router.get('/birthdays', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const currentMonth = new Date().getMonth() + 1;
        const { data, error } = await supabase
            .from('customers')
            .select('id, name, birthday')
            .eq('tenant_id', req.tenantId)
            .not('birthday', 'is', null);

        if (error) throw error;

        // Filtrar por mes actual
        const birthdays = (data || []).filter(c => {
            if (!c.birthday) return false;
            const month = new Date(c.birthday).getMonth() + 1;
            return month === currentMonth;
        }).sort((a, b) => new Date(a.birthday).getDate() - new Date(b.birthday).getDate());

        res.json(birthdays);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ RECENT CHECKINS ============

router.get('/checkins/recent', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase
            .from('checkins')
            .select('id, created_at, customer_id, customers(name)')
            .eq('tenant_id', req.tenantId)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        const formatted = (data || []).map(c => ({
            id: c.id,
            customer_name: c.customers?.name || 'Desconocido',
            created_at: c.created_at
        }));

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CUSTOMERS ============

router.get('/customers', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('tenant_id', req.tenantId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/customers/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, email, phone, birthday, notes } = req.body;
    try {
        const { data, error } = await supabase
            .from('customers')
            .update({ name, email, phone, birthday: birthday || null, notes })
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ DIRECT GIFTS ============

router.post('/gifts', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { customer_id, type, points_amount, perk_id, reason } = req.body;
    try {
        // Registrar el regalo
        await supabase.from('direct_gifts').insert([{
            tenant_id: req.tenantId,
            customer_id, type, points_amount: points_amount || 0,
            perk_id: perk_id || null, reason, given_by: 'admin'
        }]);

        // Si es puntos, actualizar balance del cliente
        if (type === 'points' && points_amount > 0) {
            const { data: customer } = await supabase
                .from('customers')
                .select('points_balance')
                .eq('id', customer_id)
                .eq('tenant_id', req.tenantId)
                .single();

            await supabase.from('customers')
                .update({ points_balance: (customer?.points_balance || 0) + points_amount })
                .eq('id', customer_id)
                .eq('tenant_id', req.tenantId);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ PERKS ============

router.get('/perks', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase.from('perks').select('*').eq('tenant_id', req.tenantId).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/perks', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, description, cost_points, is_active } = req.body;
    try {
        const { data, error } = await supabase.from('perks').insert([{ tenant_id: req.tenantId, name, description, cost_points, is_active }]).select().single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/perks/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, description, cost_points, is_active } = req.body;
    try {
        const { data, error } = await supabase.from('perks').update({ name, description, cost_points, is_active }).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/perks/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { error } = await supabase.from('perks').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ PROMOTIONS ============

router.get('/promotions', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase.from('promotions').select('*').eq('tenant_id', req.tenantId).order('created_at', { ascending: false });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/promotions', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, description, type, value, perk_id, start_date, end_date, is_active, days_of_week } = req.body;
    try {
        const { data, error } = await supabase.from('promotions').insert([{
            tenant_id: req.tenantId,
            name, description, type, value, perk_id: perk_id || null,
            start_date, end_date, is_active, days_of_week: days_of_week || []
        }]).select().single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/promotions/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, description, type, value, perk_id, start_date, end_date, is_active, days_of_week } = req.body;
    try {
        const { data, error } = await supabase.from('promotions').update({
            name, description, type, value, perk_id: perk_id || null,
            start_date, end_date, is_active, days_of_week: days_of_week || []
        }).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/promotions/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { error } = await supabase.from('promotions').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CONFIG ============

router.get('/config', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase.from('loyalty_config').select('*').eq('tenant_id', req.tenantId).single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/config', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { points_per_visit, program_name, cycle_visits_required, cycle_reward_perk_id } = req.body;
    try {
        // Validate cycle_visits_required if provided
        if (cycle_visits_required !== undefined) {
            const { valid, errors } = validateCycleConfig({ cycle_visits_required });
            if (!valid) {
                return res.status(400).json({ error: errors[0] });
            }
        }

        // Build update object with provided fields
        const updateData = { updated_at: new Date().toISOString() };
        if (points_per_visit !== undefined) updateData.points_per_visit = points_per_visit;
        if (program_name !== undefined) updateData.program_name = program_name;
        if (cycle_visits_required !== undefined) updateData.cycle_visits_required = cycle_visits_required;
        if (cycle_reward_perk_id !== undefined) updateData.cycle_reward_perk_id = cycle_reward_perk_id || null;

        const { data, error } = await supabase.from('loyalty_config')
            .update(updateData)
            .eq('tenant_id', req.tenantId)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ REPORTS ============

// Distribución de clientes por nivel
router.get('/reports/tiers', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        // Get all tiers for tenant
        const { data: tiers, error: tiersError } = await supabase
            .from('loyalty_tiers')
            .select('id, name')
            .eq('tenant_id', req.tenantId)
            .order('sort_order', { ascending: true });

        if (tiersError) throw tiersError;

        // Get count of customers for each tier
        const results = await Promise.all(
            (tiers || []).map(async (tier) => {
                const { count, error } = await supabase
                    .from('customers')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', req.tenantId)
                    .eq('tier_id', tier.id);

                if (error) throw error;
                return {
                    tier_name: tier.name,
                    tier_id: tier.id,
                    customer_count: count || 0
                };
            })
        );

        res.json({ data: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Recompensas por ciclo (paginado)
router.get('/reports/cycle-rewards', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = 50;

    // Default date range: last 30 days
    const defaultTo = new Date().toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;

    // Validate date range
    if (from > to) {
        return res.status(400).json({ error: 'La fecha de inicio no puede ser posterior a la fecha de fin' });
    }

    try {
        // Get total count
        const { count, error: countError } = await supabase
            .from('cycle_rewards')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', req.tenantId)
            .gte('created_at', from)
            .lte('created_at', to + 'T23:59:59');

        if (countError) throw countError;

        const total = count || 0;

        if (total === 0) {
            return res.json({
                data: [],
                pagination: { page, perPage, total: 0 },
                message: 'No se encontraron recompensas en el periodo consultado'
            });
        }

        // Get paginated data with joins
        const offset = (page - 1) * perPage;
        const { data, error } = await supabase
            .from('cycle_rewards')
            .select('cycle_number, created_at, customer_id, perk_id, customers(name), perks(name)')
            .eq('tenant_id', req.tenantId)
            .gte('created_at', from)
            .lte('created_at', to + 'T23:59:59')
            .order('created_at', { ascending: false })
            .range(offset, offset + perPage - 1);

        if (error) throw error;

        const rows = (data || []).map(r => ({
            fecha: new Date(r.created_at).toISOString().slice(0, 10),
            cliente: r.customers?.name || 'Desconocido',
            recompensa: r.perks?.name || 'Recompensa de ciclo',
            cycle_number: r.cycle_number
        }));

        res.json({
            data: rows,
            pagination: { page, perPage, total },
            message: null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/reports/:type', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { type } = req.params;
    const { from, to } = req.query;

    try {
        switch (type) {
            case 'visits': {
                const { data, error } = await supabase
                    .from('checkins')
                    .select('id, created_at, customer_id, customers(name)')
                    .eq('tenant_id', req.tenantId)
                    .gte('created_at', from)
                    .lte('created_at', to + 'T23:59:59')
                    .order('created_at', { ascending: false });
                if (error) throw error;

                const rows = (data || []).map(c => ({
                    fecha: new Date(c.created_at).toLocaleDateString('es-MX'),
                    hora: new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
                    cliente: c.customers?.name || 'Desconocido'
                }));

                res.json({ summary: { total_visitas: rows.length }, rows });
                break;
            }
            case 'top_customers': {
                const { data, error } = await supabase
                    .from('customers')
                    .select('name, visits_count, points_balance')
                    .eq('tenant_id', req.tenantId)
                    .order('visits_count', { ascending: false })
                    .limit(20);
                if (error) throw error;

                const rows = (data || []).map(c => ({
                    cliente: c.name,
                    visitas: c.visits_count,
                    puntos: c.points_balance
                }));

                res.json({ summary: { total_clientes: rows.length }, rows });
                break;
            }
            case 'redemptions': {
                const { data, error } = await supabase
                    .from('redemptions')
                    .select('id, created_at, customer_id, perk_id, customers(name), perks(name)')
                    .eq('tenant_id', req.tenantId)
                    .gte('created_at', from)
                    .lte('created_at', to + 'T23:59:59')
                    .order('created_at', { ascending: false });
                if (error) throw error;

                const rows = (data || []).map(r => ({
                    fecha: new Date(r.created_at).toLocaleDateString('es-MX'),
                    cliente: r.customers?.name || 'Desconocido',
                    beneficio: r.perks?.name || 'Desconocido'
                }));

                res.json({ summary: { total_canjes: rows.length }, rows });
                break;
            }
            case 'birthdays': {
                const currentMonth = new Date().getMonth() + 1;
                const { data, error } = await supabase
                    .from('customers')
                    .select('name, birthday, phone, email')
                    .eq('tenant_id', req.tenantId)
                    .not('birthday', 'is', null);
                if (error) throw error;

                const rows = (data || []).filter(c => {
                    const month = new Date(c.birthday).getMonth() + 1;
                    return month === currentMonth;
                }).map(c => ({
                    cliente: c.name,
                    cumpleanos: new Date(c.birthday).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }),
                    telefono: c.phone || '—',
                    email: c.email
                }));

                res.json({ summary: { cumpleaneros_del_mes: rows.length }, rows });
                break;
            }
            default:
                res.status(400).json({ error: 'Tipo de reporte no válido' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ TIERS ============

router.get('/tiers', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase
            .from('loyalty_tiers')
            .select('*')
            .eq('tenant_id', req.tenantId)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/tiers', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, points_per_visit, benefit_description, sort_order, is_default } = req.body;

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'El nombre no puede estar vacío', field: 'name', rule: 'required' });
    }
    if (name.trim().length > 50) {
        return res.status(400).json({ error: 'El nombre no puede exceder 50 caracteres', field: 'name', rule: 'maxLength' });
    }

    // Validate points_per_visit
    if (points_per_visit === undefined || points_per_visit === null || !Number.isInteger(points_per_visit) || points_per_visit < 1 || points_per_visit > 1000) {
        return res.status(400).json({ error: 'points_per_visit debe ser un entero entre 1 y 1000', field: 'points_per_visit', rule: 'range' });
    }

    // Validate benefit_description
    if (benefit_description !== undefined && benefit_description !== null && benefit_description.length > 200) {
        return res.status(400).json({ error: 'La descripción del beneficio no puede exceder 200 caracteres', field: 'benefit_description', rule: 'maxLength' });
    }

    try {
        // Check unique name (case-insensitive) within tenant
        const { data: existing, error: checkError } = await supabase
            .from('loyalty_tiers')
            .select('id')
            .eq('tenant_id', req.tenantId)
            .ilike('name', name.trim());

        if (checkError) throw checkError;

        if (existing && existing.length > 0) {
            return res.status(400).json({ error: 'Nombre de nivel duplicado', field: 'name' });
        }

        const { data, error } = await supabase
            .from('loyalty_tiers')
            .insert([{
                tenant_id: req.tenantId,
                name: name.trim(),
                points_per_visit,
                benefit_description: benefit_description || null,
                sort_order: sort_order || 0,
                is_default: is_default || false,
            }])
            .select()
            .single();

        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/tiers/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, points_per_visit, benefit_description, sort_order, is_default } = req.body;

    // Check tier exists
    const { data: tier, error: findError } = await supabase
        .from('loyalty_tiers')
        .select('*')
        .eq('id', req.params.id)
        .eq('tenant_id', req.tenantId)
        .single();

    if (findError || !tier) {
        return res.status(404).json({ error: 'Nivel no encontrado' });
    }

    // Validate name if provided
    if (name !== undefined) {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'El nombre no puede estar vacío', field: 'name', rule: 'required' });
        }
        if (name.trim().length > 50) {
            return res.status(400).json({ error: 'El nombre no puede exceder 50 caracteres', field: 'name', rule: 'maxLength' });
        }

        // Check unique name (case-insensitive) within tenant, excluding current tier
        const { data: existing, error: checkError } = await supabase
            .from('loyalty_tiers')
            .select('id')
            .eq('tenant_id', req.tenantId)
            .ilike('name', name.trim())
            .neq('id', req.params.id);

        if (checkError) throw checkError;

        if (existing && existing.length > 0) {
            return res.status(400).json({ error: 'Nombre de nivel duplicado', field: 'name' });
        }
    }

    // Validate points_per_visit if provided
    if (points_per_visit !== undefined) {
        if (!Number.isInteger(points_per_visit) || points_per_visit < 1 || points_per_visit > 1000) {
            return res.status(400).json({ error: 'points_per_visit debe ser un entero entre 1 y 1000', field: 'points_per_visit', rule: 'range' });
        }
    }

    // Validate benefit_description if provided
    if (benefit_description !== undefined && benefit_description !== null && benefit_description.length > 200) {
        return res.status(400).json({ error: 'La descripción del beneficio no puede exceder 200 caracteres', field: 'benefit_description', rule: 'maxLength' });
    }

    try {
        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (points_per_visit !== undefined) updateData.points_per_visit = points_per_visit;
        if (benefit_description !== undefined) updateData.benefit_description = benefit_description || null;
        if (sort_order !== undefined) updateData.sort_order = sort_order;
        if (is_default !== undefined) updateData.is_default = is_default;
        updateData.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('loyalty_tiers')
            .update(updateData)
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/tiers/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;

    try {
        // Check tier exists
        const { data: tier, error: findError } = await supabase
            .from('loyalty_tiers')
            .select('id')
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId)
            .single();

        if (findError || !tier) {
            return res.status(404).json({ error: 'Nivel no encontrado' });
        }

        // Check if any customers are assigned to this tier
        const { count, error: countError } = await supabase
            .from('customers')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', req.tenantId)
            .eq('tier_id', req.params.id);

        if (countError) throw countError;

        if (count > 0) {
            return res.status(409).json({
                error: `No se puede eliminar: ${count} clientes asignados`,
                customersCount: count
            });
        }

        const { error } = await supabase
            .from('loyalty_tiers')
            .delete()
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId);

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ CUSTOMER TIER CHANGE ============

router.put('/customers/:id/tier', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { tier_id, changed_by } = req.body;

    if (!tier_id) {
        return res.status(400).json({ error: 'tier_id es requerido', field: 'tier_id', rule: 'required' });
    }

    if (!changed_by) {
        return res.status(400).json({ error: 'changed_by es requerido', field: 'changed_by', rule: 'required' });
    }

    try {
        // Validate that the tier exists in the tenant
        const { data: tier, error: tierError } = await supabase
            .from('loyalty_tiers')
            .select('id')
            .eq('id', tier_id)
            .eq('tenant_id', req.tenantId)
            .single();

        if (tierError || !tier) {
            return res.status(404).json({ error: 'Nivel no encontrado' });
        }

        // Get the customer's current tier_id
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('id, tier_id')
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId)
            .single();

        if (customerError || !customer) {
            return res.status(404).json({ error: 'Cliente no encontrado' });
        }

        const previous_tier_id = customer.tier_id || null;

        // Update customer.tier_id
        const { error: updateError } = await supabase
            .from('customers')
            .update({ tier_id })
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId);

        if (updateError) throw updateError;

        // Insert a tier_change_history record
        const { error: historyError } = await supabase
            .from('tier_change_history')
            .insert([{
                tenant_id: req.tenantId,
                customer_id: req.params.id,
                previous_tier_id,
                new_tier_id: tier_id,
                changed_by,
                change_source: 'manual',
            }]);

        if (historyError) throw historyError;

        res.json({ success: true, previous_tier_id, new_tier_id: tier_id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============ PRINTERS ============

router.get('/printers', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase.from('printers').select('*').eq('tenant_id', req.tenantId).order('created_at', { ascending: true });
        if (error) throw error;
        res.json(data || []);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/printers', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, ip_address, port, is_active, print_on_checkin, print_on_redemption, print_on_cycle_reward } = req.body;

    if (!name || !ip_address) {
        return res.status(400).json({ error: 'Nombre e IP son requeridos' });
    }

    try {
        const { data, error } = await supabase.from('printers').insert([{
            tenant_id: req.tenantId,
            name,
            ip_address,
            port: port || 9100,
            is_active: is_active !== false,
            print_on_checkin: print_on_checkin || false,
            print_on_redemption: print_on_redemption !== false,
            print_on_cycle_reward: print_on_cycle_reward !== false
        }]).select().single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/printers/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, ip_address, port, is_active, print_on_checkin, print_on_redemption, print_on_cycle_reward } = req.body;
    try {
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (ip_address !== undefined) updateData.ip_address = ip_address;
        if (port !== undefined) updateData.port = port;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (print_on_checkin !== undefined) updateData.print_on_checkin = print_on_checkin;
        if (print_on_redemption !== undefined) updateData.print_on_redemption = print_on_redemption;
        if (print_on_cycle_reward !== undefined) updateData.print_on_cycle_reward = print_on_cycle_reward;

        const { data, error } = await supabase.from('printers')
            .update(updateData)
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId)
            .select()
            .single();
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/printers/:id', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { error } = await supabase.from('printers').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/printers/:id/test', adminAuth, async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data: printer, error } = await supabase.from('printers')
            .select('*')
            .eq('id', req.params.id)
            .eq('tenant_id', req.tenantId)
            .single();

        if (error || !printer) return res.status(404).json({ error: 'Impresora no encontrada' });

        const testTicket = generateTicketESCPOS({
            programName: 'LOYALTY',
            customerName: 'TEST DE IMPRESION',
            perkName: 'Ticket de Prueba',
            perkDescription: 'Si ves esto, la impresora funciona correctamente',
            redeemedAt: new Date().toISOString(),
            type: 'test'
        });

        await sendToPrinter(printer.ip_address, printer.port, testTicket);
        res.json({ success: true, message: 'Ticket de prueba enviado correctamente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
