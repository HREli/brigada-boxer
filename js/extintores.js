// =========================================================================
// BRIGADA BOXER - Extintores (Cadastro + Inspeção Mensal)
// =========================================================================

let extintoresCache = [];
let brigadistasCacheExt = [];
let fotoExtintorSelecionada = null;

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  setupTabsExt();
  setupFormExtintor();

  document.getElementById("insp-btn-salvar").addEventListener("click", salvarInspecaoExtintor);

  carregarBrigadistasExt().then(() => {
    carregarExtintores();
  });
});

// ---------------- Tabs ----------------
function setupTabsExt() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((sec) => (sec.style.display = "none"));
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
      if (btn.dataset.tab === "inspecao") carregarHistoricoInspecoesExt();
    });
  });
}

// ---------------- Brigadistas ----------------
async function carregarBrigadistasExt() {
  if (!CONFIGURADO) return;
  try {
    // Todos para mostrar nomes no histórico; só brigadistas ativos nas listas de seleção
    const { data, error } = await supabaseClient.from("brigadistas").select("id,nome,ativo,e_brigadista").order("nome");
    if (error) throw error;
    brigadistasCacheExt = data || [];
    const opts = brigadistasCacheExt.filter((b) => b.ativo && b.e_brigadista).map((b) => `<option value="${b.id}">${escapeHtmlExt(b.nome)}</option>`).join("");
    document.getElementById("insp-brigadista1").innerHTML = '<option value="">Selecione...</option>' + opts;
    document.getElementById("insp-brigadista2").innerHTML = '<option value="">Selecione...</option>' + opts;
  } catch (err) {
    console.error(err);
  }
}

function nomeBrigadistaExt(id) {
  const b = brigadistasCacheExt.find((x) => x.id === id);
  return b ? b.nome : "-";
}

// ---------------- Formulário de cadastro ----------------
function setupFormExtintor() {
  document.getElementById("ext-foto-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fotoExtintorSelecionada = file;
    document.getElementById("ext-foto-preview").src = URL.createObjectURL(file);
  });

  document.getElementById("form-extintor").addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvarExtintor();
  });

  document.getElementById("ext-btn-cancelar").addEventListener("click", resetarFormExtintor);
}

function resetarFormExtintor() {
  document.getElementById("form-extintor").reset();
  document.getElementById("ext-id").value = "";
  document.getElementById("ext-foto-preview").src = "https://placehold.co/96x96?text=Foto";
  document.getElementById("ext-form-title").textContent = "Novo Extintor";
  document.getElementById("ext-btn-cancelar").style.display = "none";
  fotoExtintorSelecionada = null;
}

async function salvarExtintor() {
  if (!CONFIGURADO) {
    showToast("Configure o Supabase antes de salvar.", "error");
    return;
  }
  const id = document.getElementById("ext-id").value;
  const identificador = document.getElementById("ext-identificador").value.trim();
  const tipo = document.getElementById("ext-tipo").value;
  const tamanho = document.getElementById("ext-tamanho").value;
  const localizacao = document.getElementById("ext-localizacao").value.trim();
  const data_ultima_recarga = document.getElementById("ext-data-recarga").value;

  if (!identificador || !tipo || !tamanho || !localizacao || !data_ultima_recarga) {
    showToast("Preencha todos os campos obrigatórios.", "error");
    return;
  }

  const btn = document.querySelector("#form-extintor button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    let foto_url;
    if (fotoExtintorSelecionada) {
      foto_url = await uploadArquivo(BUCKET_FOTOS, fotoExtintorSelecionada, "extintores/");
    }
    const payload = { identificador, tipo, tamanho, localizacao, data_ultima_recarga };
    if (foto_url) payload.foto_url = foto_url;

    if (id) {
      const { error } = await supabaseClient.from("extintores").update(payload).eq("id", id);
      if (error) throw error;
      showToast("Extintor atualizado!", "success");
    } else {
      const { error } = await supabaseClient.from("extintores").insert(payload);
      if (error) throw error;
      showToast("Extintor cadastrado!", "success");
    }

    resetarFormExtintor();
    carregarExtintores();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Salvar Extintor";
  }
}

function editarExtintor(id) {
  const ex = extintoresCache.find((x) => x.id === id);
  if (!ex) return;
  document.getElementById("ext-id").value = ex.id;
  document.getElementById("ext-identificador").value = ex.identificador;
  document.getElementById("ext-tipo").value = ex.tipo;
  document.getElementById("ext-tamanho").value = ex.tamanho;
  document.getElementById("ext-localizacao").value = ex.localizacao;
  document.getElementById("ext-data-recarga").value = ex.data_ultima_recarga;
  document.getElementById("ext-foto-preview").src = ex.foto_url || "https://placehold.co/96x96?text=Foto";
  document.getElementById("ext-form-title").textContent = "Editar Extintor";
  document.getElementById("ext-btn-cancelar").style.display = "inline-flex";
  fotoExtintorSelecionada = null;
  document.querySelector('.tab-btn[data-tab="cadastro"]').click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function excluirExtintor(id) {
  if (!confirm("Excluir este extintor? As inspeções relacionadas também serão removidas.")) return;
  try {
    const { error } = await supabaseClient.from("extintores").delete().eq("id", id);
    if (error) throw error;
    showToast("Extintor excluído.", "success");
    carregarExtintores();
  } catch (err) {
    showToast("Erro ao excluir: " + err.message, "error");
  }
}

// ---------------- Carregar / renderizar extintores ----------------
async function carregarExtintores() {
  if (!CONFIGURADO) {
    renderTabelaExtintores([]);
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from("extintores")
      .select("*")
      .eq("ativo", true)
      .order("identificador");
    if (error) throw error;
    extintoresCache = data || [];
    await carregarUltimasInspecoesExt();
    renderTabelaExtintores(extintoresCache);

    const select = document.getElementById("insp-extintor");
    select.innerHTML =
      '<option value="">Selecione...</option>' +
      extintoresCache.map((ex) => `<option value="${ex.id}">${escapeHtmlExt(ex.identificador)} - ${escapeHtmlExt(ex.localizacao)}</option>`).join("");
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar extintores: " + err.message, "error");
  }
  carregarHistoricoInspecoesExt();
}

function diasEntre(dataFutura) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataFutura + "T00:00:00");
  return Math.round((alvo - hoje) / 86400000);
}

// ---------------- Alerta de inspeção mensal (30 dias) ----------------
let ultimaInspecaoPorExtintor = {};

async function carregarUltimasInspecoesExt() {
  ultimaInspecaoPorExtintor = {};
  try {
    const { data, error } = await supabaseClient
      .from("inspecoes_extintor")
      .select("extintor_id, data_inspecao")
      .order("data_inspecao", { ascending: false });
    if (error) throw error;
    (data || []).forEach((insp) => {
      if (!ultimaInspecaoPorExtintor[insp.extintor_id]) {
        ultimaInspecaoPorExtintor[insp.extintor_id] = insp.data_inspecao;
      }
    });
  } catch (err) {
    console.error(err);
  }
}

function diasDesde(dataPassada) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataPassada + "T00:00:00");
  return Math.round((hoje - alvo) / 86400000);
}

function situacaoInspecaoMensal(dataUltimaInspecao) {
  if (!dataUltimaInspecao) {
    return { texto: "Aguardando 1ª inspeção", classe: "badge-warn" };
  }
  const dias = diasDesde(dataUltimaInspecao);
  if (dias >= 30) {
    return { texto: `Inspeção necessária (${dias} dias sem inspeção)`, classe: "badge-danger" };
  }
  return { texto: `Em dia (há ${dias} dia(s))`, classe: "badge-ok" };
}

function situacaoVencimento(dataVencimento) {
  const dias = diasEntre(dataVencimento);
  if (dias < 0) return { texto: `Vencido há ${Math.abs(dias)} dia(s)`, classe: "badge-danger" };
  if (dias <= 30) return { texto: `Vence em ${dias} dia(s)`, classe: "badge-warn" };
  return { texto: "Em dia", classe: "badge-ok" };
}

function subtrairDias(dataStr, dias) {
  const d = new Date(dataStr + "T00:00:00");
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

function renderTabelaExtintores(lista) {
  const tbody = document.getElementById("ext-tabela-body");
  const empty = document.getElementById("ext-lista-empty");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  lista.forEach((ex) => {
    const vencimento = ex.data_vencimento;
    const recarregarAte = subtrairDias(vencimento, 15);
    const situacao = situacaoVencimento(vencimento);
    const ultimaInspecao = ultimaInspecaoPorExtintor[ex.id];
    const situacaoInsp = situacaoInspecaoMensal(ultimaInspecao);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img class="avatar" src="${ex.foto_url || "https://placehold.co/40x40?text=?"}" /></td>
      <td>${escapeHtmlExt(ex.identificador)}</td>
      <td>${escapeHtmlExt(ex.tipo)}</td>
      <td>${escapeHtmlExt(ex.tamanho)}</td>
      <td>${escapeHtmlExt(ex.localizacao)}</td>
      <td>${formatarDataExt(ex.data_ultima_recarga)}</td>
      <td>${formatarDataExt(vencimento)}</td>
      <td>${formatarDataExt(recarregarAte)}</td>
      <td><span class="badge ${situacao.classe}">${situacao.texto}</span></td>
      <td>${formatarDataExt(ultimaInspecao)}</td>
      <td><span class="badge ${situacaoInsp.classe}">${situacaoInsp.texto}</span></td>
      <td class="row">
        <button class="btn btn-secondary" onclick="editarExtintor('${ex.id}')">✏️</button>
        <button class="btn btn-secondary" onclick="excluirExtintor('${ex.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------- Inspeção Mensal ----------------
async function salvarInspecaoExtintor() {
  if (!CONFIGURADO) {
    showToast("Configure o Supabase antes de salvar.", "error");
    return;
  }
  const extintor_id = document.getElementById("insp-extintor").value;
  const data_inspecao = document.getElementById("insp-data").value;
  const brigadista1_id = document.getElementById("insp-brigadista1").value;
  const brigadista2_id = document.getElementById("insp-brigadista2").value;

  if (!extintor_id || !data_inspecao || !brigadista1_id || !brigadista2_id) {
    showToast("Selecione o extintor, a data e os 2 brigadistas responsáveis.", "error");
    return;
  }
  if (brigadista1_id === brigadista2_id) {
    showToast("Selecione dois brigadistas diferentes.", "error");
    return;
  }

  const payload = {
    extintor_id,
    data_inspecao,
    conteudo_ok: document.getElementById("insp-conteudo").checked,
    lacre_ok: document.getElementById("insp-lacre").checked,
    integridade_ok: document.getElementById("insp-integridade").checked,
    armazenamento_ok: document.getElementById("insp-armazenamento").checked,
    sinalizacao_ok: document.getElementById("insp-sinalizacao").checked,
    observacoes: document.getElementById("insp-observacoes").value.trim(),
    brigadista1_id,
    brigadista2_id,
  };

  const btn = document.getElementById("insp-btn-salvar");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    const { error } = await supabaseClient.from("inspecoes_extintor").insert(payload);
    if (error) throw error;
    showToast("Inspeção registrada!", "success");
    document.getElementById("insp-data").value = "";
    document.getElementById("insp-observacoes").value = "";
    ["insp-conteudo", "insp-lacre", "insp-integridade", "insp-armazenamento", "insp-sinalizacao"].forEach((id) => {
      document.getElementById(id).checked = true;
    });
    await carregarUltimasInspecoesExt();
    renderTabelaExtintores(extintoresCache);
    carregarHistoricoInspecoesExt();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar inspeção: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Salvar Inspeção";
  }
}

async function carregarHistoricoInspecoesExt() {
  const container = document.getElementById("insp-historico-lista");
  const empty = document.getElementById("insp-historico-empty");
  if (!CONFIGURADO) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  try {
    const { data: inspecoes, error } = await supabaseClient
      .from("inspecoes_extintor")
      .select("*")
      .order("data_inspecao", { ascending: false });
    if (error) throw error;

    if (!inspecoes || inspecoes.length === 0) {
      container.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    container.innerHTML = "";
    inspecoes.forEach((insp) => {
      const ex = extintoresCache.find((e) => e.id === insp.extintor_id);
      const conforme = insp.conteudo_ok && insp.lacre_ok && insp.integridade_ok && insp.armazenamento_ok && insp.sinalizacao_ok;
      const card = document.createElement("div");
      card.className = "panel";
      card.style.marginBottom = "14px";
      card.innerHTML = `
        <div class="row justify-between">
          <div>
            <h3 style="margin:0 0 4px;">${ex ? escapeHtmlExt(ex.identificador) + " - " + escapeHtmlExt(ex.localizacao) : "Extintor removido"} · ${formatarDataExt(insp.data_inspecao)}</h3>
            <p class="text-muted small" style="margin:0;">
              ${conforme ? '<span class="badge badge-ok">Conforme</span>' : '<span class="badge badge-danger">Pendência encontrada</span>'} ·
              Responsáveis: ${escapeHtmlExt(nomeBrigadistaExt(insp.brigadista1_id))} e ${escapeHtmlExt(nomeBrigadistaExt(insp.brigadista2_id))} ·
              ${insp.arquivo_assinado_url ? '<span class="badge badge-ok">Anexo assinado</span>' : '<span class="badge badge-warn">Sem anexo assinado</span>'}
            </p>
          </div>
          <div class="row">
            <button class="btn btn-outline btn-gerar-pdf-insp" data-id="${insp.id}">📄 Gerar PDF</button>
            <label class="btn btn-secondary" style="cursor:pointer;">
              📎 Anexar assinada
              <input type="file" accept="application/pdf,image/*" class="input-upload-insp" data-id="${insp.id}" style="display:none;" />
            </label>
            ${insp.arquivo_assinado_url ? `<a href="${insp.arquivo_assinado_url}" target="_blank" class="btn btn-secondary">👁️ Ver</a>` : ""}
            <button class="btn btn-secondary btn-excluir-insp" data-id="${insp.id}">🗑️</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    container.querySelectorAll(".btn-gerar-pdf-insp").forEach((btn) => {
      btn.addEventListener("click", () => gerarPdfInspecaoExt(btn.dataset.id, inspecoes));
    });
    container.querySelectorAll(".input-upload-insp").forEach((input) => {
      input.addEventListener("change", (e) => anexarInspecaoAssinada(e, input.dataset.id));
    });
    container.querySelectorAll(".btn-excluir-insp").forEach((btn) => {
      btn.addEventListener("click", () => excluirInspecaoExt(btn.dataset.id));
    });
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar histórico: " + err.message, "error");
  }
}

async function anexarInspecaoAssinada(e, inspecaoId) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    showToast("Enviando arquivo...");
    const url = await uploadArquivo(BUCKET_DOCUMENTOS, file, "inspecoes-extintor/");
    const { error } = await supabaseClient.from("inspecoes_extintor").update({ arquivo_assinado_url: url }).eq("id", inspecaoId);
    if (error) throw error;
    showToast("Anexo salvo com sucesso!", "success");
    carregarHistoricoInspecoesExt();
  } catch (err) {
    showToast("Erro ao anexar: " + err.message, "error");
  }
}

async function excluirInspecaoExt(id) {
  if (!confirm("Excluir esta inspeção?")) return;
  try {
    const { error } = await supabaseClient.from("inspecoes_extintor").delete().eq("id", id);
    if (error) throw error;
    showToast("Inspeção excluída.", "success");
    await carregarUltimasInspecoesExt();
    renderTabelaExtintores(extintoresCache);
    carregarHistoricoInspecoesExt();
  } catch (err) {
    showToast("Erro ao excluir: " + err.message, "error");
  }
}

async function gerarPdfInspecaoExt(inspecaoId, inspecoes) {
  const insp = inspecoes.find((i) => i.id === inspecaoId);
  if (!insp) return;
  const ex = extintoresCache.find((e) => e.id === insp.extintor_id);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const corTabela = COR_ESCURA;
  let y = await cabecalhoPdf(doc, "Inspeção Mensal de Extintor");
  y -= 4;

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Extintor: ${ex ? ex.identificador : "-"}   Localização: ${ex ? ex.localizacao : "-"}`, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.text(`Data da inspeção: ${formatarDataExt(insp.data_inspecao)}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.autoTable({
    startY: y,
    head: [["Item verificado", "Resultado"]],
    body: [
      ["Conteúdo / Carga", insp.conteudo_ok ? "OK" : "PENDÊNCIA"],
      ["Lacre e pino de segurança", insp.lacre_ok ? "OK" : "PENDÊNCIA"],
      ["Integridade (mangueira, válvula, pintura)", insp.integridade_ok ? "OK" : "PENDÊNCIA"],
      ["Armazenamento / Fixação", insp.armazenamento_ok ? "OK" : "PENDÊNCIA"],
      ["Sinalização e acesso desobstruído", insp.sinalizacao_ok ? "OK" : "PENDÊNCIA"],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: corTabela },
    margin: { left: marginX, right: marginX },
  });
  y = doc.lastAutoTable.finalY + 8;

  doc.setFont("helvetica", "bold");
  doc.text("Observações:", marginX, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  const linhasObs = doc.splitTextToSize(insp.observacoes || "Nenhuma.", 180);
  doc.text(linhasObs, marginX, y);
  y += linhasObs.length * 5 + 10;

  doc.autoTable({
    startY: y,
    head: [["Brigadista responsável", "Assinatura"]],
    body: [
      [nomeBrigadistaExt(insp.brigadista1_id), ""],
      [nomeBrigadistaExt(insp.brigadista2_id), ""],
    ],
    styles: { fontSize: 10, minCellHeight: 14 },
    headStyles: { fillColor: corTabela },
    margin: { left: marginX, right: marginX },
  });

  rodapePdf(doc);
  doc.save(`inspecao-extintor-${ex ? ex.identificador : "item"}-${insp.data_inspecao}.pdf`);
}

// ---------------- Utils ----------------
function formatarDataExt(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtmlExt(str) {
  if (str == null) return "";
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
