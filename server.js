require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const STORE_KEY = 'agenda-decoracao';

const DEFAULT_THEMES = [
  'Á DECIDIR',
  'A BELA E A FERA',
  'ALICE NO PAÍS DAS MARAVILHAS',
  'ANOS OITENTA',
  'ARLEQUINA',
  'ASTRONAUTA',
  'BABY SHARK',
  'BAILARINA',
  'BARBIE',
  'BLUEY',
  'BOIADEIRA',
  'BOLOFOFOS',
  'BORBOLETA',
  'BRANCA DE NEVE',
  'CARROS',
  'CHÁ DE BEBÊ',
  'CHÁ REVELAÇÃO',
  'CHAPEUZINHO VERMELHO',
  'CHAVES',
  'CINDERELA',
  'CIRCO',
  'CONFEITARIA',
  'CONSTRUÇÃO',
  'DINO BABY',
  'DINOSSAUROS',
  'DRAGON BALL',
  'ENCANTO',
  'FAZENDINHA',
  'FROZEN',
  'FUNDO DO MAR',
  'FUTEBOL',
  'HARRY POTTER',
  'HERÓIS',
  'HOMEM ARANHA',
  'JARDIM ENCANTADO',
  'LADY BUG',
  'LEGO',
  'MICKEY',
  'MINECRAFT',
  'MINIONS',
  'MINNIE ROSA',
  'MOANA',
  'MULHER MARAVILHA',
  'MUNDO BITA',
  'NÃO TERÁ',
  'NARUTO',
  'NEON',
  'ONE PIECE',
  'PATRULHA CANINA',
  'PEPPA PIG',
  'PEQUENA SEREIA',
  'PEQUENO PRÍNCIPE',
  'POKEMON',
  'PRINCESAS',
  'ROBLOX',
  'SAFARI',
  'SEREIA',
  'SONIC',
  'STITCH',
  'SUPER MÁRIO',
  'TIK TOK',
  'TIME: CORINTHIANS',
  'TIME: PALMEIRAS',
  'TIME: SANTOS',
  'TIME: SÃO PAULO',
  'TOY STORY',
  'TURMA DA DISNEY',
  'TURMA DA MÔNICA',
  'UNICÓRNIO',
  'VINGADORES',
  'WANDINHA'
];

const DEFAULT_STATE = () => ({
  settings: {
    site_title: 'Agenda de Decoração | Biruta Park',
    logo_url: '/public/assets/logo.svg',
    favicon_url: '/public/assets/favicon.svg'
  },
  agenda_users: [
    { id: 1, login: 'decoracao', password: 'Biruta@2026', name: 'ADMIN DECORAÇÃO', role: 'admin' }
  ],
  agenda_events: [],
  agenda_deleted_events: [],
  themes: DEFAULT_THEMES,
  next: { agenda: 1, agenda_user: 2 }
});

let data = DEFAULT_STATE();
let dbPool = null;

function upper(value) {
  return String(value || '').trim().toLocaleUpperCase('pt-BR');
}

function normalizeTheme(value) {
  const theme = upper(value);
  return theme || 'Á DECIDIR';
}

function normalizeEvent(ev) {
  return {
    ...ev,
    responsible_name: upper(ev.responsible_name),
    whatsapp: String(ev.whatsapp || '').trim(),
    birthday_name: upper(ev.birthday_name),
    birthday_age: upper(ev.birthday_age),
    has_arch: upper(ev.has_arch || 'NÃO'),
    theme: normalizeTheme(ev.theme),
    start_time: String(ev.start_time || '').trim(),
    end_time: String(ev.end_time || '').trim(),
    notes: upper(ev.notes)
  };
}

function normalizeUser(user) {
  return {
    ...user,
    name: upper(user.name),
    login: String(user.login || '').trim(),
    role: String(user.role || 'visualizacao').trim()
  };
}

function ensureData(source) {
  const def = DEFAULT_STATE();
  const d = source || def;
  d.settings = { ...def.settings, ...(d.settings || {}) };
  d.agenda_users = (d.agenda_users && d.agenda_users.length ? d.agenda_users : def.agenda_users).map(normalizeUser);
  d.agenda_events = (d.agenda_events || []).map(normalizeEvent);
  d.agenda_deleted_events = (d.agenda_deleted_events || []).map(normalizeEvent);
  d.themes = [...new Set([...(d.themes || def.themes), ...def.themes].map(normalizeTheme))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  d.next = d.next || {};
  d.next.agenda = Math.max(1, Math.max(0, ...d.agenda_events.map(e => Number(e.id) || 0), ...d.agenda_deleted_events.map(e => Number(e.id) || 0)) + 1);
  d.next.agenda_user = Math.max(2, Math.max(0, ...d.agenda_users.map(u => Number(u.id) || 0)) + 1);
  return d;
}

function initialDataFromFile() {
  const file = path.join(__dirname, 'data', 'store.json');
  if (!fs.existsSync(file)) return DEFAULT_STATE();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      settings: raw.settings,
      agenda_users: raw.agenda_users,
      agenda_events: raw.agenda_events,
      agenda_deleted_events: raw.agenda_deleted_events,
      themes: raw.themes,
      next: raw.next
    };
  } catch {
    return DEFAULT_STATE();
  }
}

async function initStore() {
  if (!process.env.DATABASE_URL) {
    data = ensureData(initialDataFromFile());
    console.log('DATABASE_URL não configurado. Usando dados locais apenas para desenvolvimento.');
    return;
  }

  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });

  await dbPool.query(`CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`);

  const result = await dbPool.query('SELECT value FROM app_state WHERE key=$1', [STORE_KEY]);
  if (result.rowCount) {
    data = ensureData(result.rows[0].value);
  } else {
    data = ensureData(initialDataFromFile());
    await dbPool.query('INSERT INTO app_state(key,value,updated_at) VALUES($1,$2,now())', [STORE_KEY, data]);
  }
}

async function save(nextData) {
  data = ensureData(nextData);
  if (!dbPool) {
    fs.writeFileSync(path.join(__dirname, 'data', 'store.json'), JSON.stringify(data, null, 2));
    return;
  }
  await dbPool.query(`INSERT INTO app_state(key,value,updated_at) VALUES($1,$2,now())
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [STORE_KEY, data]);
}

async function reloadData() {
  if (!dbPool) return data;
  const result = await dbPool.query('SELECT value FROM app_state WHERE key=$1', [STORE_KEY]);
  if (result.rowCount) data = ensureData(result.rows[0].value);
  return data;
}

const cleanPhone = value => String(value || '').replace(/\D/g, '');
const whatsUrl = (phone, text = '') => {
  const digits = cleanPhone(phone);
  const fullPhone = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${fullPhone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

const agendaAuth = (req, res, next) => req.session.agendaUser ? next() : res.redirect('/agendadecoracao/login');
const agendaAdmin = (req, res, next) => (
  req.session.agendaUser && req.session.agendaUser.role === 'admin'
    ? next()
    : res.status(403).send('Acesso restrito ao administrador da agenda.')
);
const canEditAgenda = req => req.session.agendaUser && ['admin', 'equipe'].includes(req.session.agendaUser.role);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'agenda-decoracao-biruta',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

app.use(async (req, res, next) => {
  await reloadData();
  res.locals.s = data.settings || {};
  res.locals.agenda_user = req.session.agendaUser || null;
  res.locals.whatsUrl = whatsUrl;
  res.locals.canEditAgenda = () => canEditAgenda(req);
  next();
});

function agendaStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = [...(data.agenda_events || [])]
    .filter(e => new Date(`${e.date}T00:00:00`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.start_time || '').localeCompare(String(b.start_time || '')));
  const next30 = upcoming.slice(0, 30);
  const pending = next30.filter(e => String(e.theme || '').trim().toLocaleUpperCase('pt-BR') === 'Á DECIDIR');
  return { upcoming, next30, pending };
}

app.get('/', (req, res) => res.redirect('/agendadecoracao'));
app.get('/agendamonise*', (req, res) => res.redirect('/agendadecoracao'));
app.get('/agendadecoracao/login', (req, res) => res.render('admin-login', { error: null, mode: 'agenda' }));
app.post('/agendadecoracao/login', (req, res) => {
  const u = (data.agenda_users || []).find(user => user.login === String(req.body.login || '').trim());
  if (u && req.body.password === u.password) {
    req.session.agendaUser = { id: u.id, login: u.login, name: u.name, role: u.role };
    return res.redirect('/agendadecoracao');
  }
  res.render('admin-login', { error: 'Login ou senha inválidos', mode: 'agenda' });
});
app.get('/agendadecoracao/logout', (req, res) => {
  delete req.session.agendaUser;
  res.redirect('/agendadecoracao/login');
});
app.get('/agendadecoracao', agendaAuth, (req, res) => {
  res.render('agenda-dashboard', { saved: req.query.saved, restored: req.query.restored, stats: agendaStats() });
});
app.get('/agendadecoracao/calendario', agendaAuth, (req, res) => {
  const today = new Date();
  const year = Number(req.query.year || today.getFullYear());
  const month = Number(req.query.month || today.getMonth() + 1);
  res.render('agenda', { year, month, events: data.agenda_events || [], themes: data.themes || [], saved: req.query.saved, restored: req.query.restored, stats: agendaStats() });
});
app.get('/agendadecoracao/dia/:date', agendaAuth, (req, res) => {
  const date = req.params.date;
  const events = (data.agenda_events || [])
    .filter(e => e.date === date)
    .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  res.render('agenda-day', { date, events, themes: data.themes || [], edit: null });
});
app.get('/agendadecoracao/editar/:id', agendaAuth, (req, res) => {
  const ev = (data.agenda_events || []).find(e => e.id == req.params.id);
  if (!ev) return res.redirect('/agendadecoracao');
  const events = (data.agenda_events || [])
    .filter(e => e.date === ev.date)
    .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  res.render('agenda-day', { date: ev.date, events, themes: data.themes || [], edit: ev });
});
app.post('/agendadecoracao/salvar', agendaAuth, async (req, res) => {
  if (!canEditAgenda(req)) return res.status(403).send('Seu usuário pode apenas visualizar a agenda.');

  let theme = normalizeTheme(req.body.theme);
  const custom = upper(req.body.custom_theme);
  if (theme === 'PERSONALIZADO' && custom) theme = custom;
  if (theme && !data.themes.includes(theme)) data.themes.push(theme);

  const obj = normalizeEvent({
    date: req.body.date,
    responsible_name: req.body.responsible_name,
    whatsapp: req.body.whatsapp,
    birthday_name: req.body.birthday_name,
    birthday_age: req.body.birthday_age,
    has_arch: req.body.has_arch || 'NÃO',
    theme,
    start_time: req.body.start_time,
    end_time: req.body.end_time,
    notes: req.body.notes,
    updated_at: new Date().toISOString()
  });

  if (req.body.id) {
    const ev = data.agenda_events.find(e => e.id == req.body.id);
    if (ev) Object.assign(ev, obj);
  } else {
    data.agenda_events.push({ id: data.next.agenda++, ...obj, created_at: new Date().toISOString() });
  }

  await save(data);
  const [y, m] = obj.date.split('-');
  res.redirect(`/agendadecoracao/calendario?year=${Number(y)}&month=${Number(m)}&saved=1`);
});
app.post('/agendadecoracao/excluir/:id', agendaAuth, async (req, res) => {
  if (!canEditAgenda(req)) return res.status(403).send('Seu usuário pode apenas visualizar a agenda.');
  const ev = data.agenda_events.find(e => e.id == req.params.id);
  if (ev) {
    data.agenda_events = data.agenda_events.filter(e => e.id != req.params.id);
    data.agenda_deleted_events.unshift({ ...ev, deleted_at: new Date().toISOString(), deleted_by: req.session.agendaUser?.login || '' });
    await save(data);
    const [y, m] = ev.date.split('-');
    return res.redirect(`/agendadecoracao/calendario?year=${Number(y)}&month=${Number(m)}&saved=1`);
  }
  res.redirect('/agendadecoracao');
});
app.get('/agendadecoracao/lixeira', agendaAuth, agendaAdmin, (req, res) => {
  const deleted = [...(data.agenda_deleted_events || [])].sort((a, b) => String(b.deleted_at || '').localeCompare(String(a.deleted_at || '')));
  res.render('agenda-trash', { events: deleted });
});
app.post('/agendadecoracao/restaurar/:id', agendaAuth, agendaAdmin, async (req, res) => {
  const ev = (data.agenda_deleted_events || []).find(e => e.id == req.params.id);
  if (ev) {
    data.agenda_deleted_events = data.agenda_deleted_events.filter(e => e.id != req.params.id);
    const restored = { ...ev, restored_at: new Date().toISOString() };
    delete restored.deleted_at;
    delete restored.deleted_by;
    data.agenda_events.push(restored);
    await save(data);
    const [y, m] = restored.date.split('-');
    return res.redirect(`/agendadecoracao/calendario?year=${Number(y)}&month=${Number(m)}&restored=1`);
  }
  res.redirect('/agendadecoracao/lixeira');
});
app.post('/agendadecoracao/lixeira/:id/delete', agendaAuth, agendaAdmin, async (req, res) => {
  data.agenda_deleted_events = (data.agenda_deleted_events || []).filter(e => e.id != req.params.id);
  await save(data);
  res.redirect('/agendadecoracao/lixeira');
});
app.get('/agendadecoracao/usuarios', agendaAuth, agendaAdmin, (req, res) => {
  res.render('agenda-users', { users: data.agenda_users || [], error: null, ok: null });
});
app.post('/agendadecoracao/usuarios', agendaAuth, agendaAdmin, async (req, res) => {
  const obj = normalizeUser({ name: req.body.name, login: req.body.login, role: req.body.role || 'visualizacao' });
  if (req.body.id) {
    const u = data.agenda_users.find(user => user.id == req.body.id);
    if (u) {
      u.name = obj.name;
      u.login = obj.login;
      u.role = obj.role;
      if (req.body.password) u.password = req.body.password;
    }
  } else {
    data.agenda_users.push({ id: data.next.agenda_user++, ...obj, password: req.body.password || '123456' });
  }
  await save(data);
  res.redirect('/agendadecoracao/usuarios');
});
app.post('/agendadecoracao/usuarios/:id/delete', agendaAuth, agendaAdmin, async (req, res) => {
  if (Number(req.params.id) !== req.session.agendaUser.id) {
    data.agenda_users = data.agenda_users.filter(u => u.id != req.params.id);
  }
  await save(data);
  res.redirect('/agendadecoracao/usuarios');
});
app.get('/agendadecoracao/relatorio', agendaAuth, (req, res) => {
  const start = req.query.start || '';
  const end = req.query.end || '';
  const status = req.query.status || 'todas';
  let events = [...(data.agenda_events || [])].sort((a, b) => a.date.localeCompare(b.date) || String(a.start_time || '').localeCompare(String(b.start_time || '')));
  if (start) events = events.filter(e => e.date >= start);
  if (end) events = events.filter(e => e.date <= end);
  if (status === 'pendentes') events = events.filter(e => String(e.theme || '').trim().toLocaleUpperCase('pt-BR') === 'Á DECIDIR');
  if (status === 'confirmados') events = events.filter(e => String(e.theme || '').trim().toLocaleUpperCase('pt-BR') !== 'Á DECIDIR');
  res.render('agenda-report', { events, start, end, status });
});
app.get('/health', (req, res) => res.send('ok'));

initStore().then(() => {
  app.listen(process.env.PORT || 3000, () => console.log('Agenda de decoração online'));
}).catch(err => {
  console.error('Falha ao iniciar:', err.message);
  process.exit(1);
});
