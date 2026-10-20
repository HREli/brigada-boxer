// =========================================================================
// BRIGADA BOXER - Hidrantes (Cadastro + Inspeção Mensal)
// =========================================================================

let hidrantesCache = [];
let brigadistasCacheHid = [];
let fotoHidranteSelecionada = null;

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  setupTabsHid();
  setupFormHidrante();

  document.getElementById("insp-btn-salvar").addEventListener("click", salvarInspecaoHidrante);

  carregarBrigadistasHid().then(() => {
    carregarHidrantes();
  });
});

// ---------------- Tabs ----------------
function setupTabsHid() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((sec) => (sec.style.display = "none"));
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
      if (btn.dataset.tab === "inspecao") carregarHistoricoInspecoesHid();
    });
  });
}

// ---------------- Brigadistas ----------------
async function carregarBrigadistasHid() {
  if (!CONFIGURADO) return;
  try {
    // Todos para mostrar nomes no histórico; só brigadistas ativos nas listas de seleção
    const { data, error } = await supabaseClient.from("brigadistas").select("id,nome,ativo,e_brigadista").order("nome");
    if (error) throw error;
    brigadistasCacheHid = data || [];
    const opts = brigadistasCacheHid.filter((b) => b.ativo && b.e_brigadista).map((b) => `<option value="${b.id}">${escapeHtmlHid(b.nome)}</option>`).join("");
    document.getElementById("insp-brigadista1").innerHTML = '<option value="">Selecione...</option>' + opts;
    document.getElementById("insp-brigadista2").innerHTML = '<option value="">Selecione...</option>' + opts;
  } catch (err) {
    console.error(err);
  }
}

function nomeBrigadistaHid(id) {
  const b = brigadistasCacheHid.find((x) => x.id === id);
  return b ? b.nome : "-";
}

// ---------------- Formulário de cadastro ----------------
function setupFormHidrante() {
  document.getElementById("hid-foto-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fotoHidranteSelecionada = file;
    document.getElementById("hid-foto-preview").src = URL.createObjectURL(file);
  });

  document.getElementById("form-hidrante").addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvarHidrante();
  });

  document.getElementById("hid-btn-cancelar").addEventListener("click", resetarFormHidrante);
}

function resetarFormHidrante() {
  document.getElementById("form-hidrante").reset();
  document.getElementById("hid-id").value = "";
  document.getElementById("hid-foto-preview").src = "https://placehold.co/96x96?text=Foto";
  document.getElementById("hid-form-title").textContent = "Novo Hidrante";
  document.getElementById("hid-btn-cancelar").style.display = "none";
  fotoHidranteSelecionada = null;
}

async function salvarHidrante() {
  if (!CONFIGURADO) {
    showToast("Configure o Supabase antes de salvar.", "error");
    return;
  }
  const id = document.getElementById("hid-id").value;
  const localizacao = document.getElementById("hid-localizacao").value.trim();
  const data_ultimo_teste = document.getElementById("hid-data-teste").value;
  const possui_mangueira = document.getElementById("hid-mangueira").checked;
  const possui_esguicho = document.getElementById("hid-esguicho").checked;
  const possui_chave_unha = document.getElementById("hid-chave-unha").checked;

  if (!localizacao || !data_ultimo_teste) {
    showToast("Preencha a localização e a data do último teste.", "error");
    return;
  }

  const btn = document.querySelector("#form-hidrante button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    let foto_url;
    if (fotoHidranteSelecionada) {
      foto_url = await uploadArquivo(BUCKET_FOTOS, fotoHidranteSelecionada, "hidrantes/");
    }
    const payload = { localizacao, data_ultimo_teste, possui_mangueira, possui_esguicho, possui_chave_unha };
    if (foto_url) payload.foto_url = foto_url;

    if (id) {
      const { error } = await supabaseClient.from("hidrantes").update(payload).eq("id", id);
      if (error) throw error;
      showToast("Hidrante atualizado!", "success");
    } else {
      const { error } = await supabaseClient.from("hidrantes").insert(payload);
      if (error) throw error;
      showToast("Hidrante cadastrado!", "success");
    }

    resetarFormHidrante();
    carregarHidrantes();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Salvar Hidrante";
  }
}

function editarHidrante(id) {
  const h = hidrantesCache.find((x) => x.id === id);
  if (!h) return;
  document.getElementById("hid-id").value = h.id;
  document.getElementById("hid-localizacao").value = h.localizacao;
  document.getElementById("hid-data-teste").value = h.data_ultimo_teste;
  document.getElementById("hid-mangueira").checked = h.possui_mangueira;
  document.getElementById("hid-esguicho").checked = h.possui_esguicho;
  document.getElementById("hid-chave-unha").checked = h.possui_chave_unha;
  document.getElementById("hid-foto-preview").src = h.foto_url || "https://placehold.co/96x96?text=Foto";
  document.getElementById("hid-form-title").textContent = "Editar Hidrante";
  document.getElementById("hid-btn-cancelar").style.display = "inline-flex";
  fotoHidranteSelecionada = null;
  document.querySelector('.tab-btn[data-tab="cadastro"]').click();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function excluirHidrante(id) {
  if (!confirm("Excluir este hidrante? As inspeções relacionadas também serão removidas.")) return;
  try {
    const { error } = await supabaseClient.from("hidrantes").delete().eq("id", id);
    if (error) throw error;
    showToast("Hidrante excluído.", "success");
    carregarHidrantes();
  } catch (err) {
    showToast("Erro ao excluir: " + err.message, "error");
  }
}

// ---------------- Carregar / renderizar hidrantes ----------------
async function carregarHidrantes() {
  if (!CONFIGURADO) {
    renderTabelaHidrantes([]);
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from("hidrantes")
      .select("*")
      .eq("ativo", true)
      .order("localizacao");
    if (error) throw error;
    hidrantesCache = data || [];
    await carregarUltimasInspecoesHid();
    renderTabelaHidrantes(hidrantesCache);

    const select = document.getElementById("insp-hidrante");
    select.innerHTML =
      '<option value="">Selecione...</option>' +
      hidrantesCache.map((h) => `<option value="${h.id}">${escapeHtmlHid(h.localizacao)}</option>`).join("");
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar hidrantes: " + err.message, "error");
  }
  carregarHistoricoInspecoesHid();
}

function diasEntreHid(dataFutura) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataFutura + "T00:00:00");
  return Math.round((alvo - hoje) / 86400000);
}

function situacaoVencimentoHid(dataVencimento) {
  const dias = diasEntreHid(dataVencimento);
  if (dias < 0) return { texto: `Vencido há ${Math.abs(dias)} dia(s)`, classe: "badge-danger" };
  if (dias <= 30) return { texto: `Vence em ${dias} dia(s)`, classe: "badge-warn" };
  return { texto: "Em dia", classe: "badge-ok" };
}

// ---------------- Alerta de inspeção mensal (30 dias) ----------------
let ultimaInspecaoPorHidrante = {};

async function carregarUltimasInspecoesHid() {
  ultimaInspecaoPorHidrante = {};
  try {
    const { data, error } = await supabaseClient
      .from("inspecoes_hidrante")
      .select("hidrante_id, data_inspecao")
      .order("data_inspecao", { ascending: false });
    if (error) throw error;
    (data || []).forEach((insp) => {
      if (!ultimaInspecaoPorHidrante[insp.hidrante_id]) {
        ultimaInspecaoPorHidrante[insp.hidrante_id] = insp.data_inspecao;
      }
    });
  } catch (err) {
    console.error(err);
  }
}

function diasDesdeHid(dataPassada) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataPassada + "T00:00:00");
  return Math.round((hoje - alvo) / 86400000);
}

function situacaoInspecaoMensalHid(dataUltimaInspecao) {
  if (!dataUltimaInspecao) {
    return { texto: "Aguardando 1ª inspeção", classe: "badge-warn" };
  }
  const dias = diasDesdeHid(dataUltimaInspecao);
  if (dias >= 30) {
    return { texto: `Inspeção necessária (${dias} dias sem inspeção)`, classe: "badge-danger" };
  }
  return { texto: `Em dia (há ${dias} dia(s))`, classe: "badge-ok" };
}

function simNao(valor) {
  return valor ? '<span class="badge badge-ok">Sim</span>' : '<span class="badge badge-muted">Não</span>';
}

function renderTabelaHidrantes(lista) {
  const tbody = document.getElementById("hid-tabela-body");
  const empty = document.getElementById("hid-lista-empty");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  lista.forEach((h) => {
    const situacao = situacaoVencimentoHid(h.data_vencimento);
    const ultimaInspecao = ultimaInspecaoPorHidrante[h.id];
    const situacaoInsp = situacaoInspecaoMensalHid(ultimaInspecao);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img class="avatar" src="${h.foto_url || "https://placehold.co/40x40?text=?"}" /></td>
      <td>${escapeHtmlHid(h.localizacao)}</td>
      <td>${simNao(h.possui_mangueira)}</td>
      <td>${simNao(h.possui_esguicho)}</td>
      <td>${simNao(h.possui_chave_unha)}</td>
      <td>${formatarDataHid(h.data_ultimo_teste)}</td>
      <td>${formatarDataHid(h.data_vencimento)}</td>
      <td><span class="badge ${situacao.classe}">${situacao.texto}</span></td>
      <td>${formatarDataHid(ultimaInspecao)}</td>
      <td><span class="badge ${situacaoInsp.classe}">${situacaoInsp.texto}</span></td>
      <td class="row">
        <button class="btn btn-secondary" onclick="editarHidrante('${h.id}')">✏️</button>
        <button class="btn btn-secondary" onclick="excluirHidrante('${h.id}')">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------- Inspeção Mensal ----------------
async function salvarInspecaoHidrante() {
  if (!CONFIGURADO) {
    showToast("Configure o Supabase antes de salvar.", "error");
    return;
  }
  const hidrante_id = document.getElementById("insp-hidrante").value;
  const data_inspecao = document.getElementById("insp-data").value;
  const brigadista1_id = document.getElementById("insp-brigadista1").value;
  const brigadista2_id = document.getElementById("insp-brigadista2").value;

  if (!hidrante_id || !data_inspecao || !brigadista1_id || !brigadista2_id) {
    showToast("Selecione o hidrante, a data e os 2 brigadistas responsáveis.", "error");
    return;
  }
  if (brigadista1_id === brigadista2_id) {
    showToast("Selecione dois brigadistas diferentes.", "error");
    return;
  }

  const payload = {
    hidrante_id,
    data_inspecao,
    mangueira_ok: document.getElementById("insp-mangueira").checked,
    esguicho_ok: document.getElementById("insp-esguicho").checked,
    chave_unha_ok: document.getElementById("insp-chave-unha").checked,
    integridade_ok: document.getElementById("insp-integridade").checked,
    sinalizacao_ok: document.getElementById("insp-sinalizacao").checked,
    observacoes: document.getElementById("insp-observacoes").value.trim(),
    brigadista1_id,
    brigadista2_id,
  };

  const btn = document.getElementById("insp-btn-salvar");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    const { error } = await supabaseClient.from("inspecoes_hidrante").insert(payload);
    if (error) throw error;
    showToast("Inspeção registrada!", "success");
    document.getElementById("insp-data").value = "";
    document.getElementById("insp-observacoes").value = "";
    ["insp-mangueira", "insp-esguicho", "insp-chave-unha", "insp-integridade", "insp-sinalizacao"].forEach((id) => {
      document.getElementById(id).checked = true;
    });
    await carregarUltimasInspecoesHid();
    renderTabelaHidrantes(hidrantesCache);
    carregarHistoricoInspecoesHid();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar inspeção: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Salvar Inspeção";
  }
}

async function carregarHistoricoInspecoesHid() {
  const container = document.getElementById("insp-historico-lista");
  const empty = document.getElementById("insp-historico-empty");
  if (!CONFIGURADO) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  try {
    const { data: inspecoes, error } = await supabaseClient
      .from("inspecoes_hidrante")
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
      const h = hidrantesCache.find((x) => x.id === insp.hidrante_id);
      const conforme = insp.mangueira_ok && insp.esguicho_ok && insp.chave_unha_ok && insp.integridade_ok && insp.sinalizacao_ok;
      const card = document.createElement("div");
      card.className = "panel";
      card.style.marginBottom = "14px";
      card.innerHTML = `
        <div class="row justify-between">
          <div>
            <h3 style="margin:0 0 4px;">${h ? escapeHtmlHid(h.localizacao) : "Hidrante removido"} · ${formatarDataHid(insp.data_inspecao)}</h3>
            <p class="text-muted small" style="margin:0;">
              ${conforme ? '<span class="badge badge-ok">Conforme</span>' : '<span class="badge badge-danger">Pendência encontrada</span>'} ·
              Responsáveis: ${escapeHtmlHid(nomeBrigadistaHid(insp.brigadista1_id))} e ${escapeHtmlHid(nomeBrigadistaHid(insp.brigadista2_id))} ·
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
      btn.addEventListener("click", () => gerarPdfInspecaoHid(btn.dataset.id, inspecoes));
    });
    container.querySelectorAll(".input-upload-insp").forEach((input) => {
      input.addEventListener("change", (e) => anexarInspecaoAssinadaHid(e, input.dataset.id));
    });
    container.querySelectorAll(".btn-excluir-insp").forEach((btn) => {
      btn.addEventListener("click", () => excluirInspecaoHid(btn.dataset.id));
    });
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar histórico: " + err.message, "error");
  }
}

async function anexarInspecaoAssinadaHid(e, inspecaoId) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    showToast("Enviando arquivo...");
    const url = await uploadArquivo(BUCKET_DOCUMENTOS, file, "inspecoes-hidrante/");
    const { error } = await supabaseClient.from("inspecoes_hidrante").update({ arquivo_assinado_url: url }).eq("id", inspecaoId);
    if (error) throw error;
    showToast("Anexo salvo com sucesso!", "success");
    carregarHistoricoInspecoesHid();
  } catch (err) {
    showToast("Erro ao anexar: " + err.message, "error");
  }
}

async function excluirInspecaoHid(id) {
  if (!confirm("Excluir esta inspeção?")) return;
  try {
    const { error } = await supabaseClient.from("inspecoes_hidrante").delete().eq("id", id);
    if (error) throw error;
    showToast("Inspeção excluída.", "success");
    await carregarUltimasInspecoesHid();
    renderTabelaHidrantes(hidrantesCache);
    carregarHistoricoInspecoesHid();
  } catch (err) {
    showToast("Erro ao excluir: " + err.message, "error");
  }
}

async function gerarPdfInspecaoHid(inspecaoId, inspecoes) {
  const insp = inspecoes.find((i) => i.id === inspecaoId);
  if (!insp) return;
  const h = hidrantesCache.find((x) => x.id === insp.hidrante_id);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const corTabela = COR_ESCURA;
  let y = await cabecalhoPdf(doc, "Inspeção Mensal de Hidrante");
  y -= 4;

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Hidrante: ${h ? h.localizacao : "-"}`, pageWidth / 2, y, { align: "center" });
  y += 6;
  doc.text(`Data da inspeção: ${formatarDataHid(insp.data_inspecao)}`, pageWidth / 2, y, { align: "center" });
  y += 10;

  doc.autoTable({
    startY: y,
    head: [["Item verificado", "Resultado"]],
    body: [
      ["Mangueira", insp.mangueira_ok ? "OK" : "PENDÊNCIA"],
      ["Esguicho", insp.esguicho_ok ? "OK" : "PENDÊNCIA"],
      ["Chave-Unha", insp.chave_unha_ok ? "OK" : "PENDÊNCIA"],
      ["Integridade do abrigo/registro", insp.integridade_ok ? "OK" : "PENDÊNCIA"],
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
      [nomeBrigadistaHid(insp.brigadista1_id), ""],
      [nomeBrigadistaHid(insp.brigadista2_id), ""],
    ],
    styles: { fontSize: 10, minCellHeight: 14 },
    headStyles: { fillColor: corTabela },
    margin: { left: marginX, right: marginX },
  });

  rodapePdf(doc);
  doc.save(`inspecao-hidrante-${insp.data_inspecao}.pdf`);
}

// ---------------- Utils ----------------
function formatarDataHid(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtmlHid(str) {
  if (str == null) return "";
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
