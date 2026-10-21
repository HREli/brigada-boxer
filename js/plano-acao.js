// =========================================================================
// BRIGADA BOXER - Plano de Ação
// =========================================================================

let acoesCache = [];
let brigadistasParaDatalistPlano = [];

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  carregarBrigadistasPlano();
  carregarAcoes();

  document.getElementById("btn-add-manual").addEventListener("click", adicionarAcaoManual);
  document.getElementById("btn-export-plano-pdf").addEventListener("click", exportarPlanoPDF);
  document.getElementById("filtro-status").addEventListener("change", renderTabelaAcoes);
  document.getElementById("ordenar-por").addEventListener("change", renderTabelaAcoes);
  document.getElementById("busca-acao").addEventListener("input", renderTabelaAcoes);
  document.getElementById("filtro-origem").addEventListener("change", renderTabelaAcoes);
  document.querySelectorAll(".kpi").forEach((k) => k.addEventListener("click", () => filtrarPor(k.dataset.status)));
});

// ---------------- Brigadistas (autocomplete do responsável) ----------------
async function carregarBrigadistasPlano() {
  if (!CONFIGURADO) return;
  try {
    const { data, error } = await supabaseClient
      .from("brigadistas")
      .select("nome")
      .eq("ativo", true)
      .eq("e_brigadista", true)
      .order("nome");
    if (error) throw error;
    brigadistasParaDatalistPlano = data || [];
    document.getElementById("lista-brigadistas-plano").innerHTML = brigadistasParaDatalistPlano
      .map((b) => `<option value="${escapeHtmlPlano(b.nome)}"></option>`)
      .join("");
  } catch (err) {
    console.error(err);
  }
}

// ---------------- Cálculo de status ----------------
function calcularStatusAcao(acao) {
  if (acao.data_conclusao) return "Concluída";
  const hoje = new Date().toISOString().slice(0, 10);
  return acao.prazo < hoje ? "Atrasada" : "Em andamento";
}

// ---------------- Carregar ações ----------------
async function carregarAcoes() {
  if (!CONFIGURADO) {
    renderIndicadores([]);
    renderTabelaAcoes();
    return;
  }
  try {
    const { data, error } = await supabaseClient.from("acoes").select("*");
    if (error) throw error;
    // Pautas encaminhadas pelos líderes não são ações do plano
    acoesCache = (data || []).filter((a) => a.encaminhamento !== "Pauta Geral");

    // Confronta o prazo com a data atual e mantém o status sempre correto
    const atualizacoes = [];
    acoesCache.forEach((a) => {
      const statusCorreto = calcularStatusAcao(a);
      if (a.status !== statusCorreto) {
        a.status = statusCorreto;
        atualizacoes.push({ id: a.id, status: statusCorreto });
      }
    });
    for (const upd of atualizacoes) {
      await supabaseClient.from("acoes").update({ status: upd.status }).eq("id", upd.id);
    }

    renderIndicadores(acoesCache);
    renderTabelaAcoes();
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar ações: " + err.message, "error");
  }
}

// ---------------- Indicadores ----------------
function renderIndicadores(lista) {
  document.getElementById("ind-total").textContent = lista.length;
  document.getElementById("ind-andamento").textContent = lista.filter((a) => a.status === "Em andamento").length;
  document.getElementById("ind-atrasada").textContent = lista.filter((a) => a.status === "Atrasada").length;
  document.getElementById("ind-concluida").textContent = lista.filter((a) => a.status === "Concluída").length;
  renderPainel(lista);
}

// ---------------- Dashboard do Plano ----------------
const CORES_STATUS = { "Em andamento": "#f59e0b", Atrasada: "#dc2626", "Concluída": "#16a34a" };

function filtrarPor(status, busca = "", origem = "todas") {
  document.getElementById("filtro-status").value = status;
  document.getElementById("busca-acao").value = busca;
  document.getElementById("filtro-origem").value = origem;
  renderTabelaAcoes();
  document.querySelectorAll(".kpi").forEach((k) => k.classList.toggle("aberto", k.dataset.status === status && !busca && origem === "todas"));
  document.getElementById("painel-tabela").scrollIntoView({ behavior: "smooth", block: "start" });
}

function donutSVG(partes, total) {
  const r = 52, c = 2 * Math.PI * r;
  let off = 0;
  const arcos = partes
    .filter((p) => p.v > 0)
    .map((p) => {
      const len = (p.v / total) * c;
      const el = `<circle r="${r}" cx="70" cy="70" fill="none" stroke="${p.cor}" stroke-width="20" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)" data-status="${p.k}" class="arco"><title>${p.k}: ${p.v}</title></circle>`;
      off += len;
      return el;
    })
    .join("");
  const pct = total ? Math.round(((partes.find((p) => p.k === "Concluída") || { v: 0 }).v / total) * 100) : 0;
  return `<svg viewBox="0 0 140 140" class="donut"><circle r="${r}" cx="70" cy="70" fill="none" stroke="#eceef1" stroke-width="20"/>${arcos}
    <text x="70" y="68" text-anchor="middle" class="donut-pct">${pct}%</text><text x="70" y="86" text-anchor="middle" class="donut-lbl">concluído</text></svg>`;
}

function barrasEmpilhadas(grupos, onClickAttr) {
  const max = Math.max(1, ...grupos.map((g) => g.total));
  return grupos
    .map(
      (g) => `<div class="barra-linha" ${onClickAttr(g)} title="Clique para ver as ações">
        <span class="barra-rotulo">${escapeHtmlPlano(g.nome)}</span>
        <span class="barra-trilho">${["Atrasada", "Em andamento", "Concluída"]
          .map((st) => (g[st] ? `<i style="width:${(g[st] / max) * 100}%;background:${CORES_STATUS[st]}" title="${st}: ${g[st]}"></i>` : ""))
          .join("")}</span>
        <span class="barra-valor">${g.total}</span>
      </div>`
    )
    .join("");
}

function agrupar(lista, chave) {
  const m = {};
  lista.forEach((a) => {
    const k = chave(a) || "Sem responsável";
    m[k] = m[k] || { nome: k, total: 0 };
    m[k].total++;
    m[k][a.status] = (m[k][a.status] || 0) + 1;
  });
  return Object.values(m).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

function nomeCurto(n) {
  const p = String(n || "").trim().split(/\s+/);
  return p.length > 2 ? p[0] + " " + p[p.length - 1] : n;
}

function renderPainel(lista) {
  const total = lista.length;
  const partes = ["Em andamento", "Atrasada", "Concluída"].map((k) => ({ k, v: lista.filter((a) => a.status === k).length, cor: CORES_STATUS[k] }));
  document.getElementById("donut-status").innerHTML = total ? donutSVG(partes, total) : '<div class="empty-state small">Sem ações.</div>';
  document.getElementById("legenda-status").innerHTML = partes
    .map((p) => `<div class="leg-item" data-status="${p.k}"><span class="leg-cor" style="background:${p.cor}"></span>${p.k}<b>${p.v}</b></div>`)
    .join("");
  document.querySelectorAll("#legenda-status .leg-item, #donut-status .arco").forEach((el) => el.addEventListener("click", () => filtrarPor(el.dataset.status)));

  // Próximos prazos (não concluídas)
  const abertas = lista.filter((a) => a.status !== "Concluída" && a.prazo).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = (d) => Math.round((new Date(d + "T00:00:00") - hoje) / 86400000);
  const em7 = abertas.filter((a) => dias(a.prazo) >= 0 && dias(a.prazo) <= 7).length;
  document.getElementById("proximos-prazos").innerHTML = abertas.length
    ? `<div class="prazo-resumo"><span><b>${abertas.filter((a) => dias(a.prazo) < 0).length}</b> vencidas</span><span><b>${em7}</b> vencem em 7 dias</span><span><b>${abertas.length}</b> em aberto</span></div>` +
      abertas
        .slice(0, 6)
        .map((a) => {
          const d = dias(a.prazo);
          const badge = d < 0 ? `<span class="badge badge-danger">${Math.abs(d)}d atrasada</span>` : d <= 7 ? `<span class="badge badge-warn">${d === 0 ? "hoje" : d + "d"}</span>` : `<span class="badge badge-muted">${d}d</span>`;
          return `<div class="prazo-item" data-busca="${escapeAttr(a.descricao)}"><div><div class="prazo-desc">${escapeHtmlPlano(a.descricao)}</div><div class="small text-muted">${escapeHtmlPlano(nomeCurto(a.responsavel))} · ${formatarDataPlano(a.prazo)}</div></div>${badge}</div>`;
        })
        .join("")
    : '<div class="empty-state small">Nenhuma ação em aberto. 🎉</div>';
  document.querySelectorAll(".prazo-item").forEach((el) => el.addEventListener("click", () => filtrarPor("todas", el.dataset.busca)));

  // Por responsável e por origem
  const porResp = agrupar(lista, (a) => a.responsavel);
  document.getElementById("por-responsavel").innerHTML = porResp.length
    ? barrasEmpilhadas(porResp.map((g) => ({ ...g, nome: nomeCurto(g.nome), completo: g.nome })), (g) => `data-busca="${escapeAttr(g.completo)}"`)
    : '<div class="empty-state small">Sem ações.</div>';
  document.querySelectorAll("#por-responsavel .barra-linha").forEach((el) => el.addEventListener("click", () => filtrarPor("todas", el.dataset.busca)));

  const porOrigem = agrupar(lista, (a) => a.origem);
  document.getElementById("por-origem").innerHTML = porOrigem.length ? barrasEmpilhadas(porOrigem, (g) => `data-origem="${escapeAttr(g.nome)}"`) : "";
  document.querySelectorAll("#por-origem .barra-linha").forEach((el) => el.addEventListener("click", () => filtrarPor("todas", "", el.dataset.origem)));
  const aguard = lista.filter((a) => a.origem === "Reunião de Líderes" && a.encaminhamento === "Ação Geral" && !a.ata_geral_id).length;
  document.getElementById("aguardando-geral").innerHTML = aguard
    ? `⏳ <b>${aguard}</b> ação(ões) dos líderes aguardando a <a href="reuniao-geral.html" style="color:var(--brand-red);font-weight:700;">Reunião Geral</a>`
    : "";
}


// ---------------- Filtro + ordenação ----------------
function obterListaFiltradaOrdenada() {
  const filtroStatus = document.getElementById("filtro-status").value;
  const ordenarPor = document.getElementById("ordenar-por").value;
  const busca = document.getElementById("busca-acao").value.trim().toLowerCase();
  const filtroOrigem = document.getElementById("filtro-origem").value;

  let lista = [...acoesCache];

  if (filtroOrigem !== "todas") {
    lista = lista.filter((a) => a.origem === filtroOrigem);
  }

  if (filtroStatus !== "todas") {
    lista = lista.filter((a) => a.status === filtroStatus);
  }
  if (busca) {
    lista = lista.filter(
      (a) =>
        (a.descricao || "").toLowerCase().includes(busca) ||
        (a.responsavel || "").toLowerCase().includes(busca)
    );
  }

  lista.sort((a, b) => {
    if (ordenarPor === "prazo") return (a.prazo || "").localeCompare(b.prazo || "");
    if (ordenarPor === "status") return (a.status || "").localeCompare(b.status || "");
    if (ordenarPor === "responsavel") return (a.responsavel || "").localeCompare(b.responsavel || "");
    return 0;
  });

  return lista;
}

// ---------------- Tabela ----------------
function renderTabelaAcoes() {
  const lista = obterListaFiltradaOrdenada();
  const tbody = document.getElementById("tabela-acoes-body");
  const empty = document.getElementById("acoes-plano-empty");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  lista.forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="campo-inline" data-id="${a.id}" data-campo="descricao" value="${escapeAttr(a.descricao)}" style="border:none;background:transparent;width:100%;min-width:160px;" /></td>
      <td><input type="text" class="campo-inline" data-id="${a.id}" data-campo="responsavel" value="${escapeAttr(a.responsavel)}" list="lista-brigadistas-plano" style="border:none;background:transparent;width:100%;min-width:120px;" /></td>
      <td><input type="date" class="campo-inline" data-id="${a.id}" data-campo="prazo" value="${a.prazo || ""}" style="border:none;background:transparent;" /></td>
      <td><input type="date" class="campo-inline" data-id="${a.id}" data-campo="data_conclusao" value="${a.data_conclusao || ""}" style="border:none;background:transparent;" /></td>
      <td>${badgeStatus(a.status)}</td>
      <td>${badgeOrigem(a)}</td>
      <td><button class="btn btn-secondary btn-excluir-acao" data-id="${a.id}">🗑️</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".campo-inline").forEach((input) => {
    input.addEventListener("change", (e) =>
      atualizarCampoAcao(e.target.dataset.id, e.target.dataset.campo, e.target.value)
    );
  });
  tbody.querySelectorAll(".btn-excluir-acao").forEach((btn) => {
    btn.addEventListener("click", () => excluirAcao(btn.dataset.id));
  });
}

function badgeOrigem(a) {
  let html = `<span class="badge badge-muted">${escapeAttr(a.origem)}</span>`;
  if (a.origem === "Reunião de Líderes" && a.encaminhamento === "Ação Geral") {
    html += a.ata_geral_id
      ? '<div class="small text-muted" style="margin-top:3px;">→ levada à Reunião Geral</div>'
      : '<div class="small" style="margin-top:3px;color:#92400e;">→ aguardando Reunião Geral</div>';
  }
  return html;
}

function textoOrigem(a) {
  if (a.origem === "Reunião de Líderes" && a.encaminhamento === "Ação Geral") return a.origem + (a.ata_geral_id ? " → Geral" : " (p/ Geral)");
  return a.origem;
}

function badgeStatus(status) {
  if (status === "Concluída") return '<span class="badge badge-ok">Concluída</span>';
  if (status === "Atrasada") return '<span class="badge badge-danger">Atrasada</span>';
  return '<span class="badge badge-warn">Em andamento</span>';
}

// ---------------- Edição inline ----------------
async function atualizarCampoAcao(id, campo, valor) {
  try {
    const payload = { [campo]: valor || null };
    const acao = acoesCache.find((a) => a.id === id);
    if (acao) {
      acao[campo] = valor || null;
      const novoStatus = calcularStatusAcao(acao);
      if (novoStatus !== acao.status) {
        acao.status = novoStatus;
        payload.status = novoStatus;
      }
    }
    const { error } = await supabaseClient.from("acoes").update(payload).eq("id", id);
    if (error) throw error;
    renderIndicadores(acoesCache);
    renderTabelaAcoes();
  } catch (err) {
    showToast("Erro ao atualizar: " + err.message, "error");
  }
}

// ---------------- Adicionar manualmente ----------------
async function adicionarAcaoManual() {
  if (!CONFIGURADO) {
    showToast("Configure o Supabase antes de salvar.", "error");
    return;
  }
  const descricao = document.getElementById("nova-descricao").value.trim();
  const responsavel = document.getElementById("nova-responsavel").value.trim();
  const prazo = document.getElementById("nova-prazo").value;

  if (!descricao || !responsavel || !prazo) {
    showToast("Preencha descrição, responsável e prazo.", "error");
    return;
  }

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const payload = {
      descricao,
      responsavel,
      prazo,
      status: prazo < hoje ? "Atrasada" : "Em andamento",
      origem: "Manual",
    };
    const { error } = await supabaseClient.from("acoes").insert(payload);
    if (error) throw error;
    showToast("Ação adicionada!", "success");
    document.getElementById("nova-descricao").value = "";
    document.getElementById("nova-responsavel").value = "";
    document.getElementById("nova-prazo").value = "";
    carregarAcoes();
  } catch (err) {
    showToast("Erro ao adicionar ação: " + err.message, "error");
  }
}

async function excluirAcao(id) {
  if (!confirm("Excluir esta ação?")) return;
  try {
    const { error } = await supabaseClient.from("acoes").delete().eq("id", id);
    if (error) throw error;
    showToast("Ação excluída.", "success");
    carregarAcoes();
  } catch (err) {
    showToast("Erro ao excluir: " + err.message, "error");
  }
}

// ---------------- Exportar PDF ----------------
async function exportarPlanoPDF() {
  const lista = obterListaFiltradaOrdenada();
  if (lista.length === 0) {
    showToast("Não há ações para exportar.", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const y = await cabecalhoPdf(doc, "Plano de Ação da Brigada", [`${lista.length} ação(ões)`]);

  doc.autoTable({
    startY: y,
    head: [["Descrição", "Responsável", "Prazo", "Conclusão", "Status", "Origem"]],
    body: lista.map((a) => [
      a.descricao,
      a.responsavel,
      formatarDataPlano(a.prazo),
      formatarDataPlano(a.data_conclusao),
      a.status,
      textoOrigem(a),
    ]),
    styles: { fontSize: 8 },
    headStyles: CORES_TABELA_PDF,
    margin: { left: 14, right: 14, bottom: 16 },
  });
  rodapePdf(doc);

  doc.save("brigada-boxer-plano-de-acao.pdf");
}

function formatarDataPlano(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function escapeAttr(str) {
  if (str == null) return "";
  return String(str).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function escapeHtmlPlano(str) {
  if (str == null) return "";
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
