// =========================================================================
// BRIGADA BOXER - Colaboradores (lista fixa, ativo/inativo) e Brigadistas
// =========================================================================

const CARGOS = ["Coordenador", "Líder de Área", "Integrante"];
// Sugestões de função (o campo aceita texto livre)
const FUNCOES = [
  "Coordenador da Brigada",
  "Líder de Abandono Geral",
  "Líder de Evacuação",
  "Líder de Andar / Socorrista",
  "Líder / Combatente",
  "Socorrista",
  "Combatente",
  "Socorrista e Combatente",
];

// Cargo no organograma a partir da função, quando não informado
function cargoPelaFuncao(funcao) {
  const f = normalizarNome(funcao);
  if (!f) return "";
  if (f.includes("COORDENADOR")) return "Coordenador";
  if (f.includes("LIDER")) return "Líder de Área";
  return "Integrante";
}

function capitalizarFuncao(funcao) {
  const conhecida = FUNCOES.find((x) => normalizarNome(x) === normalizarNome(funcao));
  if (conhecida) return conhecida;
  return String(funcao)
    .toLowerCase()
    .replace(/(^|[\s\/(])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase())
    .trim();
}
const FOTO_PADRAO = "https://placehold.co/96x96?text=Foto";

let colaboradores = [];
let fotoArquivoSelecionado = null;
let importacaoPendente = null;
let fotosPendentes = [];

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  setupTabs();
  setupModal();
  setupFiltros();
  setupImportacaoPlanilha();
  setupImportacaoFotos();

  document.getElementById("btn-print-quadro").addEventListener("click", () => window.print());
  document.getElementById("btn-export-pdf").addEventListener("click", exportarListaPDF);

  carregarColaboradores();
});

// ---------------- Tabs ----------------
function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((sec) => (sec.style.display = "none"));
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
    });
  });
}

// ---------------- Carregamento ----------------
async function carregarColaboradores() {
  if (!CONFIGURADO) return;
  try {
    const { data, error } = await supabaseClient.from("brigadistas").select("*").order("nome");
    if (error) throw error;
    colaboradores = data || [];
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar colaboradores: " + err.message, "error");
    colaboradores = [];
  }
  atualizarDatalists();
  renderIndicadores();
  renderOrgChart();
  renderTabela();
}

function brigadistasAtivos() {
  return colaboradores.filter((c) => c.ativo && c.e_brigadista);
}

function valoresUnicos(campo) {
  return [...new Set(colaboradores.map((c) => (c[campo] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function atualizarDatalists() {
  const preencher = (id, valores) => {
    document.getElementById(id).innerHTML = valores.map((v) => `<option value="${escHtml(v)}"></option>`).join("");
  };
  preencher("dl-vinculo", valoresUnicos("vinculo"));
  preencher("dl-local", valoresUnicos("piso"));
  preencher("dl-area", valoresUnicos("area"));
  preencher("dl-depto", valoresUnicos("departamento"));
  preencher("dl-funcao", [...new Set([...FUNCOES, ...valoresUnicos("funcao")])]);

  const sel = document.getElementById("filtro-local");
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todas</option>' + valoresUnicos("piso").map((v) => `<option>${escHtml(v)}</option>`).join("");
  sel.value = atual;
}

function renderIndicadores() {
  document.getElementById("ind-ativos").textContent = colaboradores.filter((c) => c.ativo).length;
  document.getElementById("ind-brigadistas").textContent = brigadistasAtivos().length;
  document.getElementById("ind-inativos").textContent = colaboradores.filter((c) => !c.ativo).length;
  document.getElementById("ind-sem-foto").textContent = colaboradores.filter((c) => c.ativo && !c.foto_url).length;
}

// ---------------- Quadro Hierárquico ----------------
function renderOrgChart() {
  const container = document.getElementById("orgchart-container");
  container.innerHTML = "";
  const lista = brigadistasAtivos();

  if (lista.length === 0) {
    container.innerHTML = '<div class="empty-state">Nenhum brigadista ativo. Marque os colaboradores da brigada na aba Colaboradores.</div>';
    return;
  }

  container.appendChild(criarLinhaOrg("Coordenação", lista.filter((b) => b.cargo === "Coordenador"), "coordenador"));
  container.appendChild(criarLinhaOrg("Líderes", lista.filter((b) => b.cargo === "Líder de Área"), "lider"));
  container.appendChild(criarLinhaOrg("Socorristas e Combatentes", lista.filter((b) => b.cargo === "Integrante"), "integrante"));
}

function criarLinhaOrg(titulo, pessoas, classe) {
  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  if (pessoas.length === 0) return wrapper;
  wrapper.innerHTML = `<div class="org-row-label">${titulo}</div>`;
  const row = document.createElement("div");
  row.className = "org-row";
  pessoas.forEach((p) => {
    const card = document.createElement("div");
    card.className = "org-card " + classe;
    card.innerHTML = `
      <img class="avatar" src="${escHtml(p.foto_url || FOTO_PADRAO)}" />
      <div class="nome">${escHtml(p.nome)}</div>
      <div class="info"><b>${escHtml(p.funcao)}</b></div>
      <div class="info">${escHtml([p.piso, p.tipo_brigada].filter(Boolean).join(" · "))}</div>
      ${p.observacao ? `<div class="info small">${escHtml(p.observacao)}</div>` : ""}
    `;
    row.appendChild(card);
  });
  wrapper.appendChild(row);
  return wrapper;
}

// ---------------- Lista de colaboradores ----------------
function setupFiltros() {
  ["filtro-busca", "filtro-situacao", "filtro-brigada", "filtro-local"].forEach((id) => {
    document.getElementById(id).addEventListener(id === "filtro-busca" ? "input" : "change", renderTabela);
  });
}

function listaFiltrada() {
  const busca = normalizarNome(document.getElementById("filtro-busca").value);
  const situacao = document.getElementById("filtro-situacao").value;
  const brigada = document.getElementById("filtro-brigada").value;
  const local = document.getElementById("filtro-local").value;

  return colaboradores.filter((c) => {
    if (situacao === "ativos" && !c.ativo) return false;
    if (situacao === "inativos" && c.ativo) return false;
    if (brigada === "sim" && !c.e_brigadista) return false;
    if (brigada === "nao" && c.e_brigadista) return false;
    if (local && (c.piso || "") !== local) return false;
    if (busca) {
      const alvo = normalizarNome([c.nome, c.area, c.departamento, c.vinculo, c.funcao, c.observacao].join(" "));
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

function renderTabela() {
  const lista = listaFiltrada();
  const tbody = document.getElementById("tabela-colab-body");
  tbody.innerHTML = "";
  document.getElementById("colab-empty").style.display = lista.length ? "none" : "block";
  document.getElementById("colab-contagem").textContent = `${lista.length} de ${colaboradores.length} colaborador(es)`;

  lista.forEach((c) => {
    const tr = document.createElement("tr");
    if (!c.ativo) tr.className = "linha-inativa";
    const brigada = c.e_brigadista
      ? `<span class="badge badge-brigada">${escHtml(c.funcao)}</span><div class="small text-muted">${escHtml(
          [c.tipo_brigada, c.carga_horaria ? c.carga_horaria + "h" : "", c.observacao].filter(Boolean).join(" · ")
        )}</div>`
      : '<span class="text-muted small">—</span>';
    tr.innerHTML = `
      <td><img class="avatar avatar-sm" src="${escHtml(c.foto_url || FOTO_PADRAO)}" /></td>
      <td><b>${escHtml(c.nome)}</b></td>
      <td>${escHtml(c.vinculo || "-")}</td>
      <td>${escHtml(c.area || "-")}<div class="small text-muted">${escHtml(c.departamento || "")}</div></td>
      <td>${escHtml(c.piso || "-")}</td>
      <td>${brigada}</td>
      <td><button class="btn-situacao ${c.ativo ? "ativo" : "inativo"}" data-id="${c.id}" title="Clique para alterar">${c.ativo ? "Ativo" : "Inativo"}</button></td>
      <td><button class="btn btn-secondary btn-editar" data-id="${c.id}" title="Editar">✏️</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-editar").forEach((b) => b.addEventListener("click", () => abrirModal(b.dataset.id)));
  tbody.querySelectorAll(".btn-situacao").forEach((b) => b.addEventListener("click", () => alternarSituacao(b.dataset.id)));
}

async function alternarSituacao(id) {
  const c = colaboradores.find((x) => x.id === id);
  if (!c) return;
  const novo = !c.ativo;
  if (!novo && c.e_brigadista && !confirm(`${c.nome} é brigadista. Ao inativar, deixa de aparecer no quadro, nas assinaturas e nas inspeções. Continuar?`)) return;
  try {
    const { error } = await supabaseClient.from("brigadistas").update({ ativo: novo, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    c.ativo = novo;
    showToast(`${c.nome}: ${novo ? "ativo" : "inativo"}.`, "success");
    renderIndicadores();
    renderOrgChart();
    renderTabela();
  } catch (err) {
    showToast("Erro ao alterar situação: " + err.message, "error");
  }
}

// ---------------- Modal (novo / editar) ----------------
function setupModal() {
  document.getElementById("btn-novo").addEventListener("click", () => abrirModal(null));
  document.getElementById("modal-fechar").addEventListener("click", fecharModal);
  document.getElementById("btn-cancelar").addEventListener("click", fecharModal);
  document.getElementById("modal-colab").addEventListener("click", (e) => {
    if (e.target.id === "modal-colab") fecharModal();
  });
  document.getElementById("campo-brigadista").addEventListener("change", atualizarCamposBrigada);
  document.getElementById("foto-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fotoArquivoSelecionado = file;
    document.getElementById("foto-preview").src = URL.createObjectURL(file);
  });
  document.getElementById("form-colab").addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvarColaborador();
  });
}

function atualizarCamposBrigada() {
  const on = document.getElementById("campo-brigadista").checked;
  document.getElementById("campos-brigada").style.display = on ? "grid" : "none";
}

function abrirModal(id) {
  const c = id ? colaboradores.find((x) => x.id === id) : null;
  document.getElementById("form-colab").reset();
  fotoArquivoSelecionado = null;
  document.getElementById("modal-titulo").textContent = c ? "Editar colaborador" : "Novo colaborador";
  document.getElementById("colab-id").value = c ? c.id : "";
  document.getElementById("campo-nome").value = c ? c.nome : "";
  document.getElementById("campo-vinculo").value = c ? c.vinculo || "" : "";
  document.getElementById("campo-local").value = c ? c.piso || "" : "";
  document.getElementById("campo-area").value = c ? c.area || "" : "";
  document.getElementById("campo-depto").value = c ? c.departamento || "" : "";
  document.getElementById("campo-ativo").checked = c ? c.ativo : true;
  document.getElementById("campo-brigadista").checked = c ? c.e_brigadista : false;
  document.getElementById("campo-cargo").value = c ? c.cargo || "" : "";
  document.getElementById("campo-funcao").value = c ? c.funcao || "" : "";
  document.getElementById("campo-tipo").value = c ? c.tipo_brigada || "" : "";
  document.getElementById("campo-ch").value = c && c.carga_horaria ? c.carga_horaria : "";
  document.getElementById("campo-obs").value = c ? c.observacao || "" : "";
  document.getElementById("foto-preview").src = (c && c.foto_url) || FOTO_PADRAO;
  atualizarCamposBrigada();
  document.getElementById("modal-colab").style.display = "flex";
}

function fecharModal() {
  document.getElementById("modal-colab").style.display = "none";
}

async function salvarColaborador() {
  if (!CONFIGURADO) return;
  const id = document.getElementById("colab-id").value;
  const nome = document.getElementById("campo-nome").value.replace(/\s+/g, " ").trim();
  const eBrig = document.getElementById("campo-brigadista").checked;
  const cargo = document.getElementById("campo-cargo").value;
  const funcao = document.getElementById("campo-funcao").value.replace(/\s+/g, " ").trim();

  if (!nome) return showToast("Informe o nome.", "error");
  if (eBrig && (!cargo || !funcao)) return showToast("Para brigadista, escolha o cargo e a função.", "error");

  const duplicado = colaboradores.find((c) => c.id !== id && normalizarNome(c.nome) === normalizarNome(nome));
  if (duplicado) return showToast("Já existe um colaborador com esse nome.", "error");

  const payload = {
    nome,
    vinculo: document.getElementById("campo-vinculo").value.trim() || null,
    piso: document.getElementById("campo-local").value.trim().toUpperCase() || null,
    area: document.getElementById("campo-area").value.trim() || null,
    departamento: document.getElementById("campo-depto").value.trim() || null,
    ativo: document.getElementById("campo-ativo").checked,
    e_brigadista: eBrig,
    cargo: eBrig ? cargo : null,
    funcao: eBrig ? funcao : null,
    tipo_brigada: eBrig ? document.getElementById("campo-tipo").value || null : null,
    carga_horaria: eBrig ? parseInt(document.getElementById("campo-ch").value, 10) || null : null,
    observacao: eBrig ? document.getElementById("campo-obs").value.trim() || null : null,
    updated_at: new Date().toISOString(),
  };

  const btn = document.querySelector("#form-colab button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Salvando...";
  try {
    if (fotoArquivoSelecionado) {
      const reduzida = await reduzirImagem(fotoArquivoSelecionado);
      payload.foto_url = await uploadArquivo(BUCKET_FOTOS, reduzida, "colaboradores/");
    }
    const q = id
      ? supabaseClient.from("brigadistas").update(payload).eq("id", id)
      : supabaseClient.from("brigadistas").insert(payload);
    const { error } = await q;
    if (error) throw error;
    showToast("Salvo com sucesso!", "success");
    fecharModal();
    await carregarColaboradores();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Salvar";
  }
}

// ---------------- Importação de planilha ----------------
const MAPA_COLUNAS = {
  NOME: "nome",
  "NOME COMPLETO": "nome",
  COLABORADOR: "nome",
  VINCULO: "vinculo",
  AREA: "area",
  DEPARTAMENTO: "departamento",
  SETOR: "departamento",
  LOCALIZACAO: "piso",
  LOCAL: "piso",
  PISO: "piso",
  ANDAR: "piso",
  CARGO: "cargo",
  "CARGO NA BRIGADA": "cargo",
  "CARGO BRIGADA": "cargo",
  FUNCAO: "funcao",
  "FUNCAO NA BRIGADA": "funcao",
  "FUNCAO BRIGADA": "funcao",
  TIPO: "tipo",
  "TIPO BRIGADA": "tipo",
  CH: "ch",
  "CARGA HORARIA": "ch",
  OBSERVACAO: "observacao",
  OBSERVACOES: "observacao",
  OBS: "observacao",
  CPF: "cpf",
  SITUACAO: "situacao",
  STATUS: "situacao",
  ATIVO: "situacao",
};

function setupImportacaoPlanilha() {
  document.getElementById("btn-modelo").addEventListener("click", baixarModelo);
  document.getElementById("input-planilha").addEventListener("change", lerPlanilha);
  document.getElementById("chk-inativar-ausentes").addEventListener("change", () => {
    if (importacaoPendente) prepararImportacao(importacaoPendente.linhas);
  });
  document.getElementById("btn-importar").addEventListener("click", executarImportacao);
}

function baixarModelo() {
  const linhas = [
    ["Nome", "Localização", "Tipo", "CH", "Função", "Observação", "Área", "Departamento", "Vínculo", "Situação"],
    ["MARIA DA SILVA", "1º ANDAR", "ADM", 8, "Socorrista", "", "Comercial", "Vendas", "CLT", "Ativo"],
    ["JOÃO SOUZA", "TÉRREO", "OPER", 24, "Líder de Evacuação", "Expedição e Almoxarifado", "Operações", "Logística", "CLT", "Ativo"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws["!cols"] = [{ wch: 38 }, { wch: 13 }, { wch: 7 }, { wch: 5 }, { wch: 28 }, { wch: 36 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 9 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Colaboradores");
  XLSX.writeFile(wb, "modelo-importacao-colaboradores.xlsx");
}

function casarOpcao(valor, opcoes) {
  const n = normalizarNome(valor);
  if (!n) return "";
  return opcoes.find((o) => normalizarNome(o) === n) || null;
}

async function lerPlanilha(e) {
  const file = e.target.files[0];
  importacaoPendente = null;
  document.getElementById("btn-importar").disabled = true;
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const brutas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    const idxCab = brutas.findIndex((l) => l.some((c) => MAPA_COLUNAS[normalizarNome(c)] === "nome"));
    if (idxCab < 0) throw new Error('Não encontrei a coluna "Nome" na planilha.');
    const cab = brutas[idxCab].map((c) => MAPA_COLUNAS[normalizarNome(c)] || null);
    const linhas = brutas
      .slice(idxCab + 1)
      .map((l) => {
        const o = {};
        cab.forEach((campo, i) => {
          if (campo && o[campo] === undefined) o[campo] = String(l[i] ?? "").replace(/\s+/g, " ").trim();
        });
        return o;
      })
      .filter((o) => o.nome);
    prepararImportacao(linhas);
  } catch (err) {
    console.error(err);
    document.getElementById("previa-importacao").innerHTML = `<div class="config-warning">❌ ${escHtml(err.message)}</div>`;
  }
}

function prepararImportacao(linhas) {
  const existentes = new Map(colaboradores.map((c) => [normalizarNome(c.nome), c]));
  const vistos = new Set();
  const novos = [];
  const atualizados = [];
  const avisos = [];
  let semMudanca = 0;

  linhas.forEach((l, i) => {
    const chave = normalizarNome(l.nome);
    if (vistos.has(chave)) {
      avisos.push(`Linha ${i + 2}: "${l.nome}" repetido na planilha (ignorado).`);
      return;
    }
    vistos.add(chave);

    const reg = {};
    if ("vinculo" in l) reg.vinculo = l.vinculo || null;
    if ("area" in l) reg.area = l.area || null;
    if ("departamento" in l) reg.departamento = l.departamento || null;
    if ("piso" in l) reg.piso = l.piso ? l.piso.toUpperCase() : null;

    if (l.situacao) {
      const s = normalizarNome(l.situacao);
      if (["ATIVO", "ATIVA", "SIM", "S", "1"].includes(s)) reg.ativo = true;
      else if (["INATIVO", "INATIVA", "NAO", "N", "0", "DESLIGADO", "DESLIGADA"].includes(s)) reg.ativo = false;
      else avisos.push(`"${l.nome}": situação "${l.situacao}" não reconhecida (mantida).`);
    }

    if (l.cargo || l.funcao) {
      const funcao = l.funcao ? capitalizarFuncao(l.funcao) : "";
      const cargo = l.cargo ? casarOpcao(l.cargo, CARGOS) : cargoPelaFuncao(funcao);
      if (cargo && funcao) {
        Object.assign(reg, { e_brigadista: true, cargo, funcao });
      } else {
        avisos.push(`"${l.nome}": cargo/função da brigada incompletos ou inválidos (não marcado como brigadista).`);
      }
    }
    if ("tipo" in l && l.tipo) {
      const t = normalizarNome(l.tipo);
      if (t.startsWith("ADM")) reg.tipo_brigada = "ADM";
      else if (t.startsWith("OPER")) reg.tipo_brigada = "OPER";
    }
    if ("ch" in l && l.ch) {
      const ch = parseInt(String(l.ch).replace(/\D/g, ""), 10);
      if (ch > 0) reg.carga_horaria = ch;
    }
    if ("observacao" in l) reg.observacao = l.observacao || null;

    const atual = existentes.get(chave);
    if (!atual) {
      novos.push({ nome: l.nome, ativo: true, ...reg });
    } else {
      const mudou = Object.keys(reg).some((k) => (atual[k] ?? null) !== (reg[k] ?? null));
      if (mudou) atualizados.push({ id: atual.id, nome: atual.nome, reg });
      else semMudanca++;
    }
  });

  const inativar = document.getElementById("chk-inativar-ausentes").checked
    ? colaboradores.filter((c) => c.ativo && !vistos.has(normalizarNome(c.nome)))
    : [];

  if (linhas.some((l) => l.cpf)) avisos.unshift("A coluna CPF foi ignorada: por segurança (LGPD), o CPF não é gravado pelo app, que não tem login.");
  importacaoPendente = { linhas, novos, atualizados, inativar };

  const listaNomes = (arr, max = 12) =>
    arr.length ? `<div class="small text-muted">${arr.slice(0, max).map((x) => escHtml(x.nome)).join(", ")}${arr.length > max ? ` e mais ${arr.length - max}` : ""}</div>` : "";

  document.getElementById("previa-importacao").innerHTML = `
    <div class="previa-grid">
      <div class="previa-item ok"><b>${novos.length}</b> novos${listaNomes(novos)}</div>
      <div class="previa-item warn"><b>${atualizados.length}</b> serão atualizados${listaNomes(atualizados)}</div>
      <div class="previa-item"><b>${semMudanca}</b> sem alteração</div>
      <div class="previa-item danger"><b>${inativar.length}</b> serão inativados${listaNomes(inativar)}</div>
    </div>
    ${avisos.length ? `<div class="config-warning mt-16"><b>Atenção:</b><br>${avisos.map(escHtml).join("<br>")}</div>` : ""}
    <p class="small text-muted">${linhas.length} linha(s) lida(s) da planilha.</p>
  `;
  document.getElementById("btn-importar").disabled = novos.length + atualizados.length + inativar.length === 0;
}

async function executarImportacao() {
  if (!importacaoPendente) return;
  const { novos, atualizados, inativar } = importacaoPendente;
  const btn = document.getElementById("btn-importar");
  btn.disabled = true;
  btn.textContent = "Importando...";
  const agora = new Date().toISOString();
  let erros = 0;
  try {
    for (let i = 0; i < novos.length; i += 200) {
      const { error } = await supabaseClient.from("brigadistas").insert(novos.slice(i, i + 200).map((n) => ({ ...n, updated_at: agora })));
      if (error) throw error;
    }
    const tarefas = [
      ...atualizados.map((u) => () => supabaseClient.from("brigadistas").update({ ...u.reg, updated_at: agora }).eq("id", u.id)),
      ...inativar.map((c) => () => supabaseClient.from("brigadistas").update({ ativo: false, updated_at: agora }).eq("id", c.id)),
    ];
    for (let i = 0; i < tarefas.length; i += 8) {
      const res = await Promise.all(tarefas.slice(i, i + 8).map((t) => t()));
      erros += res.filter((r) => r.error).length;
    }
    showToast(
      `Importação concluída: ${novos.length} novos, ${atualizados.length} atualizados, ${inativar.length} inativados.` + (erros ? ` (${erros} erro(s))` : ""),
      erros ? "error" : "success"
    );
    importacaoPendente = null;
    document.getElementById("input-planilha").value = "";
    document.getElementById("previa-importacao").innerHTML = "";
    await carregarColaboradores();
    document.querySelector('.tab-btn[data-tab="colaboradores"]').click();
  } catch (err) {
    console.error(err);
    showToast("Erro na importação: " + err.message, "error");
  } finally {
    btn.textContent = "📥 Importar";
    btn.disabled = !importacaoPendente;
  }
}

// ---------------- Importação de fotos ----------------
function setupImportacaoFotos() {
  document.getElementById("input-fotos").addEventListener("change", prepararFotos);
  document.getElementById("chk-substituir-fotos").addEventListener("change", () => renderPreviaFotos());
  document.getElementById("btn-enviar-fotos").addEventListener("click", enviarFotos);
}

function encontrarColaboradorPorArquivo(nomeArquivo) {
  const base = normalizarNome(nomeArquivo.replace(/\.[^.]+$/, "").replace(/[-]+/g, " "));
  const exato = colaboradores.filter((c) => normalizarNome(c.nome) === base);
  if (exato.length === 1) return { colab: exato[0] };
  // Aproximação: todas as palavras do arquivo aparecem no nome (ex.: "PEDRO PAULO", "JÉSSICA RAMOS")
  const palavras = base.split(" ").filter(Boolean);
  let candidatos = colaboradores.filter((c) => {
    const doNome = normalizarNome(c.nome).split(" ");
    return palavras.every((p) => doNome.includes(p));
  });
  if (candidatos.length > 1) {
    const ativos = candidatos.filter((c) => c.ativo);
    if (ativos.length) candidatos = ativos;
  }
  if (candidatos.length === 1) return { colab: candidatos[0] };
  return { colab: null, ambiguos: candidatos.map((c) => c.nome) };
}

function prepararFotos(e) {
  fotosPendentes = [...e.target.files].map((file) => {
    const r = encontrarColaboradorPorArquivo(file.name);
    const legivel = /^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name);
    return { file, colab: legivel ? r.colab : null, ambiguos: r.ambiguos || [], formatoInvalido: !legivel, status: "" };
  });
  renderPreviaFotos();
}

function renderPreviaFotos() {
  const substituir = document.getElementById("chk-substituir-fotos").checked;
  const casadas = fotosPendentes.filter((f) => f.colab && (substituir || !f.colab.foto_url));
  const semPar = fotosPendentes.filter((f) => !f.colab);
  const div = document.getElementById("previa-fotos");
  if (!fotosPendentes.length) {
    div.innerHTML = "";
    document.getElementById("btn-enviar-fotos").disabled = true;
    return;
  }
  div.innerHTML = `
    <div class="previa-grid">
      <div class="previa-item ok"><b>${casadas.length}</b> foto(s) serão enviadas</div>
      <div class="previa-item danger"><b>${semPar.length}</b> sem colaborador correspondente</div>
    </div>
    <div class="table-wrap mt-16"><table>
      <thead><tr><th>Arquivo</th><th>Colaborador</th><th></th></tr></thead>
      <tbody>${fotosPendentes
        .map((f) => {
          const pulada = f.colab && f.colab.foto_url && !substituir;
          return `<tr>
            <td class="small">${escHtml(f.file.name)}</td>
            <td>${
              f.colab
                ? escHtml(f.colab.nome)
                : f.formatoInvalido
                ? '<span class="badge badge-danger">Formato não suportado (use JPG/PNG)</span>'
                : f.ambiguos.length
                ? `<span class="badge badge-warn">Mais de um possível</span> <span class="small text-muted">${escHtml(f.ambiguos.join(", "))} — renomeie com o nome completo</span>`
                : '<span class="badge badge-danger">Não encontrado</span>'
            }</td>
            <td class="small">${f.status || (pulada ? '<span class="badge badge-muted">Já tem foto</span>' : "")}</td>
          </tr>`;
        })
        .join("")}</tbody>
    </table></div>
  `;
  document.getElementById("btn-enviar-fotos").disabled = casadas.length === 0;
}

async function enviarFotos() {
  const substituir = document.getElementById("chk-substituir-fotos").checked;
  const fila = fotosPendentes.filter((f) => f.colab && (substituir || !f.colab.foto_url));
  const btn = document.getElementById("btn-enviar-fotos");
  const prog = document.getElementById("progresso-fotos");
  btn.disabled = true;
  let ok = 0;
  let falhas = 0;
  for (let i = 0; i < fila.length; i++) {
    const f = fila[i];
    prog.textContent = `Enviando ${i + 1} de ${fila.length}...`;
    try {
      const reduzida = await reduzirImagem(f.file);
      const url = await uploadArquivo(BUCKET_FOTOS, reduzida, "colaboradores/");
      const { error } = await supabaseClient.from("brigadistas").update({ foto_url: url, updated_at: new Date().toISOString() }).eq("id", f.colab.id);
      if (error) throw error;
      f.colab.foto_url = url;
      f.status = '<span class="badge badge-ok">Enviada</span>';
      ok++;
    } catch (err) {
      console.error(err);
      f.status = '<span class="badge badge-danger">Erro</span>';
      falhas++;
    }
  }
  prog.textContent = "";
  renderPreviaFotos();
  showToast(`${ok} foto(s) enviada(s)` + (falhas ? `, ${falhas} com erro.` : "."), falhas ? "error" : "success");
  await carregarColaboradores();
}

// Reduz a foto para no máximo 600px (JPEG) antes de enviar
async function reduzirImagem(file, max = 600) {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (e) {
    return file;
  }
}

// ---------------- PDF ----------------
async function exportarListaPDF() {
  const lista = brigadistasAtivos();
  if (lista.length === 0) return showToast("Não há brigadistas ativos para exportar.", "error");
  const ordemCargo = { Coordenador: 0, "Líder de Área": 1, Integrante: 2 };
  lista.sort((a, b) => (ordemCargo[a.cargo] ?? 9) - (ordemCargo[b.cargo] ?? 9) || a.nome.localeCompare(b.nome));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const y = await cabecalhoPdf(doc, "Integrantes da Brigada de Incêndio", [`${lista.length} brigadista(s) ativo(s)`]);
  doc.autoTable({
    startY: y,
    head: [["Nome", "Função", "Localização", "Tipo", "CH", "Observação"]],
    body: lista.map((b) => [b.nome, b.funcao, b.piso || "-", b.tipo_brigada || "-", b.carga_horaria ? b.carga_horaria + "h" : "-", b.observacao || ""]),
    styles: { fontSize: 8 },
    headStyles: CORES_TABELA_PDF,
    margin: { left: 14, right: 14, bottom: 16 },
  });
  rodapePdf(doc);
  doc.save("brigada-boxer-integrantes.pdf");
}
