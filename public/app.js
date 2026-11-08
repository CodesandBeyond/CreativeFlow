const app = document.querySelector('#app');
const state = { user: null, overview: null, page: 'dashboard', project: null, modal: null, authMode: 'login', invite: new URLSearchParams(location.search).get('invite') };
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const currency = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);
const date = v => v ? new Date(v.length === 10 ? v + 'T12:00:00' : v).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';
const statusClass = s => s === 'Completed' || s === 'Approved' || s === 'Paid' || s === 'Signed' ? 'green' : s === 'In review' || s === 'Sent' ? 'orange' : s === 'Changes requested' || s === 'Void' ? 'red' : s === 'Planning' || s === 'Draft' ? 'gray' : '';
const pill = s => `<span class="pill ${statusClass(s)}">${esc(s)}</span>`;
const api = async (path, method = 'GET', body) => { const res = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); const data = await res.json(); if (!res.ok)
    throw Error(data.error || 'Request failed'); return data; };
const toast = (message, error = false) => { document.querySelector('.toast')?.remove(); const el = document.createElement('div'); el.className = 'toast' + (error ? ' error' : ''); el.textContent = message; document.body.append(el); setTimeout(() => el.remove(), 4000); };
const icon = { dashboard: '◫', projects: '▦', clients: '♧', invoices: '▤', contracts: '✎', deliverables: '◈' };
const navItems = () => state.user?.role === 'client' ? ['dashboard', 'projects', 'invoices', 'contracts'] : ['dashboard', 'projects', 'clients', 'deliverables', 'contracts', 'invoices'];
const field = (name, label, type = 'text', value = '', extra = '') => `<div class="field"><label for="f-${name}">${esc(label)}</label>${type === 'textarea' ? `<textarea id="f-${name}" name="${name}" ${extra}>${esc(value)}</textarea>` : `<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`}</div>`;
const select = (name, label, options) => `<div class="field"><label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${options.map(o => `<option value="${esc(o.value ?? o)}">${esc(o.label ?? o)}</option>`).join('')}</select></div>`;
const empty = (title, subtitle) => `<div class="empty"><div class="big">✧</div><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div>`;
const projectIcon = type => type === 'Web Development' ? '⌘' : type === 'Illustration' ? '✿' : '✦';
async function refresh() { state.overview = await api('/overview'); if (state.project)
    state.project = await api('/projects/' + state.project.id); render(); }
function authView() {
    const invite = !!state.invite;
    const register = state.authMode === 'register';
    app.innerHTML = `<div class="auth-page"><section class="auth-art"><div class="brand"><img src="/logo.svg" alt="CreativeFlow" class="site-logo"></div><div><div class="auth-eyebrow-accent eyebrow">Your creative business, in sync.</div><h1>Make room for the work you love.</h1><p>Manage clients, creative projects, approvals and payments in one calm, beautiful workspace.</p></div><div class="auth-graphic">✳</div><small class="auth-caption-accent">CREATIVE WORK. CLEAR FLOW.</small></section><section class="auth-right"><div class="auth-box"><div class="eyebrow">CREATIVEFLOW</div><h2>${invite ? 'Join your client portal' : register ? 'Create your workspace' : 'Welcome back'}</h2><p>${invite ? 'Set your password to access shared projects.' : register ? 'Start organizing your freelance business.' : 'Sign in to your creative workspace.'}</p><form class="form" id="auth-form">${register ? field('name', 'Your name', 'text', '', 'required maxlength="100"') : ''}${invite ? '' : field('email', 'Email address', 'email', '', 'required')}${field('password', invite ? 'Password (8+ characters)' : 'Password', 'password', '', 'required minlength="8"')}<button class="btn" type="submit">${invite ? 'Accept invitation' : register ? 'Create account' : 'Sign in'} →</button></form>${invite ? '<p class="notice">Use your existing client account password if you already have one.</p>' : `<p class="auth-switch-prompt">${register ? 'Already have an account?' : 'New to CreativeFlow?'} <button class="text-link" id="switch-auth">${register ? 'Sign in' : 'Create an account'}</button></p>`}</div></section></div>`;
    document.querySelector('#switch-auth')?.addEventListener('click', () => { state.authMode = register ? 'login' : 'register'; authView(); });
    document.querySelector('#auth-form').addEventListener('submit', async (e) => { e.preventDefault(); const b = Object.fromEntries(new FormData(e.target)); try {
        await api(invite ? '/accept-invite' : register ? '/register' : '/login', 'POST', invite ? { token: state.invite, password: b.password } : b);
        state.invite = null;
        history.replaceState(null, '', '/');
        await initialize();
    }
    catch (err) {
        toast(err.message, true);
    } });
}
async function initialize() { try {
    state.user = await api('/me');
    state.overview = await api('/overview');
    render();
}
catch {
    state.user = null;
    authView();
} }
function layout(body) { const page = state.page; app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><img src="/logo.svg" alt="CreativeFlow" class="site-logo"></div><div><p class="side-label">WORKSPACE</p><nav class="nav">${navItems().map(n => `<button data-nav="${n}" class="${page === n ? 'active' : ''}"><span class="symbol">${icon[n]}</span>${n[0].toUpperCase() + n.slice(1)}</button>`).join('')}</nav></div><div class="side-bottom"><strong>✧ Creative space</strong><p>Less admin, more time for your best creative work.</p><button class="btn secondary small" data-action="logout">Sign out</button></div></aside><div class="main"><div class="mobile-nav">${navItems().map(n => `<button data-nav="${n}">${n}</button>`).join('')}</div><header class="topbar"><div class="crumb">Workspace <span class="breadcrumb-divider">/</span> <strong class="breadcrumb-current">${page[0].toUpperCase() + page.slice(1)}</strong></div><div class="top-actions"><span class="text-xs muted">${esc(state.user.name)}</span><div class="avatar">${esc(state.user.name[0].toUpperCase())}</div></div></header><main class="content">${body}</main></div></div>${state.modal ? modalView() : ''}`; bind(); }
const heading = (title, subtitle, button = '') => `<div class="heading"><div><div class="eyebrow">YOUR WORKSPACE</div><h1>${title}</h1><p>${subtitle}</p></div>${button}</div>`;
function dashboard() {
    const o = state.overview;
    const active = o.projects.filter(p => p.status !== 'Completed');
    const pending = o.deliverables.filter(d => d.status === 'In review');
    const outstanding = o.invoices.filter(i => i.status === 'Sent');
    const upcoming = o.projects.filter(p => p.deadline && p.status !== 'Completed').sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
    const first = state.user.name.split(' ')[0];
    const stats = [[o.projects.length, 'Total projects', 'All your creative work', '▦'], [active.length, 'Active projects', 'Currently in progress', '◷'], [pending.length, 'Awaiting approval', 'Deliverables in review', '◈'], [currency(outstanding.reduce((a, i) => a + i.amount, 0)), 'Outstanding', 'Sent, unpaid invoices', '$']];
    return heading(`Good to see you, ${esc(first)} ✦`, 'Here’s what’s happening with your creative work.', state.user.role === 'freelancer' ? '<button class="btn" data-modal="project">＋ New project</button>' : '') + `<div class="welcome"><div><div class="welcome-eyebrow eyebrow">YOUR CREATIVE HQ</div><h2>Great work starts with a clear workflow.</h2><p>Keep every project, revision and payment moving forward.</p></div><div class="decoration">✳</div></div><div class="stats">${stats.map(([value, label, hint, sym]) => `<div class="stat"><span class="stat-icon">${sym}</span><div class="label">${label}</div><div class="value">${value}</div><div class="hint">${hint}</div></div>`).join('')}</div><div class="two-col"><section class="panel"><div class="panel-head"><h2>Recent projects</h2><button class="btn ghost small" data-nav="projects">View all →</button></div>${o.projects.length ? `<div class="project-list">${o.projects.slice(0, 5).map(p => `<div class="project-row" data-project="${p.id}"><div class="project-icon">${projectIcon(p.type)}</div><div><strong>${esc(p.name)}</strong><small>${esc(p.client_name)} · ${esc(p.type)}</small></div><div class="right">${pill(p.status)}<div class="deadline-caption"><small>${date(p.deadline)}</small></div></div></div>`).join('')}</div>` : empty('No projects yet', 'Create your first project to get started.')}</section><section class="panel"><h2>Upcoming deadlines</h2>${upcoming.length ? upcoming.map(p => `<div class="clickable-activity activity" data-project="${p.id}"><strong>${esc(p.name)}</strong><small>◷ ${date(p.deadline)}</small></div>`).join('') : empty('All caught up', 'No upcoming project deadlines.')}</section></div>`;
}
function projectsView() { const o = state.overview; return heading('Projects', 'Everything you’re creating, all in one place.', state.user.role === 'freelancer' ? '<button class="btn" data-modal="project">＋ New project</button>' : '') + (o.projects.length ? `<div class="cards">${o.projects.map(p => `<article class="project-card" data-project="${p.id}"><div class="item-top"><div class="project-icon">${projectIcon(p.type)}</div>${pill(p.status)}</div><h3>${esc(p.name)}</h3><p>${esc(p.description || p.type)}</p><div class="client-meta">Client: <strong>${esc(p.client_name)}</strong></div><footer><span>◷ ${date(p.deadline)}</span><strong>${currency(p.budget)}</strong></footer></article>`).join('')}</div>` : empty('No projects yet', 'Add a client, then create a project.')); }
function clientsView() { const o = state.overview; return heading('Clients', 'Build better relationships and keep everyone in the loop.', '<button class="btn" data-modal="client">＋ Add client</button>') + `<section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>Client</th><th>Email</th><th>Company</th><th>Projects</th><th>Portal</th><th></th></tr></thead><tbody>${o.clients.map(c => `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.email)}</td><td>${esc(c.company || '—')}</td><td>${o.projects.filter(p => p.client_id === c.id).length}</td><td>${c.user_id ? pill('Connected') : pill('Not invited')}</td><td><button class="btn secondary small" data-invite="${c.id}">${c.user_id ? 'Linked' : 'Invite client'}</button></td></tr>`).join('')}</tbody></table></div>${!o.clients.length ? empty('No clients yet', 'Add your first client to start a project.') : ''}</section>`; }
function deliverablesView() { const o = state.overview; return heading('Deliverables', 'Track every file, revision and approval.') + `<section class="panel">${o.deliverables.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Deliverable</th><th>Project</th><th>Version</th><th>Status</th><th></th></tr></thead><tbody>${o.deliverables.map(d => { const p = o.projects.find(p => p.id === d.project_id); return `<tr><td><strong>${esc(d.title)}</strong></td><td>${esc(p?.name || '')}</td><td>v${d.version}</td><td>${pill(d.status)}</td><td><button class="btn secondary small" data-project="${d.project_id}">Open →</button></td></tr>`; }).join('')}</tbody></table></div>` : empty('No deliverables yet', 'Add deliverables inside a project.')}</section>`; }
function invoicesView() { const o = state.overview; return heading('Invoices', 'Track your income and payment statuses.') + `<section class="panel">${o.invoices.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice</th><th>Project</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${o.invoices.map(i => { const p = o.projects.find(p => p.id === i.project_id); return `<tr><td><strong>${esc(i.number)}</strong></td><td>${esc(p?.name || '')}</td><td>${currency(i.amount)}</td><td>${date(i.due_date)}</td><td>${pill(i.status)}</td><td><button class="btn secondary small" data-project="${i.project_id}">Open →</button></td></tr>`; }).join('')}</tbody></table></div>` : empty('No invoices yet', 'Generate invoices inside your projects.')}</section>`; }
function contractsView() { return heading('Contracts', 'Keep agreements and signatures organized.') + `<section class="panel">${empty('Contracts live in projects', 'Open a project to create, review or sign its contracts.')}</section>`; }
function projectDetail() { const p = state.project; const freelancer = state.user.role === 'freelancer'; return `<div class="detail-top"><button class="btn secondary small" data-back>← All projects</button>${pill(p.status)}<span class="text-xs muted">${esc(p.type)} · ${esc(p.client_name)}</span></div>` + heading(esc(p.name), esc(p.description || 'Manage project milestones, files, and finances.'), freelancer ? '<button class="btn" data-modal="deliverable">＋ Add deliverable</button>' : '') + `<div class="stats"><div class="stat"><div class="label">Project budget</div><div class="value">${currency(p.budget)}</div></div><div class="stat"><div class="label">Deadline</div><div class="deadline-value value">${date(p.deadline)}</div></div><div class="stat"><div class="label">Deliverables</div><div class="value">${p.deliverables.length}</div></div><div class="stat"><div class="label">Approved</div><div class="value">${p.deliverables.filter(d => d.status === 'Approved').length}</div></div></div><div class="detail-grid"><section class="panel wide"><div class="panel-head"><h2>Deliverables & revisions</h2>${freelancer ? '<button class="btn secondary small" data-modal="deliverable">＋ Add</button>' : ''}</div>${p.deliverables.length ? p.deliverables.map(d => `<div class="item"><div class="item-top"><h3>${esc(d.title)} <span class="muted">· v${d.version}</span></h3>${pill(d.status)}</div><p>${esc(d.description)}</p>${d.file_name ? `<p>📎 ${esc(d.file_name)} <a href="/api/deliverables/${d.id}/download">Download file ↓</a></p>` : '<p>No file uploaded yet.</p>'}${d.feedback ? `<p><strong>Client feedback:</strong> ${esc(d.feedback)}</p>` : ''}<div class="item-actions">${freelancer ? `<button class="btn secondary small" data-upload="${d.id}">↑ Upload ${d.file_name ? 'new revision' : 'file'}</button>` : d.file_name && d.status === 'In review' ? `<button class="btn small" data-review="${d.id}" data-status="Approved">✓ Approve</button><button class="btn secondary small" data-review="${d.id}" data-status="Changes requested">Request changes</button>` : ''}</div></div>`).join('') : empty('No deliverables', 'Add a deliverable to begin review.')}</section><section class="panel"><div class="panel-head"><h2>Invoices</h2>${freelancer ? '<button class="btn secondary small" data-modal="invoice">＋ New</button>' : ''}</div>${p.invoices.length ? p.invoices.map(i => `<div class="item"><div class="item-top"><h3>${esc(i.number)}</h3>${pill(i.status)}</div><p>${currency(i.amount)} · Due ${date(i.due_date)}</p><p>${esc(i.notes)}</p>${freelancer ? `<div class="item-actions">${['Draft', 'Sent', 'Paid', 'Void'].filter(s => s !== i.status).map(s => `<button class="btn secondary small" data-invoice="${i.id}" data-status="${s}">${s === 'Paid' ? 'Mark paid' : s}</button>`).join('')}</div>` : ''}</div>`).join('') : empty('No invoices', 'Create an invoice for this project.')}</section><section class="panel"><div class="panel-head"><h2>Contracts</h2>${freelancer ? '<button class="btn secondary small" data-modal="contract">＋ New</button>' : ''}</div>${p.contracts.length ? p.contracts.map(c => `<div class="item"><div class="item-top"><h3>${esc(c.title)}</h3>${pill(c.status)}</div><p>${esc(c.body)}</p>${c.signed_at ? `<p>Signed by ${esc(c.signed_by)} on ${date(c.signed_at)}</p>` : ''}${!freelancer && c.status !== 'Signed' ? `<button class="btn small" data-sign="${c.id}">Sign agreement</button>` : ''}</div>`).join('') : empty('No contracts', 'Create a contract to formalize the work.')}</section><section class="panel wide"><div class="panel-head"><h2>Activity & project settings</h2>${freelancer ? `<button class="btn secondary small" data-modal="settings">Edit project</button>` : ''}</div>${p.activities.length ? p.activities.map(a => `<div class="activity"><strong>${esc(a.actor)} ${esc(a.action)}</strong><small>${date(a.created_at)}</small></div>`).join('') : empty('No activity yet', 'Updates will appear here.')}</section></div>`; }
function modalView() {
    const m = state.modal;
    let title = '', content = '';
    const clients = state.overview.clients;
    const p = state.project;
    if (m.type === 'client') {
        title = 'Add a client';
        content = field('name', 'Client name', 'text', '', 'required') + field('email', 'Email address', 'email', '', 'required') + field('company', 'Company (optional)') + field('notes', 'Notes', 'textarea');
    }
    if (m.type === 'project') {
        title = 'Create a project';
        content = clients.length ? select('clientId', 'Client', clients.map(c => ({ value: c.id, label: c.name }))) + field('name', 'Project name', 'text', '', 'required') + field('description', 'Project brief', 'textarea') + select('type', 'Project type', ['Branding', 'Graphic Design', 'Web Development', 'Illustration', 'Marketing', 'Other']) + field('budget', 'Budget (USD)', 'number', '0', 'min="0" step="0.01"') + field('deadline', 'Deadline', 'date') : '<p>Add a client before creating a project.</p>';
    }
    if (m.type === 'deliverable') {
        title = 'Add deliverable';
        content = field('title', 'Deliverable title', 'text', '', 'required') + field('description', 'Description', 'textarea');
    }
    if (m.type === 'invoice') {
        title = 'Create invoice';
        content = field('amount', 'Amount (USD)', 'number', String(p?.budget || 0), 'min="0" step="0.01" required') + field('dueDate', 'Due date', 'date') + field('notes', 'Invoice notes', 'textarea');
    }
    if (m.type === 'contract') {
        title = 'Create contract';
        content = field('title', 'Agreement title', 'text', 'Service Agreement', 'required') + field('body', 'Contract terms', 'textarea', '', 'required');
    }
    if (m.type === 'settings') {
        title = 'Project settings';
        content = select('status', 'Status', ['Planning', 'In progress', 'In review', 'Completed', 'On hold'].map(s => ({ value: s, label: s }))) + field('deadline', 'Deadline', 'date', p.deadline) + field('budget', 'Budget', 'number', p.budget, 'min="0" step="0.01"');
    }
    if (m.type === 'review') {
        title = m.status === 'Approved' ? 'Approve deliverable' : 'Request changes';
        content = field('feedback', 'Feedback (optional)', 'textarea');
    }
    if (m.type === 'sign') {
        title = 'Sign contract';
        content = '<p class="notice">By signing, you confirm that you agree to the contract terms shown in the project.</p>' + field('name', `Type your full name: ${state.user.name}`, 'text', '', 'required');
    }
    if (m.type === 'upload') {
        title = 'Upload a revision';
        content = '<p class="notice">Files up to 8 MB. Uploading a new version resets its approval status to In review.</p>' + `<div class="field"><label for="upload-file">Select file</label><input id="upload-file" name="file" type="file" required></div>`;
    }
    if (m.type === 'invite') {
        title = 'Client invitation';
        content = `<p>Share this private invitation URL with your client. It expires after 7 days.</p><div class="field"><input id="invite-url" readonly value="${esc(m.url)}"></div><button class="btn secondary" type="button" id="copy-invite">Copy invitation link</button>`;
    }
    return `<div class="modal-bg" id="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="close" data-close aria-label="Close">×</button></div><form id="modal-form" class="form">${content}${m.type === 'invite' || m.type === 'project' && !clients.length ? '' : `<button class="btn" type="submit">${m.type === 'sign' ? 'Sign contract' : m.type === 'review' ? 'Submit review' : m.type === 'upload' ? 'Upload file' : 'Save changes'} →</button>`}</form></div></div>`;
}
function render() { if (!state.user)
    return authView(); if (state.page === 'detail' && !state.project)
    state.page = 'projects'; const body = state.page === 'dashboard' ? dashboard() : state.page === 'projects' ? projectsView() : state.page === 'clients' ? clientsView() : state.page === 'deliverables' ? deliverablesView() : state.page === 'invoices' ? invoicesView() : state.page === 'contracts' ? contractsView() : projectDetail(); layout(body); }
async function openProject(projectId) { try {
    state.project = await api('/projects/' + projectId);
    state.page = 'detail';
    render();
}
catch (err) {
    toast(err.message, true);
} }
async function submitModal(e) { e.preventDefault(); const m = state.modal; const b = Object.fromEntries(new FormData(e.target)); try {
    let result;
    if (m.type === 'client')
        result = await api('/clients', 'POST', b);
    if (m.type === 'project')
        result = await api('/projects', 'POST', b);
    if (m.type === 'deliverable')
        result = await api('/deliverables', 'POST', { ...b, projectId: state.project.id });
    if (m.type === 'invoice')
        result = await api('/invoices', 'POST', { ...b, projectId: state.project.id });
    if (m.type === 'contract')
        result = await api('/contracts', 'POST', { ...b, projectId: state.project.id });
    if (m.type === 'settings')
        result = await api('/projects/' + state.project.id, 'PATCH', b);
    if (m.type === 'review')
        result = await api('/deliverables/' + m.id + '/review', 'POST', { ...b, status: m.status });
    if (m.type === 'sign')
        result = await api('/contracts/' + m.id + '/sign', 'POST', b);
    if (m.type === 'upload') {
        const file = b.file;
        if (!file || !file.size)
            throw Error('Choose a file');
        if (file.size > 8 * 1024 * 1024)
            throw Error('File must be 8 MB or smaller');
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('Unable to read file')); reader.readAsDataURL(file); });
        result = await api('/deliverables/' + m.id + '/upload', 'POST', { filename: file.name, data });
    }
    state.modal = null;
    await refresh();
    toast('Saved successfully');
    if (m.type === 'project')
        await openProject(result.id);
}
catch (err) {
    toast(err.message, true);
} }
function bind() { document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', () => { state.page = el.dataset.nav; state.project = null; render(); })); document.querySelectorAll('[data-project]').forEach(el => el.addEventListener('click', () => openProject(el.dataset.project))); document.querySelectorAll('[data-modal]').forEach(el => el.addEventListener('click', () => { state.modal = { type: el.dataset.modal }; render(); })); document.querySelector('[data-back]')?.addEventListener('click', () => { state.page = 'projects'; state.project = null; render(); }); document.querySelector('[data-action="logout"]')?.addEventListener('click', async () => { await api('/logout', 'POST'); state.user = null; state.project = null; authView(); }); document.querySelectorAll('[data-invite]').forEach(el => el.addEventListener('click', async () => { try {
    const result = await api('/clients/invite', 'POST', { clientId: el.dataset.invite });
    if (result.linked) {
        toast('Existing client account connected');
        await refresh();
    }
    else {
        state.modal = { type: 'invite', url: result.inviteUrl };
        render();
    }
}
catch (err) {
    toast(err.message, true);
} })); document.querySelectorAll('[data-upload]').forEach(el => el.addEventListener('click', () => { state.modal = { type: 'upload', id: el.dataset.upload }; render(); })); document.querySelectorAll('[data-review]').forEach(el => el.addEventListener('click', () => { state.modal = { type: 'review', id: el.dataset.review, status: el.dataset.status }; render(); })); document.querySelectorAll('[data-sign]').forEach(el => el.addEventListener('click', () => { state.modal = { type: 'sign', id: el.dataset.sign }; render(); })); document.querySelectorAll('[data-invoice]').forEach(el => el.addEventListener('click', async () => { try {
    await api('/invoices/' + el.dataset.invoice, 'PATCH', { status: el.dataset.status });
    await refresh();
    toast('Invoice updated');
}
catch (err) {
    toast(err.message, true);
} })); document.querySelector('[data-close]')?.addEventListener('click', () => { state.modal = null; render(); }); document.querySelector('#modal-bg')?.addEventListener('click', e => { if (e.target.id === 'modal-bg') {
    state.modal = null;
    render();
} }); document.querySelector('#modal-form')?.addEventListener('submit', submitModal); document.querySelector('#copy-invite')?.addEventListener('click', async () => { try {
    await navigator.clipboard.writeText(document.querySelector('#invite-url').value);
    toast('Invitation link copied');
}
catch {
    document.querySelector('#invite-url').select();
    toast('Select and copy the invitation URL');
} }); if (state.modal?.type === 'settings')
    document.querySelector('[name="status"]').value = state.project.status; }
initialize();

