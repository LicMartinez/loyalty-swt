'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const { authMiddleware, generateToken } = require('./auth-middleware');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { slug, username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    try {
        let tenantId = null;
        let tenant = null;

        // Super admin no necesita slug
        if (slug) {
            const { data: t, error: tErr } = await supabase
                .from('tenants')
                .select('*')
                .eq('slug', slug)
                .eq('is_active', true)
                .single();

            if (tErr || !t) {
                return res.status(401).json({ error: 'Credenciales incorrectas' });
            }
            tenant = t;
            tenantId = t.id;
        }

        // Buscar usuario
        let query = supabase.from('admin_users').select('*').eq('username', username).eq('is_active', true);

        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        } else {
            query = query.is('tenant_id', null); // super_admin
        }

        const { data: user, error: uErr } = await query.single();

        if (uErr || !user) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // Check lockout
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(429).json({ error: `Cuenta bloqueada. Intenta en ${mins} minutos.` });
        }

        // Verify password
        const valid = await bcrypt.compare(password, user.password_hash);

        if (!valid) {
            const attempts = (user.failed_attempts || 0) + 1;
            const update = { failed_attempts: attempts };
            if (attempts >= 5) {
                update.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            }
            await supabase.from('admin_users').update(update).eq('id', user.id);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // Success — reset attempts, update last_login
        await supabase.from('admin_users').update({
            failed_attempts: 0, locked_until: null, last_login: new Date().toISOString()
        }).eq('id', user.id);

        // If super_admin logged in without slug, fetch tenant info for response
        if (!tenant && user.role === 'super_admin') {
            tenant = { slug: null, name: 'Platform Admin' };
        }

        const token = generateToken(user, tenant);

        res.json({
            token,
            user: { id: user.id, username: user.username, role: user.role, email: user.email },
            tenant: tenant ? {
                id: tenant.id, slug: tenant.slug, name: tenant.name,
                logo_url: tenant.logo_url,
                primary_color: tenant.primary_color,
                secondary_color: tenant.secondary_color,
                accent_color: tenant.accent_color,
                text_color: tenant.text_color,
                background_color: tenant.background_color,
            } : null
        });
    } catch (error) {
        console.error('[auth] Login error:', error.message);
        res.status(500).json({ error: 'Error interno' });
    }
});

// GET /api/auth/me
router.get('/me', authMiddleware(), async (req, res) => {
    const supabase = req.app.locals.supabase;
    try {
        const { data: user } = await supabase.from('admin_users')
            .select('id, username, email, role, tenant_id')
            .eq('id', req.user.sub).single();

        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

        let tenant = null;
        if (user.tenant_id) {
            const { data: t } = await supabase.from('tenants').select('*').eq('id', user.tenant_id).single();
            tenant = t;
        }

        res.json({ user, tenant });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

// PUT /api/auth/password
router.put('/password', authMiddleware(), async (req, res) => {
    const supabase = req.app.locals.supabase;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password || new_password.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const { data: user } = await supabase.from('admin_users')
            .select('password_hash').eq('id', req.user.sub).single();

        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) return res.status(400).json({ error: 'Contraseña actual incorrecta' });

        const hash = await bcrypt.hash(new_password, 12);
        await supabase.from('admin_users').update({ password_hash: hash }).eq('id', req.user.sub);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;
