import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'creativeflow.sqlite'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('freelancer','client')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, email TEXT NOT NULL, company TEXT DEFAULT '', notes TEXT DEFAULT '', user_id TEXT REFERENCES users(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), client_id TEXT NOT NULL REFERENCES clients(id), name TEXT NOT NULL, description TEXT DEFAULT '', type TEXT DEFAULT 'Design', status TEXT DEFAULT 'Planning', budget REAL DEFAULT 0, deadline TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS deliverables(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, description TEXT DEFAULT '', version INTEGER DEFAULT 1, status TEXT DEFAULT 'In review', file_name TEXT DEFAULT '', file_path TEXT DEFAULT '', feedback TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invoices(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), number TEXT NOT NULL UNIQUE, amount REAL NOT NULL, due_date TEXT DEFAULT '', status TEXT DEFAULT 'Draft', notes TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL, body TEXT NOT NULL, status TEXT DEFAULT 'Pending', signed_by TEXT DEFAULT '', signed_at TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activities(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), actor TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL);
`);
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const passwordHash = p => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(p, salt, 64).toString('hex')}`; };
const verifyPassword = (p, stored) => { const [salt, expected] = stored.split(':'); const actual = crypto.scryptSync(p, salt, 64); return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex')); };
const get = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);
const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const required = (value, name) => { if (typeof value !== 'string' || !value.trim())
    fail(400, `${name} is required`); return value.trim(); };
const money = value => { const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > 100000000)
    fail(400, 'Invalid amount'); return Math.round(n * 100) / 100; };
const activity = (projectId, actor, action) => run('INSERT INTO activities VALUES(?,?,?,?,?)', id(), projectId, actor, action, now());
const projectAccess = (user, projectId, edit = false) => {
    const p = get('SELECT p.*,c.name client_name,c.email client_email,c.user_id client_user_id FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.id=?', projectId);
    if (!p || (edit ? p.owner_id !== user.id : p.owner_id !== user.id && p.client_user_id !== user.id))
        fail(404, 'Project not found');
    return p;
};
const ownerOnly = user => { if (user.role !== 'freelancer')
    fail(403, 'Freelancer access required'); };
const ownedClient = (user, clientId) => { const c = get('SELECT * FROM clients WHERE id=? AND owner_id=?', clientId, user.id); if (!c)
    fail(404, 'Client not found'); return c; };
const deliverableAccess = (user, deliverableId) => { const d = get('SELECT * FROM deliverables WHERE id=?', deliverableId); if (!d)
    fail(404, 'Deliverable not found'); const p = projectAccess(user, d.project_id); return { d, p }; };
const invoiceAccess = (user, invoiceId) => { const i = get('SELECT * FROM invoices WHERE id=?', invoiceId); if (!i)
    fail(404, 'Invoice not found'); const p = projectAccess(user, i.project_id); return { i, p }; };
const contractAccess = (user, contractId) => { const c = get('SELECT * FROM contracts WHERE id=?', contractId); if (!c)
    fail(404, 'Contract not found'); const p = projectAccess(user, c.project_id); return { c, p }; };
const readBody = async (req) => { let data = ''; for await (const chunk of req) {
    data += chunk;
    if (data.length > 12 * 1024 * 1024)
        fail(413, 'Request too large');
} try {
    return data ? JSON.parse(data) : {};
}
catch {
    fail(400, 'Invalid JSON');
} };
const auth = req => { const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('cf_session='))?.slice(11); if (!token)
    return null; return get('SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?', hash(token), Date.now()) || null; };
const session = (res, userId) => { const token = crypto.randomBytes(32).toString('hex'); run('INSERT INTO sessions VALUES(?,?,?)', hash(token), userId, Date.now() + 7 * 86400000); res.setHeader('Set-Cookie', `cf_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === 'true' ? '; Secure' : ''}`); };
const route = async (req, res, url) => {
    const method = req.method, pathname = url.pathname;
    if (pathname === '/api/register' && method === 'POST') {
        const b = await readBody(req);
        const email = required(b.email, 'Email').toLowerCase();
        const name = required(b.name, 'Name');
        const password = required(b.password, 'Password');
        if (password.length < 8)
            fail(400, 'Password must be at least 8 characters');
        if (get('SELECT id FROM users WHERE email=?', email))
            fail(409, 'Email already registered');
        const userId = id();
        run('INSERT INTO users VALUES(?,?,?,?,?,?)', userId, name, email, passwordHash(password), 'freelancer', now());
        session(res, userId);
        return json(res, 201, { ok: true });
    }
    if (pathname === '/api/login' && method === 'POST') {
        const b = await readBody(req);
        const user = get('SELECT * FROM users WHERE email=?', String(b.email || '').trim().toLowerCase());
        if (!user || !verifyPassword(String(b.password || ''), user.password))
            fail(401, 'Invalid email or password');
        session(res, user.id);
        return json(res, 200, { ok: true });
    }
    if (pathname === '/api/logout' && method === 'POST') {
        const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('cf_session='))?.slice(11);
        if (token)
            run('DELETE FROM sessions WHERE token_hash=?', hash(token));
        res.setHeader('Set-Cookie', 'cf_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return json(res, 200, { ok: true });
    }
    const user = auth(req);
    if (!user)
        fail(401, 'Sign in required');
    if (pathname === '/api/me' && method === 'GET')
        return json(res, 200, user);
    if (pathname === '/api/overview' && method === 'GET') {
        const projects = user.role === 'freelancer' ? all('SELECT p.*,c.name client_name FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.owner_id=? ORDER BY p.created_at DESC', user.id) : all('SELECT p.*,c.name client_name FROM projects p JOIN clients c ON c.id=p.client_id WHERE c.user_id=? ORDER BY p.created_at DESC', user.id);
        const ids = projects.map(p => p.id);
        const invoices = ids.length ? all(`SELECT * FROM invoices WHERE project_id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
        const deliverables = ids.length ? all(`SELECT * FROM deliverables WHERE project_id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
        return json(res, 200, { projects, invoices, deliverables, clients: user.role === 'freelancer' ? all('SELECT * FROM clients WHERE owner_id=? ORDER BY created_at DESC', user.id) : [] });
    }
    if (pathname === '/api/clients' && method === 'POST') {
        ownerOnly(user);
        const b = await readBody(req);
        const clientId = id();
        const email = required(b.email, 'Email').toLowerCase();
        run('INSERT INTO clients(id,owner_id,name,email,company,notes,created_at) VALUES(?,?,?,?,?,?,?)', clientId, user.id, required(b.name, 'Name'), email, String(b.company || ''), String(b.notes || ''), now());
        return json(res, 201, { id: clientId });
    }
    if (pathname === '/api/clients/invite' && method === 'POST') {
        ownerOnly(user);
        const b = await readBody(req);
        const c = ownedClient(user, required(b.clientId, 'Client'));
        if (c.user_id)
            fail(409, 'Client already has an account');
        const existing = get('SELECT id,role FROM users WHERE email=?', c.email);
        if (existing && existing.role !== 'client')
            fail(409, 'Email belongs to a freelancer account');
        const inviteToken = crypto.randomBytes(24).toString('hex');
        const inviteHash = hash(inviteToken);
        db.exec('CREATE TABLE IF NOT EXISTS invites(token_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), expires_at INTEGER NOT NULL)');
        run('DELETE FROM invites WHERE client_id=?', c.id);
        run('INSERT INTO invites VALUES(?,?,?)', inviteHash, c.id, Date.now() + 7 * 86400000);
        const origin = process.env.APP_URL || `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
        return json(res, 200, { inviteUrl: `${origin}/?invite=${inviteToken}` });
    }
    if (pathname === '/api/projects' && method === 'POST') {
        ownerOnly(user);
        const b = await readBody(req);
        ownedClient(user, required(b.clientId, 'Client'));
        const projectId = id();
        run('INSERT INTO projects VALUES(?,?,?,?,?,?,?,?,?,?)', projectId, user.id, b.clientId, required(b.name, 'Project name'), String(b.description || ''), String(b.type || 'Design'), 'Planning', money(b.budget || 0), String(b.deadline || ''), now());
        activity(projectId, user.name, 'created the project');
        return json(res, 201, { id: projectId });
    }
    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === 'GET') {
        const p = projectAccess(user, projectMatch[1]);
        return json(res, 200, { ...p, deliverables: all('SELECT * FROM deliverables WHERE project_id=? ORDER BY created_at DESC', p.id).map(({ file_path, ...rest }) => rest), invoices: all('SELECT * FROM invoices WHERE project_id=? ORDER BY created_at DESC', p.id), contracts: all('SELECT * FROM contracts WHERE project_id=? ORDER BY created_at DESC', p.id), activities: all('SELECT * FROM activities WHERE project_id=? ORDER BY created_at DESC LIMIT 50', p.id) });
    }
    if (projectMatch && method === 'PATCH') {
        ownerOnly(user);
        const p = projectAccess(user, projectMatch[1], true);
        const b = await readBody(req);
        const statuses = ['Planning', 'In progress', 'In review', 'Completed', 'On hold'];
        if (b.status !== undefined && !statuses.includes(b.status))
            fail(400, 'Invalid project status');
        run('UPDATE projects SET status=?,deadline=?,budget=? WHERE id=?', b.status ?? p.status, b.deadline ?? p.deadline, b.budget === undefined ? p.budget : money(b.budget), p.id);
        activity(p.id, user.name, 'updated the project');
        return json(res, 200, { ok: true });
    }
    if (pathname === '/api/deliverables' && method === 'POST') {
        ownerOnly(user);
        const b = await readBody(req);
        const p = projectAccess(user, required(b.projectId, 'Project'), true);
        const deliverableId = id();
        run('INSERT INTO deliverables(id,project_id,title,description,created_at) VALUES(?,?,?,?,?)', deliverableId, p.id, required(b.title, 'Title'), String(b.description || ''), now());
        activity(p.id, user.name, `added deliverable: ${b.title}`);
        return json(res, 201, { id: deliverableId });
    }
    const deliverableMatch = pathname.match(/^\/api\/deliverables\/([^/]+)(?:\/(upload|download|review))?$/);
    if (deliverableMatch) {
        const { d, p } = deliverableAccess(user, deliverableMatch[1]);
        const action = deliverableMatch[2];
        if (action === 'upload' && method === 'POST') {
            ownerOnly(user);
            const b = await readBody(req);
            const filename = path.basename(required(b.filename, 'Filename')).replace(/[^\w.() -]/g, '_').slice(0, 120);
            const content = required(b.data, 'File');
            if (!/^data:[^;]+;base64,/.test(content))
                fail(400, 'Expected base64 file');
            const buffer = Buffer.from(content.split(',')[1], 'base64');
            if (buffer.length > 8 * 1024 * 1024)
                fail(413, 'File must be 8 MB or smaller');
            const fileId = id();
            const uploadDir = path.join(dataDir, 'uploads');
            fs.mkdirSync(uploadDir, { recursive: true });
            fs.writeFileSync(path.join(uploadDir, fileId), buffer, { flag: 'wx' });
            run('UPDATE deliverables SET version=CASE WHEN file_path="" THEN 1 ELSE version+1 END,file_name=?,file_path=?,status="In review",feedback="" WHERE id=?', filename, fileId, d.id);
            activity(p.id, user.name, `uploaded ${filename} for ${d.title}`);
            return json(res, 200, { ok: true });
        }
        if (action === 'download' && method === 'GET') {
            if (!d.file_path)
                fail(404, 'No file uploaded');
            const file = path.join(dataDir, 'uploads', d.file_path);
            if (!fs.existsSync(file))
                fail(404, 'File missing');
            res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${d.file_name.replace(/["\\\r\n]/g, '_')}"`, 'X-Content-Type-Options': 'nosniff' });
            return fs.createReadStream(file).pipe(res);
        }
        if (action === 'review' && method === 'POST') {
            if (user.role !== 'client' || p.client_user_id !== user.id)
                fail(403, 'Client approval required');
            const b = await readBody(req);
            if (!['Approved', 'Changes requested'].includes(b.status))
                fail(400, 'Invalid review');
            if (!d.file_path)
                fail(400, 'Upload a file before requesting review');
            run('UPDATE deliverables SET status=?,feedback=? WHERE id=?', b.status, String(b.feedback || ''), d.id);
            activity(p.id, user.name, `${b.status.toLowerCase()} ${d.title}`);
            return json(res, 200, { ok: true });
        }
    }
    if (pathname === '/api/invoices' && method === 'POST') {
        ownerOnly(user);
        const b = await readBody(req);
        const p = projectAccess(user, required(b.projectId, 'Project'), true);
        const invoiceId = id();
        const number = `CF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        run('INSERT INTO invoices VALUES(?,?,?,?,?,?,?,?)', invoiceId, p.id, number, money(b.amount), String(b.dueDate || ''), 'Draft', String(b.notes || ''), now());
        activity(p.id, user.name, `created invoice ${number}`);
        return json(res, 201, { id: invoiceId });
    }
    const invoiceMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/);
    if (invoiceMatch && method === 'PATCH') {
        ownerOnly(user);
        const { i, p } = invoiceAccess(user, invoiceMatch[1]);
        const b = await readBody(req);
        if (!['Draft', 'Sent', 'Paid', 'Void'].includes(b.status))
            fail(400, 'Invalid invoice status');
        run('UPDATE invoices SET status=? WHERE id=?', b.status, i.id);
        activity(p.id, user.name, `marked invoice ${i.number} ${b.status.toLowerCase()}`);
        return json(res, 200, { ok: true });
    }
    if (pathname === '/api/contracts' && method === 'POST') {
        ownerOnly(user);
        const b = await readBody(req);
        const p = projectAccess(user, required(b.projectId, 'Project'), true);
        const contractId = id();
        run('INSERT INTO contracts(id,project_id,title,body,created_at) VALUES(?,?,?,?,?)', contractId, p.id, required(b.title, 'Title'), required(b.body, 'Contract text'), now());
        activity(p.id, user.name, 'created a contract');
        return json(res, 201, { id: contractId });
    }
    const contractMatch = pathname.match(/^\/api\/contracts\/([^/]+)\/sign$/);
    if (contractMatch && method === 'POST') {
        const { c, p } = contractAccess(user, contractMatch[1]);
        if (user.role !== 'client' || p.client_user_id !== user.id)
            fail(403, 'Client signature required');
        if (c.status === 'Signed')
            fail(409, 'Already signed');
        const b = await readBody(req);
        if (required(b.name, 'Signature') !== user.name)
            fail(400, 'Type your account name to sign');
        run('UPDATE contracts SET status="Signed",signed_by=?,signed_at=? WHERE id=?', user.name, now(), c.id);
        activity(p.id, user.name, `signed ${c.title}`);
        return json(res, 200, { ok: true });
    }
    fail(404, 'Not found');
};
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/api/accept-invite' && req.method === 'POST') {
            const b = await readBody(req);
            db.exec('CREATE TABLE IF NOT EXISTS invites(token_hash TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES clients(id), expires_at INTEGER NOT NULL)');
            const invite = get('SELECT i.*,c.email,c.name FROM invites i JOIN clients c ON c.id=i.client_id WHERE i.token_hash=? AND i.expires_at>?', hash(String(b.token || '')), Date.now());
            if (!invite)
                fail(400, 'Invitation is invalid or expired');
            const password = required(b.password, 'Password');
            if (password.length < 8)
                fail(400, 'Password must be at least 8 characters');
            let user = get('SELECT * FROM users WHERE email=?', invite.email);
            if (user && user.role !== 'client')
                fail(409, 'Email already in use');
            if (!user) {
                const uid = id();
                run('INSERT INTO users VALUES(?,?,?,?,?,?)', uid, invite.name, invite.email, passwordHash(password), 'client', now());
                user = get('SELECT * FROM users WHERE id=?', uid);
            }
            else if (!verifyPassword(password, user.password))
                fail(401, 'Existing client account: incorrect password');
            run('UPDATE clients SET user_id=? WHERE id=?', user.id, invite.client_id);
            run('DELETE FROM invites WHERE token_hash=?', invite.token_hash);
            session(res, user.id);
            return json(res, 200, { ok: true });
        }
        if (url.pathname.startsWith('/api/'))
            return await route(req, res, url);
        if (req.method !== 'GET')
            fail(405, 'Method not allowed');
        const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!['index.html', 'app.js', 'styles.css',"logo.svg","logo.png"].includes(requested))
            fail(404, 'Not found');
        const mimeTypes = {'.html': 'text/html','.js': 'text/javascript','.css': 'text/css','.svg': 'image/svg+xml','.png': 'image/png'};
        const type = mimeTypes[path.extname(requested)]
  || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        fs.createReadStream(path.join(root, 'public', requested)).pipe(res);
    }
    catch (e) {
        if (!res.headersSent)
            json(res, e.status || 500, { error: e.status ? e.message : 'Unexpected server error' });
        else
            res.end();
        if (!e.status)
            console.error(e);
    }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, () => console.log(`CreativeFlow running at http://localhost:${port}`));

