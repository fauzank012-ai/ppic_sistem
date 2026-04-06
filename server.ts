import express from 'express';
import compression from 'compression';
import NodeCache from 'node-cache';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

// Startup validation: Ensure required environment variables are present
const requiredEnvVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_KEY', 'SUPABASE_SERVICE_KEY', 'API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`FATAL: Missing environment variable ${envVar}`);
    process.exit(1);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Initialize Cache: 60 seconds TTL, check every 120 seconds
const cache = new NodeCache({ stdTTL: 60, checkperiod: 120 });

// Enable Gzip compression
app.use(compression());

// Trust proxy is required when running behind a load balancer/proxy (like Cloud Run/Nginx)
// to ensure express-rate-limit can correctly identify client IPs.
app.set('trust proxy', 1);

// Initialize Supabase client for backend
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
// Use Service Role Key for backend operations to bypass RLS and ensure security
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Security Headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development/iframe compatibility if needed, or configure strictly
  crossOriginEmbedderPolicy: false,
}));

app.use(cors());
app.use(express.json());

// Rate Limiting: Protect API from excessive requests
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  // Disable validation checks for proxy headers as we've enabled 'trust proxy'
  validate: { xForwardedForHeader: false },
});

app.use('/api/', apiLimiter);

const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfigured: API_KEY not set' });
  }
  if (req.headers['x-api-key'] !== apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/check_db', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE column_name IN ('periode', 'periode_bulan');" });
    res.json({ data, error });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/check_db') return next();
  authMiddleware(req, res, next);
});

app.post('/api/refresh', async (req, res) => {
  try {
    const { error } = await supabase.rpc('refresh_report_view');
    if (error) throw error;
    
    // Clear cache on refresh
    cache.flushAll();
    
    res.json({ success: true, refreshed_at: new Date().toISOString() });
  } catch (error: any) {
    console.error('Refresh API Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug-report', async (req, res) => {
  try {
    const { data, error } = await supabase.from('report_view_mat').select('*').limit(1);
    if (error) throw error;
    res.json({ data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/report', async (req, res) => {
  try {
    const { customer, limit, offset, cursor, status_order } = req.query;
    
    // Cache Key Generation
    const cacheKey = `report_${JSON.stringify(req.query)}`;
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    // Robust Input Validation
    const rawLimit = parseInt(limit as string, 10);
    const limitVal = !isNaN(rawLimit) ? Math.min(1000, Math.max(1, rawLimit)) : 100;
    
    // Define specific columns to fetch instead of * for better performance
    const columns = [
      'id', 'customer', 'short_name_customer', 'spec', 'dimensi', 'kode_st', 'kode_lt',
      'work_center_st', 'work_center_lt', 'd1', 'd2', 'dia', 'thick', 'length',
      'status_order', 'loo_pcs', 'loo_kg', 'order_pcs', 'order_kg',
      'sisa_order_pcs', 'sisa_order_kg', 'forecast_pcs', 'forecast_kg',
      'persentase_lt_pcs', 'persentase_lt_kg_val', 'persentase_st_pcs',
      'wip_lt_pcs', 'konversi_st_pcs', 'konversi_st_kg', 'wip_st_pcs', 'wip_st_kg',
      'fg_st_pcs', 'fg_kg', 'balance_pcs', 'balance_kg',
      'total_delivery_pcs', 'total_delivery_kg', 'avg_delivery_per_day',
      'doc_fg', 'doc_wip', 'doc_wip_lt', 'alert_st', 'alert_lt', 'last_delivery_date'
    ].join(',');

    let query = supabase
      .from('report_view_mat')
      .select(columns, { count: 'exact' });

    if (customer && customer !== '') {
      query = query.eq('customer', customer);
    }

    if (status_order && status_order !== '') {
      query = query.ilike('status_order', `%${status_order}%`);
    }

    // Cursor-based pagination (preferred for performance)
    if (cursor && cursor !== '') {
      query = query.gt('id', cursor);
      
      const { data, count, error } = await query
        .order('id', { ascending: true })
        .limit(limitVal);

      if (error) throw error;

      const lastId = data && data.length > 0 ? (data as any[])[data.length - 1].id : null;
      const response = { data: data || [], total: count, nextCursor: lastId };
      
      cache.set(cacheKey, response);
      return res.json(response);
    } 
    
    // Fallback to Offset-based pagination
    const rawOffset = parseInt(offset as string, 10);
    const offsetVal = !isNaN(rawOffset) ? Math.max(0, rawOffset) : 0;

    const { data, count, error } = await query
      .order('id', { ascending: true })
      .range(offsetVal, offsetVal + limitVal - 1);

    if (error) throw error;

    const response = { data: data || [], total: count };
    cache.set(cacheKey, response);
    res.json(response);
  } catch (error: any) {
    console.error('Report API Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    // Cache Key Generation
    const cacheKey = 'dashboard_data';
    const cachedResponse = cache.get(cacheKey);
    if (cachedResponse) {
      return res.json(cachedResponse);
    }

    // Graceful Error Handling: Use Promise.allSettled to handle partial failures
    const results = await Promise.allSettled([
      supabase.from('dashboard_order_fulfillment').select('Customer, Order_pcs, Sisa_order_pcs, Persentase_fulfillment'),
      supabase.from('dashboard_stock_composition').select('Kategori, Qty_kg'),
      supabase.from('dashboard_forecast_vs_actual').select('Periode_bulan, Forecast_kg, Actual_kg')
    ]);

    const [orderRes, stockRes, forecastRes] = results;

    const orderFulfillment = orderRes.status === 'fulfilled' ? orderRes.value.data : [];
    const stockComposition = stockRes.status === 'fulfilled' ? stockRes.value.data : [];
    const forecastVsActualRaw = forecastRes.status === 'fulfilled' ? forecastRes.value.data : [];

    if (results.some(r => r.status === 'rejected')) {
      console.warn('Dashboard partial failure:', results.filter(r => r.status === 'rejected'));
    }

    // Sort forecast data by month
    const forecastVsActual = (forecastVsActualRaw || []).sort((a: any, b: any) => 
      a.Periode_bulan.localeCompare(b.Periode_bulan)
    );

    const response = {
      orderFulfillment: orderFulfillment || [],
      stockComposition: stockComposition || [],
      forecastVsActual,
      _partial: results.some(r => r.status === 'rejected') ? true : undefined
    };

    // Cache the response for 60 seconds
    cache.set(cacheKey, response);
    res.json(response);
  } catch (error: any) {
    console.error('Dashboard API Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin User Management API
app.get('/api/admin/users', async (req, res) => {
  try {
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) throw authError;

    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');
    
    if (rolesError) {
      console.error('Error fetching roles from user_roles table:', rolesError);
      // If the table doesn't exist, we should inform the admin
      if (rolesError.message.includes('does not exist')) {
        return res.status(500).json({ 
          error: "The 'user_roles' table is missing from the database. Please run the fix_user_roles.sql script in your Supabase SQL Editor.",
          details: rolesError
        });
      }
      throw rolesError;
    }

    const usersWithRoles = users.map(user => ({
      ...user,
      role: roles.find(r => r.user_id === user.id)?.role || 'produksi'
    }));

    res.json(usersWithRoles);
  } catch (error: any) {
    console.error('List Users Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    console.log('Creating user with:', { email, role });
    
    const { data: { user }, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    
    if (createError) {
      console.error('Auth User Creation Error:', createError);
      // Check if user already exists to provide a better error message
      if (createError.message.includes('already registered')) {
        throw new Error('User with this email already exists in Supabase Auth.');
      }
      throw createError;
    }
    if (!user) throw new Error('User creation failed: No user object returned from Supabase Auth');

    console.log('User created in Auth (ID:', user.id, '), now assigning role:', role);
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({ user_id: user.id, role });
      
    if (roleError) {
      console.error('Role Assignment Error for user', user.id, ':', roleError);
      
      // Specific handling for the check constraint violation
      if (roleError.message.includes('violates check constraint "user_roles_role_check"')) {
        throw new Error(`The database is blocking the new roles (ppiclt/ppicst). Please run the 'FIX_DATABASE_ERROR.sql' script in your Supabase SQL Editor to remove this restriction.`);
      }
      
      throw new Error(`User created but role assignment failed: ${roleError.message}. Please ensure the user_roles table exists and allows the '${role}' role.`);
    }

    console.log('User and role created successfully');
    res.json({ success: true, user });
  } catch (error: any) {
    console.error('Create User API Error:', error.message, error);
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/admin/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: id, role });
      
    if (error) {
      console.error('Update Role Error for user', id, ':', error);
      
      // Specific handling for the check constraint violation
      if (error.message.includes('violates check constraint "user_roles_role_check"')) {
        throw new Error(`The database is blocking the new roles (ppiclt/ppicst). Please run the 'FIX_DATABASE_ERROR.sql' script in your Supabase SQL Editor to remove this restriction.`);
      }
      
      throw new Error(`Failed to update role: ${error.message}`);
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update Role Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    const { error } = await supabase.auth.admin.updateUserById(id, {
      password
    });
    
    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Reset Password Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) throw authError;

    // user_roles has ON DELETE CASCADE in the SQL I provided earlier
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete User Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
