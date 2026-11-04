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
      supabaseClient.from("atas").select("id,tipo,data_reuniao,arquivo_assinado_url,extraordinaria,motivo").gte("data_reuniao", ini).lte("data_reuniao", fim),
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
        .select("ata_id,presente,justificativa,brigadista:brigadistas(nome,funcao,data_entrada,data_saida)")
        .in("ata_id", atas.map((a) => a.id));
      if (error) throw error;
      const dataAta = Object.fromEntries(atas.map((a) => [a.id, a.data_reuniao]));
      presencas = (data || []).filter((p) => !p.brigadista || participavaEm(p.brigadista, dataAta[p.ata_id]));
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
  const atasG = atas.filter((a) => a.tipo === "Geral" && !a.extraordinaria && a.data_reuniao.slice(0, 7) === mesRef(m).slice(0, 7));
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

// ---------------- Render (planilha) ----------------
const ICONE_EVENTO = { Treinamento: "🎓", Simulado: "🚨", Inspeção: "🔎", Manutenção: "🛠️", Comunicação: "📣", Outros: "📌" };

function eventosDoMes(m) {
  const ini = mesRef(m);
  const fim = iso(new Date(A(m), M(m) + 1, 0));
  return eventos.filter((e) => e.data_inicio <= fim && (e.data_fim || e.data_inicio) >= ini);
}

const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CLASSE_CEL = { realizada: "ok", prevista: "prev", atrasada: "atr", cinza: "cinza" };
let celulaAberta = null; // { linha, m }

function extrasDoMes(m) {
  const ym = mesRef(m).slice(0, 7);
  return atas.filter((a) => a.tipo === "Geral" && a.extraordinaria && a.data_reuniao.slice(0, 7) === ym).sort((a, b) => a.data_reuniao.localeCompare(b.data_reuniao));
}
const dia = (s) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) : "");
function contagem(ataId) {
  const ps = presencas.filter((p) => p.ata_id === ataId);
  const np = ps.filter((p) => p.presente).length;
  return { total: ps.length, np, na: ps.length - np };
}

// ---------------- Render (grade do ano) ----------------
function render() {
  const progs = periodo.map((_, k) => programacao(k));
  renderResumo(progs);
  const linhas = [
    { chave: "lideres", nome: "Reunião de Líderes", sub: "7 a 10 dias antes da Geral" },
    { chave: "geral", nome: "Reunião Geral", sub: "3ª quarta-feira do mês" },
    { chave: "extra", nome: "Extraordinárias", sub: "fora do calendário" },
    { chave: "eventos", nome: "Outras atividades", sub: "treinamentos, simulados…" },
  ];
  const cab = periodo
    .map((_, m) => {
      const atual = hojeD.getFullYear() === A(m) && hojeD.getMonth() === M(m);
      return `<th class="${atual ? "g-atual" : ""}">${MES_CURTO[M(m)]}<span>${String(A(m)).slice(2)}</span></th>`;
    })
    .join("");
  const corpo = linhas
    .map((l) => {
      const cels = periodo.map((_, m) => `<td class="g-td ${hojeD.getFullYear() === A(m) && hojeD.getMonth() === M(m) ? "g-atual" : ""}">${celula(l.chave, progs[m], m)}</td>`).join("");
      return `<tr class="g-linha g-${l.chave}"><th class="g-rot">${l.nome}<small>${l.sub}</small></th>${cels}</tr>`;
    })
    .join("");
  document.getElementById("meses").innerHTML = `<div class="table-wrap"><table class="cal-grade">
      <thead><tr><th class="g-rot">Atividade</th>${cab}</tr></thead>
      <tbody>${corpo}</tbody></table></div>
    <div id="cal-detalhe" class="cal-detalhe" style="display:none;"></div>`;
  document.querySelectorAll(".g-cel[data-linha]").forEach((b) => b.addEventListener("click", () => abrirDetalhe(b.dataset.linha, +b.dataset.mes)));
  if (celulaAberta) abrirDetalhe(celulaAberta.linha, celulaAberta.m, true);
}

function foraDaGestao(m, linha) {
  const ym = mesRef(m).slice(0, 7);
  const ini = INICIO_GESTAO.slice(0, 7);
  if (ym < ini) return true;
  return linha === "lideres" && ym === ini; // 1º mês: sem reunião de líderes (semana de treinamento)
}

function celula(linha, p, m) {
  const btn = (cls, html, titulo) => `<button type="button" class="g-cel ${cls}" data-linha="${linha}" data-mes="${m}" title="${escHtml(titulo)}">${html}</button>`;
  if (linha === "lideres" || linha === "geral") {
    if (foraDaGestao(m, linha)) return '<span class="g-vazio">—</span>';
    const r = linha === "geral" ? p.geral : p.lideres;
    const st = statusDe(r);
    let sub = st.rotulo;
    if (r.ata) {
      const c = contagem(r.ata.id);
      if (c.total) sub = `${c.np}✓${c.na ? " " + c.na + "✗" : ""}`;
      if (linha === "geral") sub += r.ata.arquivo_assinado_url ? " 📎" : "";
    }
    let quando = st.data ? dia(st.data) : "—";
    if (!st.data && st.rotulo === "A combinar") {
      quando = "a combinar";
      sub = r.janelaIni.slice(5, 7) === r.janelaFim.slice(5, 7) ? `${r.janelaIni.slice(8, 10)} a ${dia(r.janelaFim)}` : `${dia(r.janelaIni)}–${dia(r.janelaFim)}`;
    } else if (!st.data && st.rotulo === "Não registrada") sub = "sem registro";
    return btn(CLASSE_CEL[st.chave], `${quando}<small>${sub}</small>`, `${linha === "geral" ? "Reunião Geral" : "Reunião de Líderes"} — ${st.rotulo}. Clique para ver detalhes.`);
  }
  if (linha === "extra") {
    const ex = extrasDoMes(m);
    if (!ex.length) return '<span class="g-vazio">·</span>';
    return btn("extra", ex.map((a) => dia(a.data_reuniao)).join("<br>") + `<small>${ex.length > 1 ? ex.length + " reuniões" : "realizada"}</small>`, "Reunião extraordinária. Clique para ver detalhes.");
  }
  const evs = eventosDoMes(m);
  if (!evs.length) return '<span class="g-vazio">·</span>';
  return btn("ev", evs.map((e) => `${ICONE_EVENTO[e.categoria] || "📌"} ${dia(e.data_inicio)}`).join("<br>") + `<small>${evs.length > 1 ? evs.length + " atividades" : escHtml(e0(evs))}</small>`, evs.map((e) => e.titulo).join(" · "));
}
const e0 = (evs) => (evs[0].titulo.length > 14 ? evs[0].titulo.slice(0, 13) + "…" : evs[0].titulo);

// ---------------- Detalhe do quadrinho ----------------
function listaNomes(ataId, presente) {
  const l = presencas
    .filter((p) => p.ata_id === ataId && p.presente === presente && p.brigadista && p.brigadista.nome)
    .sort((a, b) => a.brigadista.nome.localeCompare(b.brigadista.nome));
  if (!l.length) return '<span class="small text-muted">Ninguém.</span>';
  return l.map((p) => `<span class="pessoa-chip ${presente ? "" : "ausente"}">${escHtml(p.brigadista.nome)}${!presente && p.justificativa ? ` <i>— ${escHtml(p.justificativa)}</i>` : ""}</span>`).join("");
}

function blocoAta(ata, link) {
  const c = contagem(ata.id);
  const assinada =
    ata.tipo === "Geral"
      ? ata.arquivo_assinado_url
        ? `<a href="${escHtml(ata.arquivo_assinado_url)}" target="_blank">📎 Abrir ATA assinada</a>`
        : '<span class="badge badge-warn">ATA assinada pendente</span>'
      : "";
  return `<div class="det-linha"><b>ATA:</b> registrada em ${fmt(ata.data_reuniao)} ${assinada ? " · " + assinada : ""} · <a href="${link}">↗ abrir a reunião</a></div>
    ${c.total ? `<div class="det-nomes"><b class="small">Presentes (${c.np}):</b> ${listaNomes(ata.id, true)}</div>
    <div class="det-nomes"><b class="small">Ausentes (${c.na}):</b> ${listaNomes(ata.id, false)}</div>` : '<div class="small text-muted">Sem lista de presença no sistema.</div>'}`;
}

function abrirDetalhe(linha, m, manter) {
  const box = document.getElementById("cal-detalhe");
  if (!manter && celulaAberta && celulaAberta.linha === linha && celulaAberta.m === m) {
    celulaAberta = null;
    box.style.display = "none";
    document.querySelectorAll(".g-cel.sel").forEach((x) => x.classList.remove("sel"));
    return;
  }
  celulaAberta = { linha, m };
  document.querySelectorAll(".g-cel.sel").forEach((x) => x.classList.remove("sel"));
  const alvo = document.querySelector(`.g-cel[data-linha="${linha}"][data-mes="${m}"]`);
  if (alvo) alvo.classList.add("sel");
  const p = programacao(m);
  const mesTxt = `${MESES[M(m)]} ${A(m)}`;
  let titulo = "";
  let html = "";
  if (linha === "lideres" || linha === "geral") {
    const r = linha === "geral" ? p.geral : p.lideres;
    const st = statusDe(r);
    titulo = `${linha === "geral" ? "Reunião Geral" : "Reunião de Líderes"} — ${mesTxt}`;
    const link = linha === "geral" ? "reuniao-geral.html" : "reuniao-lideres.html";
    let quando = st.data ? fmt(st.data) : r.tipo === "Lideres" && st.rotulo === "A combinar" ? `a combinar, entre ${fmt(r.janelaIni)} e ${fmt(r.janelaFim)}` : "—";
    const remarcada = r.tipo === "Geral" && r.prevista !== r.padrao && !r.ata ? ` <span class="tag-remarcada">remarcada (padrão: ${fmt(r.padrao)})</span>` : "";
    html += `<div class="det-linha"><span class="badge st-badge-${st.chave}">${st.rotulo}</span> <b>Data:</b> ${quando}${remarcada}</div>`;
    if (r.excecao && r.excecao.observacao) html += `<div class="det-linha"><b>Observação:</b> ${escHtml(r.excecao.observacao)}</div>`;
    if (r.ata) html += blocoAta(r.ata, link);
    else {
      const feita = st.chave === "realizada";
      html += `<div class="det-acoes">
        <label class="det-chk"><input type="checkbox" class="chk-cal chk-realizada" data-tipo="${r.tipo}" data-mes="${m}" ${feita ? "checked" : ""} /> Realizada (sem ATA no sistema)</label>
        <button class="btn btn-secondary btn-editar-ag" data-tipo="${r.tipo}" data-mes="${m}">✏️ Remarcar / exceção</button>
        <a class="btn btn-outline" href="${link}">↗ Ir para a reunião</a>
      </div>`;
    }
  } else if (linha === "extra") {
    titulo = `Reuniões extraordinárias — ${mesTxt}`;
    html = extrasDoMes(m)
      .map((a) => `<div class="det-bloco"><div class="det-linha"><span class="badge badge-extra">Extraordinária</span> <b>${fmt(a.data_reuniao)}</b>${a.motivo ? ` · <b>Motivo:</b> ${escHtml(a.motivo)}` : ""}</div>${blocoAta(a, "reuniao-geral.html")}</div>`)
      .join("");
  } else {
    titulo = `Outras atividades — ${mesTxt}`;
    html = eventosDoMes(m)
      .map((e) => {
        const quando = e.data_fim && e.data_fim !== e.data_inicio ? `${formatarDataBR(e.data_inicio)} a ${formatarDataBR(e.data_fim)}` : fmt(e.data_inicio);
        const feito = (e.data_fim || e.data_inicio) < hojeISOLocal();
        return `<div class="det-bloco"><div class="det-linha">${ICONE_EVENTO[e.categoria] || "📌"} <b>${escHtml(e.titulo)}</b> · ${quando} <span class="badge ${feito ? "st-badge-realizada" : "st-badge-prevista"}">${feito ? "Realizado" : "Previsto"}</span></div>${e.observacao ? `<div class="small text-muted">${escHtml(e.observacao)}</div>` : ""}</div>`;
      })
      .join("");
  }
  box.innerHTML = `<div class="row justify-between"><h3 style="margin:0;">${titulo}</h3><button class="modal-close" id="det-fechar" title="Fechar">✕</button></div><div class="mt-16">${html}</div>`;
  box.style.display = "block";
  box.querySelector("#det-fechar").addEventListener("click", () => abrirDetalhe(linha, m));
  box.querySelectorAll(".btn-editar-ag").forEach((b) => b.addEventListener("click", () => abrirModal(b.dataset.tipo, +b.dataset.mes)));
  box.querySelectorAll(".chk-realizada").forEach((c) => c.addEventListener("change", () => marcarRealizada(c)));
  if (!manter) box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Caixinha "Realizada" (reuniões sem ATA no sistema)
async function marcarRealizada(c) {
  const tipo = c.dataset.tipo;
  const m = +c.dataset.mes;
  const p = programacao(m);
  const r = tipo === "Geral" ? p.geral : p.lideres;
  const ex = excecao(tipo, m);
  if (c.checked && !r.prevista) {
    // Líderes sem data combinada: pede a data no formulário
    c.checked = false;
    abrirModal(tipo, m, "Realizada");
    return;
  }
  const situacao = c.checked ? "Realizada" : "Agendada";
  const data = r.prevista || null;
  const { error } = await supabaseClient.from("reunioes_agenda").upsert(
    { tipo, mes: mesRef(m), data: tipo === "Geral" && data === r.padrao && !c.checked ? null : data, situacao, observacao: ex ? ex.observacao : null, updated_at: new Date().toISOString() },
    { onConflict: "tipo,mes" }
  );
  if (error) {
    c.checked = !c.checked;
    return showToast("Erro ao salvar: " + error.message, "error");
  }
  showToast(c.checked ? "Reunião marcada como realizada." : "Marcação de realizada retirada.", "success");
  carregar();
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
  const nExtra = atas.filter((a) => a.tipo === "Geral" && a.extraordinaria && a.data_reuniao >= INICIO_GESTAO).length;
  document.getElementById("resumo-ano").innerHTML = `
    <div class="indicator-card concluida"><div class="value">${realizadas.length}<span class="de">/${devidas.length || 0}</span></div><div class="label">Reuniões gerais realizadas</div></div>
    <div class="indicator-card total"><div class="value">${lid}</div><div class="label">Reuniões de líderes</div></div>
    <div class="indicator-card"><div class="value" style="color:#7e22ce;">${nExtra}</div><div class="label">Reuniões extraordinárias</div></div>
    <div class="indicator-card andamento"><div class="value">${totT ? Math.round((presT / totT) * 100) + "%" : "-"}</div><div class="label">Presença média (gerais ordinárias)</div></div>
    <div class="indicator-card"><div class="value" style="font-size:1.25rem;color:var(--grafite);">${prox ? fmt(prox.prevista) : "-"}</div><div class="label">Próxima reunião geral</div></div>`;
}

// ---------------- Modal ----------------
function abrirModal(tipo, m, situacaoInicial) {
  editando = { tipo, m };
  const ex = excecao(tipo, m);
  const p = programacao(m);
  const r = tipo === "Geral" ? p.geral : p.lideres;
  document.getElementById("modal-agenda-titulo").textContent = `${tipo === "Geral" ? "Reunião Geral" : "Reunião de Líderes"} — ${MESES[M(m)]} ${A(m)}`;
  document.getElementById("ag-situacao").value = situacaoInicial || (ex ? ex.situacao : "Agendada");
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
  if ((situacao === "Agendada" || situacao === "Realizada") && !data) return showToast("Informe a data.", "error");
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
