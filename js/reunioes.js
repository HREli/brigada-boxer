// =========================================================================
// BRIGADA BOXER - Reunião Geral e Reunião de Líderes
//
// Fluxo: a Reunião de Líderes acontece antes da Geral. Cada item gerado pelos
// líderes tem um encaminhamento:
//   - "Líderes"     → ação que fica no Plano de Ação (origem Reunião de Líderes)
//   - "Pauta Geral" → pauta para a próxima Reunião Geral (não entra no Plano)
//   - "Ação Geral"  → ação apresentada/assumida na próxima Reunião Geral
// Ao registrar a Reunião Geral, os itens pendentes aparecem para vincular
// (campo acoes.ata_geral_id). Só a ATA Geral tem lista de assinaturas.
// =========================================================================

const TIPO = document.body.dataset.tipo === "Lideres" ? "Lideres" : "Geral";
const ORIGEM = TIPO === "Lideres" ? "Reunião de Líderes" : "Reunião Geral";
const ROTULO_ENC = { "Líderes": "Fica com os líderes", "Pauta Geral": "Pauta da Reunião Geral", "Ação Geral": "Ação da Reunião Geral" };

let brigadistasAtivos = [];
let itensLideresPendentes = [];
let presencaNova = {}; // id do brigadista -> { presente, justificativa }

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  setupTabsReuniao();
  carregarBrigadistas();
  atualizarEmptyAcoes();
  document.getElementById("ata-data").value = hojeISOLocal();

  document.getElementById("btn-add-acao").addEventListener("click", () => adicionarLinhaAcao());
  document.getElementById("btn-salvar-ata").addEventListener("click", salvarAta);
  if (TIPO === "Geral") {
    document.getElementById("btn-inserir-pautas").addEventListener("click", inserirPautasNoConteudo);
    carregarItensLideres();
  }
  carregarHistorico();
});

function setupTabsReuniao() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((s) => (s.style.display = "none"));
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
      if (btn.dataset.tab === "historico") carregarHistorico();
    });
  });
}

async function carregarBrigadistas() {
  if (!CONFIGURADO) return;
  const { data, error } = await supabaseClient
    .from("brigadistas")
    .select("*")
    .eq("ativo", true)
    .eq("e_brigadista", true)
    .order("nome");
  if (error) return console.error(error);
  brigadistasAtivos = data || [];
  document.getElementById("lista-brigadistas").innerHTML = brigadistasAtivos.map((b) => `<option value="${escHtml(b.nome)}"></option>`).join("");
  presencaNova = {};
  convidados().forEach((b) => (presencaNova[b.id] = { presente: true, justificativa: "" }));
  renderPresenca(document.getElementById("presenca-lista"), convidados(), presencaNova, document.getElementById("presenca-resumo"));
}

// Quem é convocado: Geral = todos os brigadistas ativos; Líderes = coordenador + líderes
function convidados() {
  return TIPO === "Geral" ? brigadistasAtivos : lideresAtivos();
}

// ---------------- Lista de presença ----------------
function renderPresenca(container, pessoas, estado, resumoEl) {
  if (!pessoas.length) {
    container.innerHTML = '<div class="empty-state small" style="padding:14px;">Nenhum brigadista ativo para convocar.</div>';
    if (resumoEl) resumoEl.textContent = "";
    return;
  }
  container.innerHTML = pessoas
    .map((b) => {
      const e = estado[b.id] || { presente: true, justificativa: "" };
      return `<div class="presenca-item ${e.presente ? "" : "ausente"}" data-id="${b.id}">
        <label class="presenca-check">
          <input type="checkbox" class="chk-presente" ${e.presente ? "checked" : ""} />
          <span><b>${escHtml(b.nome)}</b><span class="small text-muted"> · ${escHtml(b.funcao || b.cargo || "")}</span></span>
        </label>
        <input type="text" class="txt-justificativa" placeholder="Motivo da ausência (opcional)" value="${escHtml(e.justificativa || "")}" style="${e.presente ? "display:none;" : ""}" />
      </div>`;
    })
    .join("");
  const atualizarResumo = () => {
    if (!resumoEl) return;
    const aus = pessoas.filter((b) => estado[b.id] && !estado[b.id].presente).length;
    resumoEl.innerHTML = `<span class="badge badge-ok">${pessoas.length - aus} presentes</span> <span class="badge ${aus ? "badge-danger" : "badge-muted"}">${aus} ausente(s)</span>`;
  };
  container.querySelectorAll(".presenca-item").forEach((div) => {
    const id = div.dataset.id;
    if (!estado[id]) estado[id] = { presente: true, justificativa: "" };
    const chk = div.querySelector(".chk-presente");
    const txt = div.querySelector(".txt-justificativa");
    chk.addEventListener("change", () => {
      estado[id].presente = chk.checked;
      div.classList.toggle("ausente", !chk.checked);
      txt.style.display = chk.checked ? "none" : "block";
      if (!chk.checked) txt.focus();
      atualizarResumo();
    });
    txt.addEventListener("input", () => (estado[id].justificativa = txt.value));
  });
  atualizarResumo();
}

// Reunião de Líderes: participam o coordenador e os líderes de andar
function lideresAtivos() {
  return brigadistasAtivos.filter((b) => b.cargo === "Coordenador" || normalizarNome(b.funcao).includes("LIDER DE ANDAR"));
}

// ---------------- Linhas de ação ----------------
function adicionarLinhaAcao(pre = {}) {
  const tpl = document.getElementById("tpl-acao-row");
  const clone = tpl.content.cloneNode(true);
  const row = clone.querySelector(".acao-row");
  if (TIPO === "Lideres") row.querySelector(".campo-encaminhamento").style.display = "block";
  row.querySelector(".acao-tema").innerHTML = opcoesTema(pre.tema);
  if (pre.descricao) row.querySelector(".acao-descricao").value = pre.descricao;
  if (pre.responsavel) row.querySelector(".acao-responsavel").value = pre.responsavel;
  if (pre.prazo) row.querySelector(".acao-prazo").value = pre.prazo;
  if (pre.pautaId) row.dataset.pautaId = pre.pautaId;
  row.querySelector(".btn-remove-acao").addEventListener("click", () => {
    row.remove();
    atualizarEmptyAcoes();
  });
  document.getElementById("acoes-container").appendChild(clone);
  atualizarEmptyAcoes();
}

function atualizarEmptyAcoes() {
  const c = document.getElementById("acoes-container");
  document.getElementById("acoes-empty").style.display = c.children.length === 0 ? "block" : "none";
}

function coletarAcoes() {
  const itens = [];
  const erros = [];
  document.querySelectorAll("#acoes-container .acao-row").forEach((row, i) => {
    const descricao = row.querySelector(".acao-descricao").value.trim();
    const responsavel = row.querySelector(".acao-responsavel").value.trim();
    const prazo = row.querySelector(".acao-prazo").value;
    const encaminhamento = TIPO === "Lideres" ? row.querySelector(".acao-encaminhamento").value : null;
    const tema = row.querySelector(".acao-tema").value || "Outros";
    if (!descricao && !responsavel && !prazo) return;
    if (!descricao) return erros.push(`Item ${i + 1}: falta a descrição.`);
    if (encaminhamento !== "Pauta Geral" && (!responsavel || !prazo)) return erros.push(`Item ${i + 1}: informe responsável e prazo.`);
    itens.push({ descricao, responsavel: responsavel || null, prazo: prazo || null, encaminhamento, tema, pautaId: row.dataset.pautaId || null });
  });
  return { itens, erros };
}

// ---------------- Itens vindos dos líderes (só na Geral) ----------------
async function carregarItensLideres() {
  if (!CONFIGURADO) return;
  const { data, error } = await supabaseClient
    .from("acoes")
    .select("*, ata:atas!acoes_ata_id_fkey(data_reuniao)")
    .eq("origem", "Reunião de Líderes")
    .in("encaminhamento", ["Pauta Geral", "Ação Geral"])
    .is("ata_geral_id", null)
    .order("created_at");
  if (error) {
    console.error(error);
    return;
  }
  itensLideresPendentes = data || [];
  renderItensLideres();
}

function renderItensLideres() {
  const lista = document.getElementById("vindos-lideres-lista");
  document.getElementById("vindos-lideres-empty").style.display = itensLideresPendentes.length ? "none" : "block";
  document.getElementById("btn-inserir-pautas").style.display = itensLideresPendentes.length ? "inline-flex" : "none";
  itensLideresPendentes.sort((a, b) => ordemTema(a.tema) - ordemTema(b.tema) || (a.prazo || "9").localeCompare(b.prazo || "9"));
  let temaAtual = null;
  lista.innerHTML = itensLideresPendentes
    .map((i) => {
      const ePauta = i.encaminhamento === "Pauta Geral";
      const cab = i.tema !== temaAtual ? `<div class="tema-cab">${escHtml((temaAtual = i.tema))}</div>` : "";
      return `${cab}<label class="item-lider">
        <input type="checkbox" class="chk-item-lider" data-id="${i.id}" checked />
        <span class="badge ${ePauta ? "badge-brigada" : "badge-warn"}">${ePauta ? "Pauta" : "Ação"}</span>
        <span class="item-lider-texto"><b>${escHtml(i.descricao)}</b>
          <span class="small text-muted">${i.responsavel ? " · " + escHtml(i.responsavel) : ""}${i.prazo ? " · prazo " + formatarDataBR(i.prazo) : ""} · Reunião de Líderes de ${formatarDataBR(i.ata?.data_reuniao)}</span>
        </span>
        ${ePauta ? `<button type="button" class="btn btn-secondary btn-pauta-acao" data-id="${i.id}" title="Transformar em ação desta reunião">➕ Virar ação</button>` : ""}
      </label>`;
    })
    .join("");
  lista.querySelectorAll(".btn-pauta-acao").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      const item = itensLideresPendentes.find((x) => x.id === b.dataset.id);
      lista.querySelector(`.chk-item-lider[data-id="${item.id}"]`).checked = true;
      adicionarLinhaAcao({ descricao: item.descricao, responsavel: item.responsavel, prazo: item.prazo, tema: item.tema, pautaId: item.id });
      showToast("Pauta adicionada como ação. Complete responsável e prazo.", "success");
    })
  );
}

function itensLideresSelecionados() {
  const ids = [...document.querySelectorAll(".chk-item-lider:checked")].map((c) => c.dataset.id);
  return itensLideresPendentes.filter((i) => ids.includes(i.id));
}

function inserirPautasNoConteudo() {
  const itens = itensLideresSelecionados().sort((a, b) => ordemTema(a.tema) - ordemTema(b.tema));
  if (!itens.length) return showToast("Nenhum item marcado.", "error");
  const ta = document.getElementById("ata-conteudo");
  let n = 0;
  const blocos = TEMAS.filter((t) => itens.some((i) => i.tema === t)).map(
    (t) =>
      `${t.toUpperCase()}\n\n` +
      itens
        .filter((i) => i.tema === t)
        .map(
          (p) =>
            `${++n}. ${p.descricao}${p.encaminhamento === "Ação Geral" && p.responsavel ? ` (responsável: ${p.responsavel}${p.prazo ? ", prazo " + formatarDataBR(p.prazo) : ""})` : ""}\n   Discussão: \n   Decisão: `
        )
        .join("\n\n")
  );
  const bloco = "PAUTA (trazida da Reunião de Líderes)\n\n" + blocos.join("\n\n") + "\n\nOUTROS ASSUNTOS\n- \n";
  ta.value = (ta.value ? ta.value.trimEnd() + "\n\n" : "") + bloco;
  ta.focus();
}

// ---------------- Salvar ----------------
async function salvarAta() {
  if (!CONFIGURADO) return showToast("Configure o Supabase antes de salvar.", "error");
  const data_reuniao = document.getElementById("ata-data").value;
  const conteudo = document.getElementById("ata-conteudo").value.trim();
  if (!data_reuniao || !conteudo) return showToast("Preencha a data e o conteúdo da reunião.", "error");

  const { itens, erros } = coletarAcoes();
  if (erros.length) return showToast(erros[0], "error");
  const vinculados = TIPO === "Geral" ? itensLideresSelecionados() : [];

  const btn = document.getElementById("btn-salvar-ata");
  btn.disabled = true;
  btn.textContent = "Salvando...";
  try {
    const { data: ata, error: ataError } = await supabaseClient.from("atas").insert({ data_reuniao, conteudo, tipo: TIPO }).select().single();
    if (ataError) throw ataError;

    if (itens.length) {
      const hoje = hojeISOLocal();
      const payload = itens.map((a) => ({
        ata_id: ata.id,
        descricao: a.descricao,
        responsavel: a.responsavel,
        prazo: a.prazo,
        status: a.prazo && a.prazo < hoje ? "Atrasada" : "Em andamento",
        origem: ORIGEM,
        encaminhamento: a.encaminhamento,
        tema: a.tema,
      }));
      const { error } = await supabaseClient.from("acoes").insert(payload);
      if (error) throw error;
    }

    if (vinculados.length) {
      const { error } = await supabaseClient.from("acoes").update({ ata_geral_id: ata.id }).in("id", vinculados.map((v) => v.id));
      if (error) throw error;
    }

    const lista = convidados();
    if (lista.length) {
      const { error } = await supabaseClient.from("ata_assinaturas").insert(
        lista.map((b) => {
          const e = presencaNova[b.id] || { presente: true, justificativa: "" };
          return { ata_id: ata.id, brigadista_id: b.id, assinado: false, presente: e.presente, justificativa: e.presente ? null : e.justificativa.trim() || null };
        })
      );
      if (error) throw error;
    }

    const partes = [];
    if (itens.length) partes.push(`${itens.length} item(ns) registrados`);
    if (vinculados.length) partes.push(`${vinculados.length} item(ns) dos líderes vinculados`);
    showToast("ATA registrada!" + (partes.length ? " " + partes.join(", ") + "." : ""), "success");

    document.getElementById("ata-conteudo").value = "";
    document.getElementById("acoes-container").innerHTML = "";
    carregarBrigadistas();
    atualizarEmptyAcoes();
    if (TIPO === "Geral") carregarItensLideres();
    document.querySelector('.tab-btn[data-tab="historico"]').click();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar ATA: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Salvar ATA";
  }
}

// ---------------- Histórico ----------------
let cacheHistorico = { atas: [], acoes: [], presenca: [] };

async function carregarHistorico() {
  const container = document.getElementById("historico-lista");
  const empty = document.getElementById("historico-empty");
  if (!CONFIGURADO) return;
  try {
    const { data: atas, error } = await supabaseClient.from("atas").select("*").eq("tipo", TIPO).order("data_reuniao", { ascending: false });
    if (error) throw error;
    if (!atas || !atas.length) {
      container.innerHTML = "";
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";
    const ids = atas.map((a) => a.id);
    const [proprias, vinculadas, todasAtasGerais, presencaRes] = await Promise.all([
      supabaseClient.from("acoes").select("*").in("ata_id", ids),
      TIPO === "Geral" ? supabaseClient.from("acoes").select("*").in("ata_geral_id", ids) : Promise.resolve({ data: [] }),
      TIPO === "Lideres" ? supabaseClient.from("atas").select("id,data_reuniao").eq("tipo", "Geral") : Promise.resolve({ data: [] }),
      supabaseClient
        .from("ata_assinaturas")
        .select("id, ata_id, brigadista_id, presente, justificativa, brigadista:brigadistas(nome,funcao,cargo)")
        .in("ata_id", ids),
    ]);
    const acoes = [...(proprias.data || []), ...(vinculadas.data || [])];
    const mapaGerais = Object.fromEntries((todasAtasGerais.data || []).map((g) => [g.id, g.data_reuniao]));
    const presenca = (presencaRes.data || []).filter((p) => p.brigadista);
    presenca.sort((a, b) => a.brigadista.nome.localeCompare(b.brigadista.nome));
    cacheHistorico = { atas, acoes, presenca };

    container.innerHTML = "";
    atas.forEach((ata) => {
      const doAta = acoes.filter((a) => a.ata_id === ata.id);
      const trazidos = acoes.filter((a) => a.ata_geral_id === ata.id);
      const card = document.createElement("div");
      card.className = "panel ata-card";

      const pres = presenca.filter((p) => p.ata_id === ata.id);
      const nAus = pres.filter((p) => !p.presente).length;
      const resumoPresenca = pres.length ? ` · ${pres.length - nAus} presentes${nAus ? `, <b style="color:var(--danger)">${nAus} ausente(s)</b>` : ""}` : "";
      let resumo;
      let botoes = `<button class="btn btn-outline btn-gerar-pdf" data-id="${ata.id}">📄 Gerar PDF</button>
        ${pres.length ? `<button class="btn btn-secondary btn-presenca" data-id="${ata.id}">👥 Presença</button>` : ""}`;
      if (TIPO === "Geral") {
        resumo = `${doAta.length} ação(ões) · ${trazidos.length} item(ns) dos líderes · ${
          ata.arquivo_assinado_url ? '<span class="badge badge-ok">ATA assinada anexada</span>' : '<span class="badge badge-warn">Aguardando ATA assinada</span>'
        }`;
        botoes += `
          <label class="btn btn-secondary" style="cursor:pointer;">📎 Anexar assinada
            <input type="file" accept="application/pdf,image/*" class="input-upload-assinada" data-id="${ata.id}" style="display:none;" />
          </label>
          ${ata.arquivo_assinado_url ? `<a href="${escHtml(ata.arquivo_assinado_url)}" target="_blank" class="btn btn-secondary">👁️ Ver assinada</a>` : ""}`;
      } else {
        const pend = doAta.filter((a) => a.encaminhamento !== "Líderes" && !a.ata_geral_id).length;
        resumo = `${doAta.length} item(ns)` + (pend ? ` · <span class="badge badge-warn">${pend} aguardando Reunião Geral</span>` : "");
      }
      resumo += resumoPresenca;
      botoes += `<button class="btn btn-secondary btn-excluir-ata" data-id="${ata.id}" title="Excluir">🗑️</button>`;

      doAta.sort((a, b) => ordemTema(a.tema) - ordemTema(b.tema));
      trazidos.sort((a, b) => ordemTema(a.tema) - ordemTema(b.tema));
      const linhasItens = doAta
        .map((a) => {
          let enc = "";
          if (TIPO === "Lideres") {
            if (a.ata_geral_id) {
              enc = `<span class="badge badge-ok">Levado à Reunião Geral de ${formatarDataBR(mapaGerais[a.ata_geral_id])}</span>`;
            } else {
              enc = `<select class="sel-encaminhamento" data-id="${a.id}" data-prazo="${a.prazo || ""}" data-resp="${escHtml(a.responsavel || "")}">
                ${Object.entries(ROTULO_ENC).map(([v, r]) => `<option value="${v}" ${a.encaminhamento === v ? "selected" : ""}>${r}</option>`).join("")}
              </select>`;
            }
          }
          return `<tr><td>${escHtml(a.descricao)}</td><td>${escHtml(a.responsavel || "-")}</td><td>${formatarDataBR(a.prazo)}</td>${TIPO === "Lideres" ? `<td>${enc}</td>` : ""}</tr>`;
        })
        .join("");

      const linhasTrazidos = trazidos
        .map((a) => `<tr><td><span class="badge ${a.encaminhamento === "Pauta Geral" ? "badge-brigada" : "badge-warn"}">${a.encaminhamento === "Pauta Geral" ? "Pauta" : "Ação"}</span> ${escHtml(a.descricao)}</td><td>${escHtml(a.responsavel || "-")}</td><td>${formatarDataBR(a.prazo)}</td></tr>`)
        .join("");

      card.innerHTML = `
        <div class="row justify-between">
          <div>
            <h3 style="margin:0 0 4px;">${TIPO === "Geral" ? "Reunião Geral" : "Reunião de Líderes"} de ${formatarDataBR(ata.data_reuniao)}</h3>
            <p class="text-muted small" style="margin:0;">${resumo}</p>
          </div>
          <div class="row">${botoes}</div>
        </div>
        <div class="painel-presenca mt-16" id="presenca-${ata.id}" style="display:none;">
          <div class="presenca-grid lista"></div>
          <div class="row mt-16"><button class="btn btn-primary btn-salvar-presenca" data-id="${ata.id}">💾 Salvar presença</button></div>
        </div>
        <details class="mt-16">
          <summary class="small">Ver conteúdo e itens</summary>
          <div class="conteudo-ata">${escHtml(ata.conteudo)}</div>
          ${linhasTrazidos ? `<h4>Trazido da Reunião de Líderes</h4><div class="table-wrap"><table><thead><tr><th>Item</th><th>Responsável</th><th>Prazo</th></tr></thead><tbody>${linhasTrazidos}</tbody></table></div>` : ""}
          ${linhasItens ? `<h4>${TIPO === "Geral" ? "Ações geradas" : "Ações e pautas"}</h4><div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Responsável</th><th>Prazo</th>${TIPO === "Lideres" ? "<th>Encaminhamento</th>" : ""}</tr></thead><tbody>${linhasItens}</tbody></table></div>` : ""}
        </details>`;
      container.appendChild(card);
    });

    container.querySelectorAll(".btn-gerar-pdf").forEach((b) => b.addEventListener("click", () => gerarPdfAta(b.dataset.id)));
    container.querySelectorAll(".input-upload-assinada").forEach((i) => i.addEventListener("change", (e) => anexarAtaAssinada(e, i.dataset.id)));
    container.querySelectorAll(".btn-excluir-ata").forEach((b) => b.addEventListener("click", () => excluirAta(b.dataset.id)));
    container.querySelectorAll(".sel-encaminhamento").forEach((s) => s.addEventListener("change", () => alterarEncaminhamento(s)));
    container.querySelectorAll(".btn-presenca").forEach((b) => b.addEventListener("click", () => abrirPresenca(b.dataset.id)));
    container.querySelectorAll(".btn-salvar-presenca").forEach((b) => b.addEventListener("click", () => salvarPresenca(b.dataset.id, b)));
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar histórico: " + err.message, "error");
  }
}

// Edição da presença de uma reunião já registrada
const estadosPresenca = {};
function abrirPresenca(ataId) {
  const painel = document.getElementById("presenca-" + ataId);
  if (painel.style.display !== "none") {
    painel.style.display = "none";
    return;
  }
  const pres = cacheHistorico.presenca.filter((p) => p.ata_id === ataId);
  const estado = {};
  pres.forEach((p) => (estado[p.brigadista_id] = { presente: p.presente, justificativa: p.justificativa || "", rowId: p.id }));
  estadosPresenca[ataId] = estado;
  const pessoas = pres.map((p) => ({ id: p.brigadista_id, ...p.brigadista }));
  renderPresenca(painel.querySelector(".lista"), pessoas, estado, null);
  painel.style.display = "block";
}

async function salvarPresenca(ataId, btn) {
  const estado = estadosPresenca[ataId];
  if (!estado) return;
  btn.disabled = true;
  try {
    const res = await Promise.all(
      Object.values(estado).map((e) =>
        supabaseClient
          .from("ata_assinaturas")
          .update({ presente: e.presente, justificativa: e.presente ? null : (e.justificativa || "").trim() || null })
          .eq("id", e.rowId)
      )
    );
    const erro = res.find((r) => r.error);
    if (erro) throw erro.error;
    showToast("Presença atualizada!", "success");
    carregarHistorico();
  } catch (err) {
    showToast("Erro ao salvar presença: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function alterarEncaminhamento(sel) {
  const novo = sel.value;
  if (novo !== "Pauta Geral" && (!sel.dataset.prazo || !sel.dataset.resp)) {
    showToast("Este item não tem responsável/prazo. Complete no Plano de Ação antes de transformá-lo em ação.", "error");
    carregarHistorico();
    return;
  }
  const { error } = await supabaseClient.from("acoes").update({ encaminhamento: novo }).eq("id", sel.dataset.id);
  if (error) return showToast("Erro ao alterar: " + error.message, "error");
  showToast("Encaminhamento atualizado.", "success");
  carregarHistorico();
}

async function anexarAtaAssinada(e, ataId) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    showToast("Enviando arquivo...");
    const url = await uploadArquivo(BUCKET_DOCUMENTOS, file, "atas/");
    const { error } = await supabaseClient.from("atas").update({ arquivo_assinado_url: url }).eq("id", ataId);
    if (error) throw error;
    showToast("ATA assinada anexada com sucesso!", "success");
    carregarHistorico();
  } catch (err) {
    showToast("Erro ao anexar: " + err.message, "error");
  }
}

async function excluirAta(ataId) {
  const msg =
    TIPO === "Geral"
      ? "Excluir esta ATA? As ações geradas continuam no Plano de Ação e os itens dos líderes voltam a ficar pendentes."
      : "Excluir esta ATA de líderes? Os itens gerados continuam no Plano de Ação/pautas, mas perdem o vínculo com esta reunião.";
  if (!confirm(msg)) return;
  const { error } = await supabaseClient.from("atas").delete().eq("id", ataId);
  if (error) return showToast("Erro ao excluir: " + error.message, "error");
  showToast("ATA excluída.", "success");
  carregarHistorico();
  if (TIPO === "Geral") carregarItensLideres();
}

// ---------------- PDF ----------------
async function gerarPdfAta(ataId) {
  const ata = cacheHistorico.atas.find((a) => a.id === ataId);
  if (!ata) return;
  const porTema = (a, b) => ordemTema(a.tema) - ordemTema(b.tema);
  const doAta = cacheHistorico.acoes.filter((a) => a.ata_id === ataId).sort(porTema);
  const trazidos = cacheHistorico.acoes.filter((a) => a.ata_geral_id === ataId).sort(porTema);
  let pres = cacheHistorico.presenca.filter((p) => p.ata_id === ataId);
  if (!pres.length) {
    // Reuniões antigas sem lista de presença: considera todos os convocados atuais como presentes
    pres = convidados().map((b) => ({ presente: true, justificativa: null, brigadista: b }));
  }
  const presentes = pres.filter((p) => p.presente).map((p) => p.brigadista);
  const ausentes = pres.filter((p) => !p.presente);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const marginX = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - marginX * 2;
  const titulo = TIPO === "Geral" ? "ATA DA REUNIÃO GERAL DA BRIGADA" : "ATA DA REUNIÃO DE LÍDERES DA BRIGADA";
  let y = await cabecalhoPdf(doc, titulo, [
    "Data da reunião: " + formatarDataBR(ata.data_reuniao),
    `Presentes: ${presentes.length}   ·   Ausentes: ${ausentes.length}`,
  ]);

  const secao = (t) => {
    if (y > 260) {
      doc.addPage();
      y = 18;
    }
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COR_ESCURA);
    doc.text(t, marginX, y);
    y += 2;
  };
  const tabela = (head, body) => {
    doc.autoTable({ startY: y + 2, head: [head], body, styles: { fontSize: 9 }, headStyles: CORES_TABELA_PDF, margin: { left: marginX, right: marginX, bottom: 16 } });
    y = doc.lastAutoTable.finalY + 9;
  };

  if (TIPO === "Lideres") {
    if (presentes.length) {
      secao("Participantes (presentes):");
      tabela(["Nome", "Função"], presentes.map((l) => [l.nome, l.funcao || l.cargo || "-"]));
    }
    if (ausentes.length) {
      secao("Ausentes:");
      tabela(["Nome", "Função", "Motivo"], ausentes.map((a) => [a.brigadista.nome, a.brigadista.funcao || a.brigadista.cargo || "-", a.justificativa || "-"]));
    }
  }

  secao("Conteúdo da reunião:");
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.splitTextToSize(ata.conteudo || "-", contentWidth).forEach((linha) => {
    if (y > 278) {
      doc.addPage();
      y = 18;
    }
    doc.text(linha, marginX, y);
    y += 5;
  });
  y += 6;

  if (TIPO === "Geral" && trazidos.length) {
    secao("Trazido da Reunião de Líderes:");
    tabela(
      ["Tema", "Tipo", "Descrição", "Responsável", "Prazo"],
      trazidos.map((a) => [a.tema, a.encaminhamento === "Pauta Geral" ? "Pauta" : "Ação", a.descricao, a.responsavel || "-", formatarDataBR(a.prazo)])
    );
  }

  secao(TIPO === "Geral" ? "Ações geradas nesta reunião:" : "Ações e pautas geradas:");
  if (doAta.length) {
    if (TIPO === "Geral") tabela(["Tema", "Descrição", "Responsável", "Prazo"], doAta.map((a) => [a.tema, a.descricao, a.responsavel || "-", formatarDataBR(a.prazo)]));
    else tabela(["Tema", "Descrição", "Responsável", "Prazo", "Encaminhamento"], doAta.map((a) => [a.tema, a.descricao, a.responsavel || "-", formatarDataBR(a.prazo), ROTULO_ENC[a.encaminhamento] || "-"]));
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Nenhum item gerado nesta reunião.", marginX, y + 6);
    y += 16;
  }

  if (TIPO === "Geral") {
    if (ausentes.length) {
      secao("Ausentes:");
      tabela(["Nome", "Função", "Motivo"], ausentes.map((a) => [a.brigadista.nome, a.brigadista.funcao || a.brigadista.cargo || "-", a.justificativa || "-"]));
    }
    secao("Assinatura dos presentes:");
    doc.autoTable({
      startY: y + 2,
      head: [["Nome", "Função", "Assinatura"]],
      body: presentes.map((b) => [b.nome, b.funcao || b.cargo || "-", ""]),
      styles: { fontSize: 9, minCellHeight: 10, valign: "middle" },
      columnStyles: { 2: { cellWidth: 70 } },
      headStyles: CORES_TABELA_PDF,
      margin: { left: marginX, right: marginX, bottom: 16 },
    });
  }

  rodapePdf(doc);
  doc.save(`ata-${TIPO === "Geral" ? "reuniao-geral" : "reuniao-lideres"}-${ata.data_reuniao}.pdf`);
}
