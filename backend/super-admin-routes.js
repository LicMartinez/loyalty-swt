'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const { authMiddleware, superAdminOnly } = require('./auth-middleware');
const { getDefaultTiers } = require('./tier-engine');
const router = express.Router();

// All routes require super_admin
router.use(authMiddleware(['super_admin']));
router.use(superAdminOnly);

// GET /api/super/tenants
router.get('/tenants', async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase.from('tenants').select('*').order('created_at');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/super/tenants
router.post('/tenants', async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { slug, name } = req.body;

    if (!slug || !name) return res.status(400).json({ error: 'Slug y nombre requeridos' });
    if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug solo acepta letras minúsculas, números y guiones' });

    try {
        // Create tenant
        const { data: tenant, error: tErr } = await supabase.from('tenants').insert({
            slug, name,
            wallet_class_id: `3388000000023147315.Loyalty_${slug}`,
            wallet_issuer_name: name,
            wallet_program_name: `Loyalty ${name}`,
        }).select().single();
        if (tErr) throw tErr;

        // Create default loyalty_config
        await supabase.from('loyalty_config').insert({
            id: Math.floor(Math.random() * 900000) + 100000,
            tenant_id: tenant.id,
            points_per_visit: 10,
            program_name: `Loyalty ${name}`,
            cycle_visits_required: 10,
        });

        // Create default tiers
        const tiers = getDefaultTiers().map(t => ({ ...t, tenant_id: tenant.id }));
        await supabase.from('loyalty_tiers').insert(tiers);

        res.json(tenant);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'El slug ya existe' });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/super/tenants/:id
router.put('/tenants/:id', async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { name, is_active } = req.body;
    try {
        const update = { updated_at: new Date().toISOString() };
        if (name !== undefined) update.name = name;
        if (is_active !== undefined) update.is_active = is_active;

        const { data, error } = await supabase.from('tenants').update(update).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/super/tenants/:id/users
router.get('/tenants/:id/users', async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data, error } = await supabase.from('admin_users')
            .select('id, username, email, role, is_active, last_login, created_at')
            .eq('tenant_id', req.params.id)
            .order('created_at');
        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/super/tenants/:id/users
router.post('/tenants/:id/users', async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { username, password, role, email } = req.body;

    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    if (!['owner', 'admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });

    try {
        const hash = await bcrypt.hash(password, 12);
        const { data, error } = await supabase.from('admin_users').insert({
            tenant_id: req.params.id, username, password_hash: hash, role, email
        }).select('id, username, email, role, is_active, created_at').single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe para este tenant' });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/super/users/:id
router.delete('/users/:id', async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        await supabase.from('admin_users').update({ is_active: false }).eq('id', req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/super/users/:id — Update user email/password
router.put('/users/:id', async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { email, password, is_active } = req.body;

    try {
        const updateData = {};
        if (email !== undefined) updateData.email = email;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (password) {
            updateData.password_hash = await bcrypt.hash(password, 12);
        }

        const { data, error } = await supabase.from('admin_users')
            .update(updateData)
            .eq('id', req.params.id)
            .select('id, username, email, role, is_active')
            .single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
