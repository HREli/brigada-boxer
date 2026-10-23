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
// Reunião Geral: registro em "modo reunião" (um cartão por assunto da ordem do dia)
const MODO_REUNIAO = !!document.getElementById("ordem-dia");

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  setupTabsReuniao();
  carregarBrigadistas();
  atualizarEmptyAcoes();
  document.getElementById("ata-data").value = hojeISOLocal();

  const btnAdd = document.getElementById("btn-add-acao");
  if (btnAdd) btnAdd.addEventListener("click", () => adicionarLinhaAcao());
  document.getElementById("btn-salvar-ata").addEventListener("click", salvarAta);
  if (MODO_REUNIAO) {
    iniciarModoReuniao();
    carregarItensLideres();
  } else if (TIPO === "Geral") {
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
  if (MODO_REUNIAO && rascunho && rascunho.presenca)
    Object.entries(rascunho.presenca).forEach(([id, e]) => {
      if (presencaNova[id]) presencaNova[id] = { presente: e.presente !== false, justificativa: e.justificativa || "" };
    });
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
  if (!c) return;
  document.getElementById("acoes-empty").style.display = c.children.length === 0 ? "block" : "none";
}

function coletarAcoes() {
  const itens = [];
  const erros = [];
  document.querySelectorAll("#tab-nova .acao-row").forEach((row, i) => {
    const descricao = row.querySelector(".acao-descricao").value.trim();
    const responsavel = row.querySelector(".acao-responsavel").value.trim();
    const prazo = row.querySelector(".acao-prazo").value;
    const encaminhamento = TIPO === "Lideres" ? row.querySelector(".acao-encaminhamento").value : null;
    const card = row.closest(".assunto");
    const tema = card ? temaDoAssunto(card) : row.querySelector(".acao-tema").value || "Outros";
    const rotulo = card ? `Ação do assunto ${card.querySelector(".assunto-num").textContent}` : `Item ${i + 1}`;
    if (!descricao && !responsavel && !prazo) return;
    if (!descricao) return erros.push(`${rotulo}: falta a descrição.`);
    if (encaminhamento !== "Pauta Geral" && (!responsavel || !prazo)) return erros.push(`${rotulo}: informe responsável e prazo.`);
    itens.push({ descricao, responsavel: responsavel || null, prazo: prazo || null, encaminhamento, tema, pautaId: row.dataset.pautaId || null, row });
  });
  return { itens, erros };
}

// ---------------- Itens vindos dos líderes (só na Geral) ----------------
async function carregarItensLideres() {
  if (!CONFIGURADO) return;
  let consulta = supabaseClient
    .from("acoes")
    .select("*, ata:atas!acoes_ata_id_fkey(data_reuniao)")
    .eq("origem", "Reunião de Líderes")
    .in("encaminhamento", ["Pauta Geral", "Ação Geral"]);
  // Editando uma ATA já salva: mostra também os itens que já estão vinculados a ela
  const editId = MODO_REUNIAO && rascunho && rascunho.editId;
  consulta = editId ? consulta.or(`ata_geral_id.is.null,ata_geral_id.eq.${editId}`) : consulta.is("ata_geral_id", null);
  const { data, error } = await consulta.order("created_at");
  if (error) {
    console.error(error);
    return;
  }
  itensLideresPendentes = data || [];
  renderItensLideres();
}

function renderItensLideres() {
  if (MODO_REUNIAO) return renderOrdemDia();
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
  const conteudo = MODO_REUNIAO ? montarConteudoAta() : document.getElementById("ata-conteudo").value.trim();
  if (!data_reuniao) return showToast("Preencha a data da reunião.", "error");
  if (MODO_REUNIAO && !temRegistro()) return showToast("Registre a discussão ou a decisão de pelo menos um assunto.", "error");
  if (!conteudo) return showToast("Preencha a data e o conteúdo da reunião.", "error");

  const { itens, erros } = coletarAcoes();
  if (erros.length) return showToast(erros[0], "error");
  if (MODO_REUNIAO && rascunho && rascunho.editId) return salvarEdicaoAta(data_reuniao, conteudo, itens);
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
      const { data: novas, error } = await supabaseClient.from("acoes").insert(payload).select("id");
      if (error) throw error;
      (novas || []).forEach((n, k) => itens[k] && itens[k].row && (itens[k].row.dataset.acaoId = n.id));
    }
    if (MODO_REUNIAO) {
      const { error } = await supabaseClient.from("atas").update({ registro: registroAtual() }).eq("id", ata.id);
      if (error) console.error(error);
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

    if (MODO_REUNIAO) limparModoReuniao();
    else {
      document.getElementById("ata-conteudo").value = "";
      document.getElementById("acoes-container").innerHTML = "";
    }
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
        .select("id, ata_id, brigadista_id, presente, justificativa, brigadista:brigadistas(nome,funcao,cargo,data_entrada,data_saida)")
        .in("ata_id", ids),
    ]);
    const acoes = [...(proprias.data || []), ...(vinculadas.data || [])];
    const mapaGerais = Object.fromEntries((todasAtasGerais.data || []).map((g) => [g.id, g.data_reuniao]));
    // quem já tinha saído (ou ainda não tinha entrado) na data da reunião não entra na lista
    const dataAta = Object.fromEntries(atas.map((a) => [a.id, a.data_reuniao]));
    const presenca = (presencaRes.data || []).filter((p) => p.brigadista && participavaEm(p.brigadista, dataAta[p.ata_id]));
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
      if (MODO_REUNIAO) botoes = `<button class="btn btn-primary btn-editar-ata" data-id="${ata.id}">✏️ Editar</button>` + botoes;
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
    container.querySelectorAll(".btn-editar-ata").forEach((b) => b.addEventListener("click", () => editarAta(b.dataset.id)));
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
      head: [["Nome", "Assinatura"]],
      body: presentes.map((b) => [b.nome, ""]),
      theme: "grid",
      // linhas altas para caber a assinatura (inclusive assinatura digital)
      styles: { fontSize: 10, minCellHeight: 22, valign: "middle", lineColor: [190, 190, 190], lineWidth: 0.2 },
      columnStyles: { 0: { cellWidth: 72, textColor: [39, 38, 38] } },
      rowPageBreak: "avoid",
      headStyles: { ...CORES_TABELA_PDF, minCellHeight: 8 },
      margin: { left: marginX, right: marginX, bottom: 16 },
    });
  }

  rodapePdf(doc);
  doc.save(`ata-${TIPO === "Geral" ? "reuniao-geral" : "reuniao-lideres"}-${ata.data_reuniao}.pdf`);
}

// =========================================================================
// MODO REUNIÃO (Reunião Geral)
// Um cartão por assunto: discussão, decisão e ações ficam juntas. O texto da
// ATA é montado a partir dos cartões, e o rascunho fica guardado no navegador.
// =========================================================================
const CHAVE_RASCUNHO = "brigada-rascunho-ata-" + TIPO;
let rascunho = lerRascunho();
let timerRascunho = null;

function lerRascunho() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) || "null");
  } catch (e) {
    return null;
  }
}

function iniciarModoReuniao() {
  if (rascunho && rascunho.data) document.getElementById("ata-data").value = rascunho.data;
  if (rascunho && rascunho.obs) document.getElementById("ata-obs").value = rascunho.obs;
  ((rascunho && rascunho.novos) || []).forEach((n) => adicionarAssuntoNovo(n));
  document.getElementById("btn-novo-assunto").addEventListener("click", () => {
    const c = adicionarAssuntoNovo();
    c.querySelector(".as-titulo").focus();
    salvarRascunhoDepois();
  });
  const tab = document.getElementById("tab-nova");
  tab.addEventListener("input", (e) => {
    if (e.target.tagName === "TEXTAREA") autoAltura(e.target);
    salvarRascunhoDepois();
  });
  tab.addEventListener("change", salvarRascunhoDepois);
  document.getElementById("previa-ata").addEventListener("toggle", atualizarPrevia);
  document.getElementById("btn-limpar-rascunho").addEventListener("click", (e) => {
    e.preventDefault();
    if (!confirm("Apagar o rascunho e começar o registro do zero?")) return;
    limparModoReuniao();
    carregarBrigadistas();
    carregarItensLideres();
  });
  autoAltura(document.getElementById("ata-obs"));
  mostrarAvisoEdicao();
  if (rascunho) mostrarStatusRascunho("📝 Rascunho recuperado (" + horaDe(rascunho.ts) + ")");
}

function renderOrdemDia() {
  const cont = document.getElementById("ordem-dia");
  document.getElementById("vindos-lideres-empty").style.display = itensLideresPendentes.length ? "none" : "block";
  itensLideresPendentes.sort((a, b) => ordemTema(a.tema) - ordemTema(b.tema) || (a.prazo || "9").localeCompare(b.prazo || "9"));
  cont.innerHTML = "";
  let temaAtual = null;
  itensLideresPendentes.forEach((i) => {
    if (i.tema !== temaAtual) {
      temaAtual = i.tema;
      const h = document.createElement("div");
      h.className = "tema-cab";
      h.textContent = i.tema || "Outros";
      cont.appendChild(h);
    }
    const r = (rascunho && rascunho.cards && rascunho.cards[i.id]) || {};
    const ePauta = i.encaminhamento === "Pauta Geral";
    const meta = [i.responsavel && "Responsável: " + escHtml(i.responsavel), i.prazo && "prazo " + formatarDataBR(i.prazo), "Reunião de Líderes de " + formatarDataBR(i.ata && i.ata.data_reuniao)]
      .filter(Boolean)
      .join(" · ");
    const card = document.createElement("div");
    card.className = "assunto";
    card.dataset.id = i.id;
    card.dataset.tema = i.tema || "Outros";
    card.innerHTML = `<div class="assunto-cab">
        <span class="assunto-num"></span>
        <div class="assunto-titulo">
          <span class="badge ${ePauta ? "badge-brigada" : "badge-warn"}">${ePauta ? "Pauta" : "Ação"}</span>
          <b>${escHtml(i.descricao)}</b>
          <div class="small text-muted">${meta}</div>
        </div>
        <label class="assunto-chk small"><input type="checkbox" class="chk-item-lider" data-id="${i.id}" ${(r.chk === undefined ? !(rascunho && rascunho.editId) : r.chk) ? "checked" : ""} /> tratado</label>
      </div>
      ${corpoAssunto(r)}`;
    cont.appendChild(card);
    ligarAssunto(card, r, ePauta ? i.descricao : "");
  });
  renumerar();
}

function corpoAssunto(r) {
  return `<div class="assunto-corpo">
    <div class="assunto-campos">
      <div class="field"><label>Discussão</label><textarea class="as-disc" placeholder="O que foi falado">${escHtml(r.disc || "")}</textarea></div>
      <div class="field"><label>Decisão</label><textarea class="as-dec" placeholder="O que ficou decidido">${escHtml(r.dec || "")}</textarea></div>
    </div>
    <div class="as-acoes"></div>
    <button type="button" class="btn btn-secondary btn-as-acao">+ Ação</button>
  </div>`;
}

function ligarAssunto(card, r, descPadrao) {
  const chk = card.querySelector(".chk-item-lider");
  if (chk) {
    const upd = () => {
      card.classList.toggle("nao-tratado", !chk.checked);
      renumerar();
    };
    chk.addEventListener("change", upd);
    upd();
  }
  (r.acoes || []).forEach((a) => adicionarAcaoNoAssunto(card, a));
  card.querySelector(".btn-as-acao").addEventListener("click", () => {
    const primeira = !card.querySelector(".acao-row");
    const padrao = typeof descPadrao === "function" ? descPadrao() : descPadrao;
    const row = adicionarAcaoNoAssunto(card, { d: primeira ? padrao : "" });
    row.querySelector(primeira && padrao ? ".acao-responsavel" : ".acao-descricao").focus();
    salvarRascunhoDepois();
  });
  card.querySelectorAll("textarea").forEach(autoAltura);
}

function adicionarAcaoNoAssunto(card, a = {}) {
  const row = document.getElementById("tpl-acao-row").content.firstElementChild.cloneNode(true);
  row.querySelector(".acao-tema").closest(".field").style.display = "none";
  row.querySelector(".acao-descricao").value = a.d || "";
  row.querySelector(".acao-responsavel").value = a.r || "";
  row.querySelector(".acao-prazo").value = a.p || "";
  if (a.id) row.dataset.acaoId = a.id;
  row.querySelector(".btn-remove-acao").addEventListener("click", () => {
    row.remove();
    salvarRascunhoDepois();
  });
  card.querySelector(".as-acoes").appendChild(row);
  return row;
}

function adicionarAssuntoNovo(r = {}) {
  const card = document.createElement("div");
  card.className = "assunto assunto-novo";
  card.innerHTML = `<div class="assunto-cab">
      <span class="assunto-num"></span>
      <div class="assunto-titulo row" style="gap:8px;">
        <input type="text" class="as-titulo" placeholder="Qual é o assunto?" value="${escHtml(r.titulo || "")}" style="flex:2; min-width:200px;" />
        <select class="as-tema" style="flex:1; min-width:170px;">${opcoesTema(r.tema || "Outros")}</select>
      </div>
      <button type="button" class="btn btn-secondary btn-as-remover" title="Remover este assunto">✕</button>
    </div>
    ${corpoAssunto(r)}`;
  document.getElementById("novos-assuntos").appendChild(card);
  ligarAssunto(card, r, () => card.querySelector(".as-titulo").value.trim());
  card.querySelector(".btn-as-remover").addEventListener("click", () => {
    const d = dadosAssunto(card);
    const temTexto = card.querySelector(".as-titulo").value.trim() || d.disc.trim() || d.dec.trim() || d.acoes.length;
    if (temTexto && !confirm("Remover este assunto e o que foi escrito nele?")) return;
    card.remove();
    renumerar();
    salvarRascunhoDepois();
  });
  renumerar();
  return card;
}

function temaDoAssunto(card) {
  const sel = card.querySelector(".as-tema");
  return (sel && sel.value) || card.dataset.tema || "Outros";
}

function renumerar() {
  let n = 0;
  document.querySelectorAll("#tab-nova .assunto").forEach((c) => {
    c.querySelector(".assunto-num").textContent = c.classList.contains("nao-tratado") ? "–" : ++n;
  });
}

function dadosAssunto(c) {
  return {
    disc: c.querySelector(".as-disc").value,
    dec: c.querySelector(".as-dec").value,
    acoes: [...c.querySelectorAll(".acao-row")]
      .map((r) => ({ id: r.dataset.acaoId || undefined, d: r.querySelector(".acao-descricao").value, r: r.querySelector(".acao-responsavel").value, p: r.querySelector(".acao-prazo").value }))
      .filter((a) => a.d || a.r || a.p),
  };
}

function assuntosNovosPreenchidos() {
  return [...document.querySelectorAll("#novos-assuntos .assunto")].filter((c) => {
    const d = dadosAssunto(c);
    return c.querySelector(".as-titulo").value.trim() || d.disc.trim() || d.dec.trim() || d.acoes.length;
  });
}

function temRegistro() {
  const tratados = [...document.querySelectorAll("#ordem-dia .assunto:not(.nao-tratado)")];
  const algum = tratados.some((c) => {
    const d = dadosAssunto(c);
    return d.disc.trim() || d.dec.trim() || d.acoes.length;
  });
  return algum || assuntosNovosPreenchidos().length > 0 || !!document.getElementById("ata-obs").value.trim();
}

// Texto da ATA (vai para o histórico e para o PDF)
function montarConteudoAta() {
  const recuo = (t) => t.trim().split("\n").join("\n      ");
  const bloco = (n, titulo, card) => {
    const d = dadosAssunto(card);
    let s = `${n}. ${titulo}`;
    if (d.disc.trim()) s += `\n   Discussão: ${recuo(d.disc)}`;
    if (d.dec.trim()) s += `\n   Decisão: ${recuo(d.dec)}`;
    d.acoes
      .filter((a) => a.d.trim())
      .forEach((a) => (s += `\n   • Ação: ${a.d.trim()}${a.r.trim() ? " — " + a.r.trim() : ""}${a.p ? ", prazo " + formatarDataBR(a.p) : ""}`));
    return s;
  };
  let n = 0;
  const partes = [];
  const tratados = [...document.querySelectorAll("#ordem-dia .assunto:not(.nao-tratado)")];
  if (tratados.length) {
    const sec = ["ORDEM DO DIA (trazida da Reunião de Líderes)"];
    let tema = null;
    tratados.forEach((c) => {
      const item = itensLideresPendentes.find((x) => x.id === c.dataset.id);
      if (!item) return;
      if (item.tema !== tema) sec.push((tema = item.tema || "Outros").toUpperCase());
      let titulo = item.descricao;
      if (item.encaminhamento === "Ação Geral" && item.responsavel)
        titulo += ` (responsável: ${item.responsavel}${item.prazo ? ", prazo " + formatarDataBR(item.prazo) : ""})`;
      sec.push(bloco(++n, titulo, c));
    });
    partes.push(sec.join("\n\n"));
  }
  const novos = assuntosNovosPreenchidos();
  if (novos.length)
    partes.push(
      "OUTROS ASSUNTOS\n\n" +
        novos.map((c) => bloco(++n, `${c.querySelector(".as-titulo").value.trim() || "Assunto"} [${temaDoAssunto(c)}]`, c)).join("\n\n")
    );
  const obs = document.getElementById("ata-obs").value.trim();
  if (obs) partes.push("OBSERVAÇÕES GERAIS\n\n" + obs);
  return partes.join("\n\n");
}

function atualizarPrevia() {
  if (!document.getElementById("previa-ata").open) return;
  document.getElementById("ata-previa").textContent = montarConteudoAta() || "(nada registrado ainda)";
}

function salvarRascunhoDepois() {
  clearTimeout(timerRascunho);
  timerRascunho = setTimeout(salvarRascunho, 400);
}

function salvarRascunho() {
  const cards = {};
  document.querySelectorAll("#ordem-dia .assunto").forEach((c) => (cards[c.dataset.id] = { chk: c.querySelector(".chk-item-lider").checked, ...dadosAssunto(c) }));
  const novos = [...document.querySelectorAll("#novos-assuntos .assunto")].map((c) => ({
    titulo: c.querySelector(".as-titulo").value,
    tema: c.querySelector(".as-tema").value,
    ...dadosAssunto(c),
  }));
  rascunho = {
    ...(rascunho && rascunho.editId ? { editId: rascunho.editId, editData: rascunho.editData, acoesOriginais: rascunho.acoesOriginais || [] } : {}),
    ts: Date.now(),
    data: document.getElementById("ata-data").value,
    obs: document.getElementById("ata-obs").value,
    presenca: Object.keys(presencaNova).length ? presencaNova : (rascunho && rascunho.presenca) || {},
    cards: { ...((rascunho && rascunho.cards) || {}), ...cards },
    novos,
  };
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(rascunho));
    mostrarStatusRascunho("💾 Rascunho salvo às " + horaDe(rascunho.ts));
  } catch (e) {
    mostrarStatusRascunho("⚠️ Este navegador não permitiu guardar o rascunho");
  }
  atualizarPrevia();
}

function limparModoReuniao() {
  clearTimeout(timerRascunho);
  try {
    localStorage.removeItem(CHAVE_RASCUNHO);
  } catch (e) {}
  rascunho = null;
  document.getElementById("novos-assuntos").innerHTML = "";
  document.getElementById("ata-obs").value = "";
  document.getElementById("ata-data").value = hojeISOLocal();
  document.getElementById("previa-ata").open = false;
  mostrarStatusRascunho("");
  mostrarAvisoEdicao();
}

function mostrarStatusRascunho(t) {
  document.getElementById("rascunho-status").textContent = t;
  document.getElementById("btn-limpar-rascunho").style.display = t ? "inline" : "none";
}

function horaDe(ts) {
  const d = new Date(ts);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? hora : d.toLocaleDateString("pt-BR") + " " + hora;
}

function autoAltura(t) {
  if (!t) return;
  t.style.height = "auto";
  t.style.height = Math.max(64, t.scrollHeight + 2) + "px";
}

// ---------------- Editar uma ATA já salva (modo reunião) ----------------
function registroAtual() {
  const cards = {};
  document.querySelectorAll("#ordem-dia .assunto").forEach((c) => (cards[c.dataset.id] = { chk: c.querySelector(".chk-item-lider").checked, ...dadosAssunto(c) }));
  const novos = [...document.querySelectorAll("#novos-assuntos .assunto")].map((c) => ({ titulo: c.querySelector(".as-titulo").value, tema: c.querySelector(".as-tema").value, ...dadosAssunto(c) }));
  return { cards, novos, obs: document.getElementById("ata-obs").value };
}

function mostrarAvisoEdicao() {
  let av = document.getElementById("aviso-edicao");
  const editando = rascunho && rascunho.editId;
  const btn = document.getElementById("btn-salvar-ata");
  btn.textContent = editando ? "💾 Salvar alterações" : "💾 Salvar ATA";
  if (!editando) return av && av.remove();
  if (!av) {
    av = document.createElement("div");
    av.id = "aviso-edicao";
    av.className = "aviso-edicao";
    document.getElementById("tab-nova").prepend(av);
  }
  av.innerHTML = `✏️ Você está <b>editando a ATA de ${formatarDataBR(rascunho.editData)}</b>, que já foi salva. As alterações só valem quando você clicar em <b>Salvar alterações</b>.
    <button type="button" class="btn btn-secondary" id="btn-cancelar-edicao">Cancelar edição</button>`;
  av.querySelector("#btn-cancelar-edicao").addEventListener("click", () => {
    if (!confirm("Descartar as alterações e sair da edição? A ATA salva continua como estava.")) return;
    limparModoReuniao();
    location.reload();
  });
}

async function editarAta(ataId) {
  const ata = cacheHistorico.atas.find((a) => a.id === ataId);
  if (!ata) return;
  if (rascunho && rascunho.editId !== ataId) {
    const msg = rascunho.editId ? "Você está editando outra ATA. Descartar essas alterações e abrir esta?" : "Há um rascunho de nova reunião em andamento. Ele será substituído pela ATA que você quer editar. Continuar?";
    if (!confirm(msg)) return;
  }
  if (!(rascunho && rascunho.editId === ataId)) {
    const reg = ata.registro || registroDeConteudo(ata);
    // traz responsável e prazo atualizados (podem ter mudado no Plano de Ação)
    const ids = [...Object.values(reg.cards || {}), ...(reg.novos || [])].flatMap((c) => (c.acoes || []).map((a) => a.id)).filter(Boolean);
    if (ids.length) {
      const { data: atuais } = await supabaseClient.from("acoes").select("id,descricao,responsavel,prazo").in("id", ids);
      const mapa = Object.fromEntries((atuais || []).map((a) => [a.id, a]));
      [...Object.values(reg.cards || {}), ...(reg.novos || [])].forEach((c) => {
        c.acoes = (c.acoes || []).filter((a) => !a.id || mapa[a.id]).map((a) => (a.id ? { id: a.id, d: mapa[a.id].descricao, r: mapa[a.id].responsavel || "", p: mapa[a.id].prazo || "" } : a));
      });
    }
    const presenca = {};
    cacheHistorico.presenca.filter((p) => p.ata_id === ataId).forEach((p) => (presenca[p.brigadista_id] = { presente: p.presente, justificativa: p.justificativa || "" }));
    rascunho = {
      editId: ataId,
      editData: ata.data_reuniao,
      acoesOriginais: ids.filter((id) => [...Object.values(reg.cards || {}), ...(reg.novos || [])].some((c) => (c.acoes || []).some((a) => a.id === id))),
      ts: Date.now(),
      data: ata.data_reuniao,
      obs: reg.obs || "",
      presenca,
      cards: reg.cards || {},
      novos: reg.novos || [],
    };
    try {
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(rascunho));
    } catch (e) {
      return showToast("Este navegador não permitiu abrir a edição.", "error");
    }
  }
  location.reload();
}

// ATAs salvas antes do registro estruturado: reconstrói os cartões a partir do texto
function registroDeConteudo(ata) {
  const linhas = (ata.conteudo || "").split("\n");
  const vinculados = cacheHistorico.acoes.filter((a) => a.ata_geral_id === ata.id);
  const proprias = cacheHistorico.acoes.filter((a) => a.ata_id === ata.id);
  const reg = { cards: {}, novos: [], obs: "" };
  vinculados.forEach((v) => (reg.cards[v.id] = { chk: true, disc: "", dec: "", acoes: [] }));
  let atual = null;
  let campo = null;
  let secao = "";
  linhas.forEach((l) => {
    if (/^(ORDEM DO DIA|OUTROS ASSUNTOS|OBSERVAÇÕES GERAIS)/.test(l)) {
      secao = l.startsWith("OBSERVAÇÕES") ? "obs" : "";
      atual = null;
      return;
    }
    if (secao === "obs") return (reg.obs += (reg.obs ? "\n" : "") + l);
    const m = l.match(/^\d+\. (.*)$/);
    if (m) {
      const v = vinculados.find((x) => m[1].startsWith(x.descricao));
      if (v) atual = reg.cards[v.id];
      else {
        const t = m[1].match(/^(.*) \[(.+)\]$/);
        atual = { titulo: t ? t[1] : m[1], tema: t ? t[2] : "Outros", disc: "", dec: "", acoes: [] };
        reg.novos.push(atual);
      }
      campo = null;
      return;
    }
    if (!atual) return;
    let k;
    if ((k = l.match(/^\s+Discussão: ?(.*)$/))) return ((campo = "disc"), (atual.disc = k[1]));
    if ((k = l.match(/^\s+Decisão: ?(.*)$/))) return ((campo = "dec"), (atual.dec = k[1]));
    if ((k = l.match(/^\s+• Ação: (.*)$/))) {
      campo = null;
      const txt = k[1];
      const a = proprias.find((x) => txt.startsWith(x.descricao));
      atual.acoes.push(a ? { id: a.id, d: a.descricao, r: a.responsavel || "", p: a.prazo || "" } : { d: txt.split(" — ")[0], r: "", p: "" });
      return;
    }
    if (campo && /^\s{6}/.test(l)) atual[campo] += "\n" + l.trim();
  });
  reg.obs = reg.obs.trim();
  return reg;
}

async function salvarEdicaoAta(data_reuniao, conteudo, itens) {
  const ataId = rascunho.editId;
  const btn = document.getElementById("btn-salvar-ata");
  btn.disabled = true;
  btn.textContent = "Salvando...";
  try {
    const hoje = hojeISOLocal();
    // ações: atualiza as existentes, cria as novas e remove as que foram apagadas
    for (const a of itens) {
      const campos = { descricao: a.descricao, responsavel: a.responsavel, prazo: a.prazo, tema: a.tema };
      if (a.row.dataset.acaoId) {
        const { error } = await supabaseClient.from("acoes").update(campos).eq("id", a.row.dataset.acaoId);
        if (error) throw error;
      } else {
        const { data: nova, error } = await supabaseClient
          .from("acoes")
          .insert({ ...campos, ata_id: ataId, origem: ORIGEM, encaminhamento: null, status: a.prazo && a.prazo < hoje ? "Atrasada" : "Em andamento" })
          .select("id")
          .single();
        if (error) throw error;
        a.row.dataset.acaoId = nova.id;
      }
    }
    const mantidas = itens.map((a) => a.row.dataset.acaoId);
    const removidas = (rascunho.acoesOriginais || []).filter((id) => !mantidas.includes(id));
    if (removidas.length) {
      const { error } = await supabaseClient.from("acoes").delete().in("id", removidas);
      if (error) throw error;
    }
    // itens dos líderes: marcados ficam vinculados a esta ATA; desmarcados voltam a ficar pendentes
    const marcados = [...document.querySelectorAll("#ordem-dia .chk-item-lider")];
    const sim = marcados.filter((c) => c.checked).map((c) => c.dataset.id);
    const nao = marcados.filter((c) => !c.checked).map((c) => c.dataset.id);
    if (sim.length) {
      const { error } = await supabaseClient.from("acoes").update({ ata_geral_id: ataId }).in("id", sim);
      if (error) throw error;
    }
    if (nao.length) {
      const { error } = await supabaseClient.from("acoes").update({ ata_geral_id: null }).in("id", nao).eq("ata_geral_id", ataId);
      if (error) throw error;
    }
    // presença
    const { data: linhas, error: ePres } = await supabaseClient.from("ata_assinaturas").select("id, brigadista_id, brigadista:brigadistas(data_entrada,data_saida)").eq("ata_id", ataId);
    if (ePres) throw ePres;
    // tira da lista quem já tinha saído da brigada na data da reunião
    const fora = (linhas || []).filter((l) => l.brigadista && !participavaEm(l.brigadista, data_reuniao)).map((l) => l.id);
    if (fora.length) {
      const { error } = await supabaseClient.from("ata_assinaturas").delete().in("id", fora);
      if (error) throw error;
    }
    for (const b of convidados()) {
      const e = presencaNova[b.id] || { presente: true, justificativa: "" };
      const valores = { presente: e.presente, justificativa: e.presente ? null : (e.justificativa || "").trim() || null };
      const linha = (linhas || []).find((l) => l.brigadista_id === b.id);
      const { error } = linha
        ? await supabaseClient.from("ata_assinaturas").update(valores).eq("id", linha.id)
        : await supabaseClient.from("ata_assinaturas").insert({ ata_id: ataId, brigadista_id: b.id, assinado: false, ...valores });
      if (error) throw error;
    }
    const { error: eAta } = await supabaseClient.from("atas").update({ data_reuniao, conteudo, registro: registroAtual() }).eq("id", ataId);
    if (eAta) throw eAta;

    showToast("Alterações da ATA salvas!", "success");
    limparModoReuniao();
    carregarBrigadistas();
    carregarItensLideres();
    document.querySelector('.tab-btn[data-tab="historico"]').click();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar alterações: " + err.message, "error");
  } finally {
    btn.disabled = false;
    if (rascunho && rascunho.editId) btn.textContent = "💾 Salvar alterações";
  }
}
