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
