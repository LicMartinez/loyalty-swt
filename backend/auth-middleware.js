'use strict';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Auth middleware — verifica JWT y extrae tenant_id
 * @param {string[]} requiredRoles - Roles permitidos (vacío = cualquier autenticado)
 */
function authMiddleware(requiredRoles = []) {
    return (req, res, next) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No autorizado' });
        }

        try {
            const payload = jwt.verify(token, JWT_SECRET);
            req.user = payload;
            req.tenantId = payload.tenant_id;

            if (requiredRoles.length > 0 && !requiredRoles.includes(payload.role)) {
                return res.status(403).json({ error: 'Sin permisos para esta acción' });
            }
            next();
        } catch (err) {
            return res.status(401).json({ error: 'Sesión expirada o inválida' });
        }
    };
}

/**
 * Super admin only middleware
 */
function superAdminOnly(req, res, next) {
    if (!req.user || req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Acceso restringido a super admin' });
    }
    next();
}

/**
 * Genera un JWT para un usuario autenticado
 */
function generateToken(user, tenant) {
    const payload = {
        sub: user.id,
        tenant_id: user.tenant_id,
        tenant_slug: tenant?.slug || null,
        role: user.role,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

module.exports = { authMiddleware, superAdminOnly, generateToken, JWT_SECRET };
