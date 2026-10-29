(() => {
'use strict';

/* ===== Dados fixos (planos de exemplo) ===== */
const REFEICOES = [
  { id: 'cafe',   bloco: 'Café da manhã', nome: 'Ovos mexidos, pão integral e mamão', kcal: 380 },
  { id: 'almoco', bloco: 'Almoço',        nome: 'Arroz, feijão, frango grelhado e salada', kcal: 650 },
  { id: 'lanche', bloco: 'Lanches',       nome: 'Iogurte natural com frutas e aveia', kcal: 220 },
  { id: 'jantar', bloco: 'Jantar',        nome: 'Omelete de legumes e batata-doce', kcal: 450 }
];
const TREINOS = [
  { id: 'cardio', nome: 'Cardio',      min: 30, kcal: 250, como: 'Caminhada rápida ou bicicleta em ritmo moderado. Mantenha a respiração firme, mas ainda consiga conversar.' },
  { id: 'musc',   nome: 'Musculação',  min: 45, kcal: 300, como: '3 séries de 12 repetições nos grandes grupos: pernas, costas, peito e ombros. Descanse 60 segundos entre as séries.' },
  { id: 'along',  nome: 'Alongamento', min: 15, kcal: 40,  como: 'Segure cada posição por 30 segundos, sem dor. Cubra pernas, costas, ombros e pescoço.' }
];

/* ===== Persistência (equivale ao SQLite/Room do app) ===== */
const CHAVE = 'vitalsync:v1';
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function hoje() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function novoDia() {
  return { data: hoje(), aguaMl: 0, refeicoes: {}, treinos: {}, deitar: '23:00', levantar: '07:30' };
}
function carregar() {
  try { const e = JSON.parse(localStorage.getItem(CHAVE)); if (e && e.hoje) return e; } catch (_) {}
  return { usuario: null, hoje: novoDia(), historico: [] };
}
function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (_) {} }
let estado = carregar();

/* ===== CalculadoraSaude (regras de negócio) ===== */
const Calc = {
  metaAgua: u => (u ? Math.round(u.peso * 35) : 2600),                 // 35 ml x kg
  metaKcal: u => {
    if (!u) return 2000;
    const ajuste = { perder: -400, ganhar: 400, manter: 0 }[u.objetivo] || 0;
    return Math.round(u.peso * 30 + ajuste);
  },
  pct: (v, m) => (m > 0 ? (v / m) * 100 : 0),                          // (ingerido / meta) * 100
  consumo: d => REFEICOES.reduce((s, r) => s + (d.refeicoes[r.id] ? r.kcal : 0), 0),
  gasto:   d => TREINOS.reduce((s, t) => s + (d.treinos[t.id] ? t.kcal : 0), 0),
  saldo: (u, d) => Calc.metaKcal(u) - Calc.consumo(d) + Calc.gasto(d), // Sandbox Calórico
  minutos: h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; },
  sono(dei, lev) {                                                      // Validador de Janela
    if (!dei || !lev) return null;
    const a = Calc.minutos(dei), b = Calc.minutos(lev);
    const dur = (b - a + 1440) % 1440;
    const desvio = Math.min(Math.abs(a - 1380), 1440 - Math.abs(a - 1380)); // meta: 23h00
    const score = Math.max(0, Math.round(100 - Math.abs(dur - 510) * 0.3 - desvio * 0.15)); // meta: 8h30
    return { dur, score };
  }
};

/* ===== Reset diário (equivale ao ResetDiarioWorker) ===== */
function resumo(d, u) {
  const s = Calc.sono(d.deitar, d.levantar);
  return {
    data: d.data,
    aguaPct: Math.round(Calc.pct(d.aguaMl, Calc.metaAgua(u))),
    saldo: Calc.saldo(u, d),
    treinos: Object.values(d.treinos).filter(Boolean).length,
    sono: s ? s.score : 0
  };
}
function verificarVirada() {
  if (estado.hoje.data === hoje()) return;
  if (estado.usuario) estado.historico.push(resumo(estado.hoje, estado.usuario));
  estado.historico = estado.historico.slice(-30);
  estado.hoje = novoDia();
  salvar();
  render();
}

/* ===== Utilitários de tela ===== */
const fmtMl = n => n.toLocaleString('pt-BR') + ' ml';
const fmtH = m => Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
let tAviso;
function aviso(txt) {
  const el = $('#aviso'); el.textContent = txt; el.classList.add('on');
  clearTimeout(tAviso); tAviso = setTimeout(() => el.classList.remove('on'), 1800);
}
function anel(id, pct, alerta) {
  const el = $('#' + id);
  $('.prog', el).style.strokeDasharray = Math.min(100, Math.max(0, pct)) + ' 100';
  el.classList.toggle('alerta', !!alerta);
}

/* ===== Renderização ===== */
function renderDash() {
  const u = estado.usuario, d = estado.hoje;
  if (!u) return;
  $('#saudacao').textContent = 'Olá, ' + u.nome;

  const ma = Calc.metaAgua(u), pa = Calc.pct(d.aguaMl, ma);
  $('#aguaPct').textContent = Math.round(pa) + '%';
  $('#aguaTxt').textContent = fmtMl(d.aguaMl) + ' de ' + fmtMl(ma);
  anel('anelAgua', pa);

  const mk = Calc.metaKcal(u), cons = Calc.consumo(d), qm = Calc.gasto(d), sal = Calc.saldo(u, d);
  $('#kcalNum').textContent = Math.abs(sal).toLocaleString('pt-BR');
  $('#kcalRot').textContent = sal >= 0 ? 'kcal restantes' : 'kcal acima da meta';
  $('#kcalDet').textContent = `Meta ${mk} + treinos ${qm} − refeições ${cons} (kcal)`;
  anel('anelKcal', Calc.pct(cons, mk + qm), sal < 0);

  const feitos = TREINOS.filter(t => d.treinos[t.id]).length;
  $('#treinoNum').textContent = feitos + '/' + TREINOS.length;
  $('#treinoDet').textContent = qm + ' kcal gastas hoje';
  anel('anelTreino', Calc.pct(feitos, TREINOS.length));

  $('#sDeitar').value = d.deitar; $('#sLevantar').value = d.levantar;
  const s = Calc.sono(d.deitar, d.levantar);
  $('#sonoScore').textContent = s ? s.score : '—';
  $('#sonoMsg').textContent = !s ? 'Informe os horários.' :
    `Descanso de ${fmtH(s.dur)}. ` + (s.score >= 85 ? 'Janela ideal atingida.' : s.score >= 60 ? 'Bom, dá para melhorar.' : 'Abaixo da meta de 23h00 às 07h30.');
  anel('anelSono', s ? s.score : 0, s && s.score < 60);

  // Frequência dos últimos 7 dias
  let html = '';
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const iso = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    const reg = i === 0 ? { aguaPct: Math.round(pa) } : estado.historico.find(h => h.data === iso);
    const v = reg ? Math.min(100, reg.aguaPct) : 0;
    html += `<div class="dia"><span>${reg ? v + '%' : ''}</span><i class="${reg ? '' : 'vazio'}" style="height:${reg ? Math.max(v, 3) : 3}%"></i><span>${dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span></div>`;
  }
  $('#barras').innerHTML = html;
}

function textoSaldo() {
  const sal = Calc.saldo(estado.usuario, estado.hoje);
  return sal >= 0 ? `Saldo do dia: ${sal} kcal restantes` : `Meta ultrapassada em ${Math.abs(sal)} kcal`;
}
function renderNutri() {
  if (!estado.usuario) return;
  $('#saldoNutri').textContent = textoSaldo();
  const blocos = [...new Set(REFEICOES.map(r => r.bloco))];
  $('#listaNutri').innerHTML = blocos.map(b => `<div class="bloco"><h2>${b}</h2>` +
    REFEICOES.filter(r => r.bloco === b).map(r => {
      const f = estado.hoje.refeicoes[r.id];
      return `<button class="item ${f ? 'feito' : ''}" data-ref="${r.id}"><span class="check">${f ? '✓' : ''}</span><span>${r.nome}<small>${r.kcal} kcal</small></span></button>`;
    }).join('') + '</div>').join('');
}
function renderTreino() {
  if (!estado.usuario) return;
  $('#saldoTreino').textContent = textoSaldo();
  const abertos = $$('details.treino[open]').map(x => x.dataset.id);
  $('#listaTreino').innerHTML = TREINOS.map(t => {
    const f = estado.hoje.treinos[t.id];
    return `<details class="treino ${f ? 'feito' : ''}" data-id="${t.id}" ${abertos.includes(t.id) ? 'open' : ''}>
      <summary><span>${t.nome}</span><span class="suave">${t.min} min · ${t.kcal} kcal</span></summary>
      <p>${t.como}</p>
      <button class="grande-btn" data-treino="${t.id}">${f ? 'Treino concluído ✓ (toque para desfazer)' : 'Treino Concluído'}</button>
    </details>`;
  }).join('');
}
function render() { renderDash(); renderNutri(); renderTreino(); }

/* ===== Ações ===== */
function agua(n) {
  estado.hoje.aguaMl = Math.max(0, estado.hoje.aguaMl + n);
  salvar(); render();
  aviso(n > 0 ? `+${n} ml registrados` : 'Último registro desfeito');
}
function alternar(tipo, id) {
  estado.hoje[tipo][id] = !estado.hoje[tipo][id];
  salvar(); render();
  aviso(estado.hoje[tipo][id] ? 'Registrado' : 'Registro desfeito');
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-agua]');   if (a) return agua(+a.dataset.agua);
  const r = e.target.closest('[data-ref]');    if (r) return alternar('refeicoes', r.dataset.ref);
  const t = e.target.closest('[data-treino]'); if (t) return alternar('treinos', t.dataset.treino);
});
['sDeitar', 'sLevantar'].forEach(id => $('#' + id).addEventListener('change', () => {
  estado.hoje.deitar = $('#sDeitar').value; estado.hoje.levantar = $('#sLevantar').value;
  salvar(); render();
}));
$('#formPerfil').addEventListener('submit', e => {
  e.preventDefault();
  estado.usuario = {
    nome: $('#pNome').value.trim(), peso: +$('#pPeso').value,
    altura: +$('#pAltura').value, objetivo: $('#pObjetivo').value
  };
  salvar(); render();
  location.hash = '#dashboard'; rota();
});

/* ===== Rotas (as 4 telas) ===== */
function rota() {
  let h = location.hash.slice(1);
  if (!['perfil', 'dashboard', 'nutricao', 'treino'].includes(h)) h = 'dashboard';
  if (!estado.usuario) h = 'perfil';
  $$('.tela').forEach(s => s.hidden = s.id !== h);
  $$('#barra a').forEach(a => a.classList.toggle('ativo', a.getAttribute('href') === '#' + h));
  $('#barra').hidden = $('#fab').hidden = h === 'perfil';
  $('#btnPerfil').hidden = !estado.usuario || h === 'perfil';
  if (h === 'perfil' && estado.usuario) {
    $('#pNome').value = estado.usuario.nome; $('#pPeso').value = estado.usuario.peso;
    $('#pAltura').value = estado.usuario.altura; $('#pObjetivo').value = estado.usuario.objetivo;
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', rota);
document.addEventListener('visibilitychange', verificarVirada);
setInterval(verificarVirada, 30000);

verificarVirada();
render();
rota();
})();
