// =========================================================================
// BRIGADA BOXER - Calendário anual de reuniões
// Padrão: Geral = 3ª quarta-feira do mês. Líderes = a combinar, 7 a 10 dias
// antes da Geral (opcional). Exceções ficam em reunioes_agenda.
// =========================================================================

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Início da gestão atual da brigada (meses anteriores não entram nas contas)
const INICIO_GESTAO = "2026-08-10"; // Semana de Treinamento (10 a 13/08/2026)

// A gestão vai de agosto a agosto (13 meses: ago/AAAA até ago/AAAA+1)
const hojeD = new Date();
let ano = hojeD.getMonth() >= 7 ? hojeD.getFullYear() : hojeD.getFullYear() - 1; // ano de início da gestão
let periodo = [];
function montarPeriodo() {
  periodo = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(ano, 7 + i, 1);
    periodo.push({ a: d.getFullYear(), m: d.getMonth() });
  }
}
const A = (k) => periodo[k].a;
const M = (k) => periodo[k].m;
let agenda = [];
let atas = [];
let presencas = [];
let eventos = [];
let editando = null; // { tipo, mes }

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  document.getElementById("ano-anterior").addEventListener("click", () => mudarAno(-1));
  document.getElementById("ano-seguinte").addEventListener("click", () => mudarAno(1));
  document.getElementById("modal-agenda-fechar").addEventListener("click", fecharModal);
  document.getElementById("modal-agenda").addEventListener("click", (e) => e.target.id === "modal-agenda" && fecharModal());
  document.getElementById("ag-situacao").addEventListener("change", ajustarModal);
  document.getElementById("ag-salvar").addEventListener("click", salvarAgenda);
  document.getElementById("ag-padrao").addEventListener("click", voltarPadrao);
  carregar();
});

function mudarAno(d) {
  ano += d;
  carregar();
}

// ---------------- Datas ----------------
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deISO = (s) => new Date(s + "T00:00:00");
const mesRef = (k) => `${A(k)}-${String(M(k) + 1).padStart(2, "0")}-01`;
function terceiraQuarta(a, m) {
  const d = new Date(a, m, 1);
  const primeira = 1 + ((3 - d.getDay() + 7) % 7); // quarta = 3
  return new Date(a, m, primeira + 14);
}
function somarDias(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const fmt = (s) => (s ? `${formatarDataBR(s)} (${DIAS_SEMANA[deISO(s).getDay()]})` : "-");

// ---------------- Dados ----------------
async function carregar() {
  montarPeriodo();
  document.getElementById("titulo-ano").textContent = `Gestão ${ano}–${ano + 1}`;
  if (!CONFIGURADO) return;
  try {
    const ini = `${ano}-06-01`;
    const fim = `${ano + 1}-08-31`;
    const [ag, at, ev] = await Promise.all([
      supabaseClient.from("reunioes_agenda").select("*").gte("mes", `${ano}-08-01`).lte("mes", fim),
      supabaseClient.from("atas").select("id,tipo,data_reuniao,arquivo_assinado_url").gte("data_reuniao", ini).lte("data_reuniao", fim),
      supabaseClient.from("calendario_eventos").select("*").lte("data_inicio", fim).order("data_inicio"),
    ]);
    eventos = (ev.data || []).filter((e) => (e.data_fim || e.data_inicio) >= `${ano}-08-01`);
    if (ag.error) throw ag.error;
    if (at.error) throw at.error;
    agenda = ag.data || [];
    atas = at.data || [];
    presencas = [];
    if (atas.length) {
      const { data, error } = await supabaseClient
        .from("ata_assinaturas")
        .select("ata_id,presente,justificativa,brigadista:brigadistas(nome,funcao)")
        .in("ata_id", atas.map((a) => a.id));
      if (error) throw error;
      presencas = data || [];
    }
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar o calendário: " + err.message, "error");
  }
  render();
}

function excecao(tipo, m) {
  return agenda.find((a) => a.tipo === tipo && a.mes === mesRef(m));
}

// Monta a programação do mês (prevista + o que realmente aconteceu)
function programacao(m) {
  const exG = excecao("Geral", m);
  const padraoG = iso(terceiraQuarta(A(m), M(m)));
  const geral = {
    tipo: "Geral",
    prevista: exG && exG.data ? exG.data : padraoG,
    padrao: padraoG,
    excecao: exG,
    situacaoAgenda: exG ? exG.situacao : "Agendada",
  };
  // ATA geral do mês: a mais próxima da data prevista
  const atasG = atas.filter((a) => a.tipo === "Geral" && a.data_reuniao.slice(0, 7) === mesRef(m).slice(0, 7));
  geral.ata = atasG.sort((a, b) => Math.abs(deISO(a.data_reuniao) - deISO(geral.prevista)) - Math.abs(deISO(b.data_reuniao) - deISO(geral.prevista)))[0] || null;

  const exL = excecao("Lideres", m);
  const base = deISO(geral.prevista);
  const lideres = {
    tipo: "Lideres",
    janelaIni: iso(somarDias(base, -10)),
    janelaFim: iso(somarDias(base, -7)),
    excecao: exL,
    prevista: exL && exL.data ? exL.data : null,
    situacaoAgenda: exL ? exL.situacao : "A combinar",
  };
  // ATA de líderes ligada a esta Geral: entre a Geral anterior e esta
  const geralAnterior = m === 0 ? iso(terceiraQuarta(ano, 6)) : programacaoSimples(m - 1);
  lideres.ata =
    atas
      .filter((a) => a.tipo === "Lideres" && a.data_reuniao > geralAnterior && a.data_reuniao <= geral.prevista)
      .sort((a, b) => b.data_reuniao.localeCompare(a.data_reuniao))[0] || null;
  return { geral, lideres };
}
function programacaoSimples(m) {
  const ex = excecao("Geral", m);
  return ex && ex.data ? ex.data : iso(terceiraQuarta(A(m), M(m)));
}

function statusDe(r) {
  const hoje = hojeISOLocal();
  if (r.ata) return { chave: "realizada", rotulo: "Realizada", data: r.ata.data_reuniao };
  if (r.situacaoAgenda === "Realizada") return { chave: "realizada", rotulo: "Realizada", data: r.prevista, foraDoSistema: true };
  if (r.situacaoAgenda === "Não necessária") return { chave: "cinza", rotulo: r.tipo === "Geral" ? "Não houve" : "Não necessária", data: null };
  if (r.situacaoAgenda === "Cancelada") return { chave: "cinza", rotulo: "Cancelada", data: r.prevista };
  if (r.tipo === "Lideres" && !r.prevista) {
    return r.janelaFim < hoje ? { chave: "cinza", rotulo: "Não registrada", data: null } : { chave: "prevista", rotulo: "A combinar", data: null };
  }
  if (r.prevista < hoje) return { chave: "atrasada", rotulo: "Não realizada", data: r.prevista };
  return { chave: "prevista", rotulo: r.prevista === hoje ? "Hoje" : "Prevista", data: r.prevista };
}

// ---------------- Render ----------------
function render() {
  const progs = periodo.map((_, k) => programacao(k));
  renderResumo(progs);
  document.getElementById("meses").innerHTML = progs
    .map((p, m) => {
      const atual = hojeD.getFullYear() === A(m) && hojeD.getMonth() === M(m);
      const evs = eventosDoMes(m);
      if (`${mesRef(m).slice(0, 7)}` < INICIO_GESTAO.slice(0, 7) && !p.geral.ata && !p.lideres.ata && !evs.length) {
        return `<section class="mes-card fora"><header class="mes-head"><h3>${MESES[M(m)]} <span class="mes-ano">${A(m)}</span></h3></header><div class="reuniao-bloco small text-muted">Antes do início da gestão da brigada.</div></section>`;
      }
      return `<section class="mes-card ${atual ? "atual" : ""}">
        <header class="mes-head"><h3>${MESES[M(m)]} <span class="mes-ano">${A(m)}</span></h3>${atual ? '<span class="badge badge-brigada">mês atual</span>' : ""}</header>
        ${evs.map(blocoEvento).join("")}
        ${mesRef(m).slice(0, 7) === INICIO_GESTAO.slice(0, 7) ? "" : blocoReuniao(p.lideres, m)}
        ${blocoReuniao(p.geral, m)}
      </section>`;
    })
    .join("");

  document.querySelectorAll(".btn-editar-ag").forEach((b) => b.addEventListener("click", () => abrirModal(b.dataset.tipo, +b.dataset.mes)));
  document.querySelectorAll(".num-pres").forEach((b) =>
    b.addEventListener("click", () => {
      const alvo = document.getElementById(b.dataset.alvo);
      const aberto = alvo.dataset.modo === b.dataset.modo && alvo.style.display !== "none";
      if (aberto) {
        alvo.style.display = "none";
        return;
      }
      const lista = presencas
        .filter((p) => p.ata_id === b.dataset.ata && p.presente === (b.dataset.modo === "presentes"))
        .map((p) => ({ ...p.brigadista, justificativa: p.justificativa }))
        .filter((x) => x.nome)
        .sort((a, c) => a.nome.localeCompare(c.nome));
      alvo.dataset.modo = b.dataset.modo;
      alvo.style.display = "block";
      alvo.innerHTML = lista.length
        ? lista
            .map(
              (x) => `<span class="pessoa-chip ${b.dataset.modo === "ausentes" ? "ausente" : ""}">${escHtml(x.nome)}${
                b.dataset.modo === "ausentes" && x.justificativa ? ` <i>— ${escHtml(x.justificativa)}</i>` : ""
              }</span>`
            )
            .join("")
        : '<span class="small text-muted">Ninguém.</span>';
    })
  );
}

function blocoReuniao(r, m) {
  const st = statusDe(r);
  const nome = r.tipo === "Geral" ? "Reunião Geral" : "Reunião de Líderes";
  let quando;
  if (st.data) quando = fmt(st.data);
  else if (r.tipo === "Lideres" && st.rotulo === "A combinar") quando = `entre ${formatarDataBR(r.janelaIni).slice(0, 5)} e ${formatarDataBR(r.janelaFim).slice(0, 5)}`;
  else quando = "—";
  const obs = r.excecao && r.excecao.observacao ? `<div class="reuniao-obs">${escHtml(r.excecao.observacao)}</div>` : "";
  const remarcada = r.tipo === "Geral" && r.prevista !== r.padrao && !r.ata ? '<span class="tag-remarcada">remarcada</span>' : "";

  let pres = "";
  if (!r.ata && st.foraDoSistema) pres = '<div class="small text-muted" style="margin:6px 0 0 21px;">Sem ATA/lista de presença no sistema.</div>';
  if (r.ata) {
    const ps = presencas.filter((p) => p.ata_id === r.ata.id);
    const np = ps.filter((p) => p.presente).length;
    const na = ps.length - np;
    const alvo = `pres-${r.tipo}-${m}`;
    pres = ps.length
      ? `<div class="pres-nums">
          <button class="num-pres ok" data-ata="${r.ata.id}" data-modo="presentes" data-alvo="${alvo}"><b>${np}</b> presentes ▾</button>
          <button class="num-pres ${na ? "falta" : ""}" data-ata="${r.ata.id}" data-modo="ausentes" data-alvo="${alvo}"><b>${na}</b> ausentes ▾</button>
          ${r.tipo === "Geral" ? (r.ata.arquivo_assinado_url ? `<a class="small" href="${escHtml(r.ata.arquivo_assinado_url)}" target="_blank">📎 ATA assinada</a>` : '<span class="small text-muted">ATA sem assinatura anexada</span>') : ""}
        </div>
        <div class="pres-lista" id="${alvo}" style="display:none;"></div>`
      : '<div class="small text-muted">Sem lista de presença.</div>';
  }
  const link = r.tipo === "Geral" ? "reuniao-geral.html" : "reuniao-lideres.html";
  return `<div class="reuniao-bloco st-${st.chave}">
    <div class="reuniao-linha">
      <i class="pt ${st.chave}"></i>
      <div class="reuniao-texto">
        <div class="reuniao-nome">${nome} ${remarcada}</div>
        <div class="reuniao-quando">${quando}</div>
      </div>
      <span class="badge st-badge-${st.chave}">${st.rotulo}</span>
      ${r.ata ? `<a class="btn-mini" href="${link}" title="Abrir reuniões">↗</a>` : `<button class="btn-mini btn-editar-ag" data-tipo="${r.tipo}" data-mes="${m}" title="Remarcar / exceção">✏️</button>`}
    </div>
    ${obs}${pres}
  </div>`;
}

function eventosDoMes(m) {
  const ini = mesRef(m);
  const fim = iso(new Date(A(m), M(m) + 1, 0));
  return eventos.filter((e) => e.data_inicio <= fim && (e.data_fim || e.data_inicio) >= ini);
}
const ICONE_EVENTO = { Treinamento: "🎓", Simulado: "🚨", Inspeção: "🔎", Manutenção: "🛠️", Comunicação: "📣", Outros: "📌" };
function blocoEvento(e) {
  const quando = e.data_fim && e.data_fim !== e.data_inicio
    ? `${formatarDataBR(e.data_inicio).slice(0, 5)} a ${formatarDataBR(e.data_fim)}`
    : fmt(e.data_inicio);
  const feito = (e.data_fim || e.data_inicio) < hojeISOLocal();
  return `<div class="reuniao-bloco evento">
    <div class="reuniao-linha">
      <span class="ev-icone">${ICONE_EVENTO[e.categoria] || "📌"}</span>
      <div class="reuniao-texto"><div class="reuniao-nome">${escHtml(e.titulo)}</div><div class="reuniao-quando">${quando}</div></div>
      <span class="badge ${feito ? "st-badge-realizada" : "st-badge-prevista"}">${feito ? "Realizado" : "Previsto"}</span>
    </div>
    ${e.observacao ? `<div class="reuniao-obs">${escHtml(e.observacao)}</div>` : ""}
  </div>`;
}

function renderResumo(progs) {
  const gerais = progs.map((p) => ({ ...p.geral, st: statusDe(p.geral) })).filter((g) => g.prevista >= INICIO_GESTAO || g.ata);
  const realizadas = gerais.filter((g) => g.st.chave === "realizada");
  const devidas = gerais.filter((g) => ["realizada", "atrasada"].includes(g.st.chave));
  const lid = progs.map((p) => statusDe(p.lideres)).filter((s, i) => s.chave === "realizada" && (progs[i].geral.prevista >= INICIO_GESTAO || progs[i].lideres.ata)).length;
  let presT = 0;
  let totT = 0;
  realizadas.filter((g) => g.ata).forEach((g) => {
    const ps = presencas.filter((p) => p.ata_id === g.ata.id);
    presT += ps.filter((p) => p.presente).length;
    totT += ps.length;
  });
  const prox = gerais.find((g) => g.st.chave === "prevista");
  document.getElementById("resumo-ano").innerHTML = `
    <div class="indicator-card concluida"><div class="value">${realizadas.length}<span class="de">/${devidas.length || 0}</span></div><div class="label">Reuniões gerais realizadas</div></div>
    <div class="indicator-card total"><div class="value">${lid}</div><div class="label">Reuniões de líderes</div></div>
    <div class="indicator-card andamento"><div class="value">${totT ? Math.round((presT / totT) * 100) + "%" : "-"}</div><div class="label">Presença média (gerais)</div></div>
    <div class="indicator-card"><div class="value" style="font-size:1.25rem;color:var(--grafite);">${prox ? fmt(prox.prevista) : "-"}</div><div class="label">Próxima reunião geral</div></div>`;
}

// ---------------- Modal ----------------
function abrirModal(tipo, m) {
  editando = { tipo, m };
  const ex = excecao(tipo, m);
  const p = programacao(m);
  const r = tipo === "Geral" ? p.geral : p.lideres;
  document.getElementById("modal-agenda-titulo").textContent = `${tipo === "Geral" ? "Reunião Geral" : "Reunião de Líderes"} — ${MESES[M(m)]} ${A(m)}`;
  document.getElementById("ag-situacao").value = ex ? ex.situacao : "Agendada";
  document.getElementById("ag-data").value = (ex && ex.data) || (tipo === "Geral" ? r.padrao : "");
  document.getElementById("ag-obs").value = (ex && ex.observacao) || "";
  document.getElementById("ag-dica").textContent =
    tipo === "Geral" ? `Padrão: ${fmt(r.padrao)} (3ª quarta-feira)` : `Sugestão: entre ${fmt(r.janelaIni)} e ${fmt(r.janelaFim)}`;
  ajustarModal();
  document.getElementById("modal-agenda").style.display = "flex";
}
function ajustarModal() {
  document.getElementById("wrap-ag-data").style.display = document.getElementById("ag-situacao").value === "Não necessária" ? "none" : "block";
}
function fecharModal() {
  document.getElementById("modal-agenda").style.display = "none";
  editando = null;
}

async function salvarAgenda() {
  if (!editando) return;
  const situacao = document.getElementById("ag-situacao").value;
  const data = situacao === "Não necessária" ? null : document.getElementById("ag-data").value || null;
  if (situacao === "Agendada" && !data) return showToast("Informe a data.", "error");
  const { error } = await supabaseClient.from("reunioes_agenda").upsert(
    { tipo: editando.tipo, mes: mesRef(editando.m), data, situacao, observacao: document.getElementById("ag-obs").value.trim() || null, updated_at: new Date().toISOString() },
    { onConflict: "tipo,mes" }
  );
  if (error) return showToast("Erro ao salvar: " + error.message, "error");
  showToast("Calendário atualizado.", "success");
  fecharModal();
  carregar();
}

async function voltarPadrao() {
  if (!editando) return;
  const ex = excecao(editando.tipo, editando.m);
  if (!ex) return fecharModal();
  // Volta ao padrão sem apagar o registro: Geral sem data própria; Líderes "a combinar"
  const { error } = await supabaseClient
    .from("reunioes_agenda")
    .update({ data: null, situacao: "Agendada", observacao: null, updated_at: new Date().toISOString() })
    .eq("id", ex.id);
  if (error) return showToast("Erro: " + error.message, "error");
  fecharModal();
  carregar();
}
