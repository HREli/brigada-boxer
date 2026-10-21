// =========================================================================
// BRIGADA BOXER - Certificados de formação e Atestado da Brigada
// =========================================================================

let documentos = [];
let brigadistas = [];
const DIAS_ALERTA_DOC = 60;

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  setupTabsDoc();
  ["filtro-tipo", "filtro-validade"].forEach((id) => document.getElementById(id).addEventListener("change", renderArquivo));
  document.getElementById("filtro-busca").addEventListener("input", renderArquivo);
  document.getElementById("doc-tipo").addEventListener("change", ajustarFormulario);
  document.getElementById("doc-emissao").addEventListener("change", sugerirValidade);
  document.getElementById("btn-salvar-doc").addEventListener("click", salvarDocumento);
  document.getElementById("doc-titulo").addEventListener("input", (e) => (e.target.dataset.auto = "0"));
  ajustarFormulario();
  iniciarImportacaoLote();
  carregar();
});

function setupTabsDoc() {
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((s) => (s.style.display = "none"));
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
    });
  });
}

function ajustarFormulario() {
  const tipo = document.getElementById("doc-tipo").value;
  document.getElementById("campo-brigadista-wrap").style.display = tipo === "Certificado de Formação" ? "block" : "none";
  const titulo = document.getElementById("doc-titulo");
  if (!titulo.value || titulo.dataset.auto === "1") {
    titulo.value = tipo === "Atestado da Brigada" ? "Atestado de Brigada de Incêndio" : "";
    titulo.dataset.auto = "1";
  }
}

function sugerirValidade() {
  const emissao = document.getElementById("doc-emissao").value;
  const val = document.getElementById("doc-validade");
  if (!emissao || val.value) return;
  const d = new Date(emissao + "T00:00:00");
  d.setFullYear(d.getFullYear() + 1);
  val.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function carregar() {
  if (!CONFIGURADO) return;
  try {
    const [d, b] = await Promise.all([
      supabaseClient.from("documentos").select("*").order("data_emissao", { ascending: false, nullsFirst: false }),
      supabaseClient.from("brigadistas").select("id,nome,cargo,funcao,ativo,e_brigadista,classificacao,carga_horaria").order("nome"),
    ]);
    if (d.error) throw d.error;
    if (b.error) throw b.error;
    documentos = d.data || [];
    brigadistas = b.data || [];
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar documentos: " + err.message, "error");
  }
  const sel = document.getElementById("doc-brigadista");
  sel.innerHTML =
    '<option value="">Certificado da turma (todos)</option>' +
    brigadistas
      .filter((x) => x.ativo && x.e_brigadista)
      .map((x) => `<option value="${x.id}">${escHtml(x.nome)}</option>`)
      .join("");
  renderIndicadores();
  renderArquivo();
  renderSituacao();
}

function situacaoValidade(dataValidade) {
  if (!dataValidade) return { chave: "vigente", html: '<span class="badge badge-muted">Sem validade</span>' };
  const dias = diasAte(dataValidade);
  if (dias < 0) return { chave: "vencido", html: `<span class="badge badge-danger">Vencido há ${Math.abs(dias)} dia(s)</span>` };
  if (dias <= DIAS_ALERTA_DOC) return { chave: "vencendo", html: `<span class="badge badge-warn">Vence em ${dias} dia(s)</span>` };
  return { chave: "vigente", html: '<span class="badge badge-ok">Vigente</span>' };
}

function nomeBrigadista(id) {
  const b = brigadistas.find((x) => x.id === id);
  return b ? b.nome : "";
}

function renderIndicadores() {
  document.getElementById("ind-docs").textContent = documentos.length;
  const atestado = documentos
    .filter((d) => d.tipo === "Atestado da Brigada")
    .sort((a, b) => (b.data_validade || "").localeCompare(a.data_validade || ""))[0];
  const ind = document.getElementById("ind-atestado");
  if (!atestado) {
    ind.textContent = "Não enviado";
    ind.style.color = "var(--danger)";
    ind.style.fontSize = "1.2rem";
  } else {
    const s = situacaoValidade(atestado.data_validade);
    ind.textContent = atestado.data_validade ? formatarDataBR(atestado.data_validade) : "Arquivado";
    ind.style.fontSize = "1.4rem";
    ind.style.color = s.chave === "vencido" ? "var(--danger)" : s.chave === "vencendo" ? "var(--warn)" : "var(--ok)";
  }
  document.getElementById("ind-vencendo").textContent = documentos.filter((d) => situacaoValidade(d.data_validade).chave === "vencendo").length;
  document.getElementById("ind-sem-cert").textContent = calcularSituacaoBrigadistas().filter((s) => !s.valido).length;
}

function renderArquivo() {
  const tipo = document.getElementById("filtro-tipo").value;
  const validade = document.getElementById("filtro-validade").value;
  const busca = normalizarNome(document.getElementById("filtro-busca").value);
  const lista = documentos.filter((d) => {
    if (tipo && d.tipo !== tipo) return false;
    if (validade && situacaoValidade(d.data_validade).chave !== validade) return false;
    if (busca && !normalizarNome(d.titulo + " " + nomeBrigadista(d.brigadista_id)).includes(busca)) return false;
    return true;
  });
  const tbody = document.getElementById("tabela-docs");
  document.getElementById("docs-empty").style.display = lista.length ? "none" : "block";
  tbody.innerHTML = lista
    .map(
      (d) => `<tr>
      <td><span class="badge ${d.tipo === "Atestado da Brigada" ? "badge-brigada" : "badge-muted"}">${escHtml(d.tipo)}</span></td>
      <td><b>${escHtml(d.titulo)}</b>${d.observacoes ? `<div class="small text-muted">${escHtml(d.observacoes)}</div>` : ""}</td>
      <td>${d.tipo === "Certificado de Formação" ? escHtml(nomeBrigadista(d.brigadista_id) || "Turma") : "-"}</td>
      <td>${formatarDataBR(d.data_emissao)}</td>
      <td>${formatarDataBR(d.data_validade)}</td>
      <td>${situacaoValidade(d.data_validade).html}</td>
      <td class="row" style="flex-wrap:nowrap;">
        <a class="btn btn-secondary" href="#" data-arquivo="${escHtml(d.arquivo_url)}" title="${ehPrivado(d.arquivo_url) ? "Abrir (só líderes — contém dados pessoais)" : "Abrir"}">${ehPrivado(d.arquivo_url) ? "🔒👁️" : "👁️"}</a>
        <button class="btn btn-secondary btn-excluir-doc" data-id="${d.id}" title="Excluir">🗑️</button>
      </td>
    </tr>`
    )
    .join("");
  tbody.querySelectorAll(".btn-excluir-doc").forEach((b) => b.addEventListener("click", () => excluirDocumento(b.dataset.id)));
}

function calcularSituacaoBrigadistas() {
  const certs = documentos.filter((d) => d.tipo === "Certificado de Formação");
  const turmaVigente = certs
    .filter((d) => !d.brigadista_id && (!d.data_validade || diasAte(d.data_validade) >= 0))
    .sort((a, b) => (b.data_validade || "").localeCompare(a.data_validade || ""))[0];
  return brigadistas
    .filter((b) => b.ativo && b.e_brigadista)
    .map((b) => {
      const doc = certs
        .filter((d) => d.brigadista_id === b.id)
        .sort((x, y) => (y.data_validade || "9999").localeCompare(x.data_validade || "9999"))[0];
      const valido = doc ? !doc.data_validade || diasAte(doc.data_validade) >= 0 : false;
      return { b, doc, valido, turmaVigente };
    });
}

function renderSituacao() {
  const lista = calcularSituacaoBrigadistas();
  document.getElementById("situacao-empty").style.display = lista.length ? "none" : "block";
  document.getElementById("tabela-situacao").innerHTML = lista
    .map(({ b, doc, turmaVigente }) => {
      let situacao;
      if (doc) situacao = situacaoValidade(doc.data_validade).html;
      else if (turmaVigente) situacao = '<span class="badge badge-warn">Só certificado da turma</span>';
      else situacao = '<span class="badge badge-danger">Sem certificado</span>';
      return `<tr>
        <td><b>${escHtml(b.nome)}</b></td>
        <td>${escHtml(b.funcao || b.cargo || "-")}</td>
        <td>${doc ? `<a href="#" data-arquivo="${escHtml(doc.arquivo_url)}">${escHtml(doc.titulo)}</a>` : turmaVigente ? `<a href="#" data-arquivo="${escHtml(turmaVigente.arquivo_url)}">${escHtml(turmaVigente.titulo)} (turma)</a>` : "-"}</td>
        <td>${formatarDataBR(doc ? doc.data_validade : turmaVigente ? turmaVigente.data_validade : null)}</td>
        <td>${situacao}</td>
      </tr>`;
    })
    .join("");
}

async function salvarDocumento() {
  if (!CONFIGURADO) return;
  const tipo = document.getElementById("doc-tipo").value;
  const titulo = document.getElementById("doc-titulo").value.trim();
  const file = document.getElementById("doc-arquivo").files[0];
  const data_emissao = document.getElementById("doc-emissao").value || null;
  const data_validade = document.getElementById("doc-validade").value || null;
  if (!titulo || !file) return showToast("Informe o título e escolha o arquivo.", "error");
  if (data_emissao && data_validade && data_validade < data_emissao) return showToast("A validade não pode ser antes da emissão.", "error");

  const btn = document.getElementById("btn-salvar-doc");
  btn.disabled = true;
  btn.textContent = "Enviando...";
  try {
    const pasta = tipo === "Atestado da Brigada" ? "atestados/" : tipo === "Certificado de Formação" ? "certificados/" : "outros/";
    // certificados têm CPF: vão para o bucket privado
    const arquivo_url = tipo === "Certificado de Formação" ? await uploadPrivado(file, pasta) : await uploadArquivo(BUCKET_DOCUMENTOS, file, pasta);
    const { error } = await supabaseClient.from("documentos").insert({
      tipo,
      titulo,
      brigadista_id: tipo === "Certificado de Formação" ? document.getElementById("doc-brigadista").value || null : null,
      data_emissao,
      data_validade,
      arquivo_url,
      arquivo_nome: file.name,
      observacoes: document.getElementById("doc-obs").value.trim() || null,
    });
    if (error) throw error;
    showToast("Documento arquivado!", "success");
    ["doc-titulo", "doc-emissao", "doc-validade", "doc-arquivo", "doc-obs"].forEach((id) => (document.getElementById(id).value = ""));
    document.getElementById("doc-titulo").dataset.auto = "1";
    ajustarFormulario();
    await carregar();
    document.querySelector('.tab-btn[data-tab="arquivo"]').click();
  } catch (err) {
    console.error(err);
    showToast("Erro ao arquivar: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "💾 Arquivar";
  }
}

async function excluirDocumento(id) {
  if (!confirm("Excluir este documento do arquivo?")) return;
  const { error } = await supabaseClient.from("documentos").delete().eq("id", id);
  if (error) return showToast("Erro ao excluir: " + error.message, "error");
  showToast("Documento excluído.", "success");
  carregar();
}


// =========================================================================
// Importação de certificados em lote: o nome do arquivo indica o brigadista
// =========================================================================
let lote = []; // { file, brigadistaId, status, motivo }
const PALAVRAS_IGNORADAS = new Set(["CERTIFICADO", "CERTIFICADOS", "BRIGADA", "DE", "DA", "DO", "DAS", "DOS", "E", "INCENDIO", "ASSINADO", "ASSINADA", "TEKWELD", "INTERMEDIARIO", "AVANCADO", "BASICO", "NIVEL", "PDF", "JPG", "JPEG", "PNG", "FORMACAO", "TURMA"]);

function iniciarImportacaoLote() {
  const input = document.getElementById("lote-arquivos");
  if (!input) return;
  input.addEventListener("change", () => {
    lote = [...input.files].map((file) => ({ file, brigadistaId: casarBrigadista(file.name) }));
    marcarDuplicados();
    renderLote();
  });
  document.getElementById("lote-emissao").addEventListener("change", () => {
    const e = document.getElementById("lote-emissao").value;
    if (!e) return;
    const d = new Date(e + "T00:00:00");
    d.setFullYear(d.getFullYear() + 1);
    document.getElementById("lote-validade").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    renderLote();
  });
  document.getElementById("btn-importar-lote").addEventListener("click", importarLote);
}

function tokensDe(texto) {
  return normalizarNome(texto.replace(/\.[a-z0-9]+$/i, "").replace(/[-–()]/g, " "))
    .split(" ")
    .filter((t) => t && !PALAVRAS_IGNORADAS.has(t) && !/^\d+$/.test(t));
}
function distancia(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function parecido(t, n) {
  if (t === n) return true;
  if (t.length === 1) return n[0] === t; // abreviação: "L." = LUZ
  return t.length >= 4 && n.length >= 4 && distancia(t, n) <= 1; // TREVISAN x TREVIZAN, NICOLAS x NICOLLAS
}
function casarBrigadista(nomeArquivo) {
  const toks = tokensDe(nomeArquivo);
  if (toks.length < 2) return null;
  let melhor = null, melhorPts = 0, empate = false;
  brigadistas
    .filter((b) => b.ativo && b.e_brigadista)
    .forEach((b) => {
      const nb = normalizarNome(b.nome).split(" ").filter((t) => !PALAVRAS_IGNORADAS.has(t));
      if (!parecido(toks[0], nb[0])) return; // o primeiro nome precisa bater
      const pts = toks.filter((t) => nb.some((n) => parecido(t, n))).length;
      if (pts > melhorPts) (melhor = b), (melhorPts = pts), (empate = false);
      else if (pts === melhorPts) empate = true;
    });
  return melhor && melhorPts >= 2 && !empate ? melhor.id : null;
}
// Mesma pessoa com mais de um arquivo: fica a versão "assinado"
function marcarDuplicados() {
  const porPessoa = {};
  lote.forEach((l) => l.brigadistaId && (porPessoa[l.brigadistaId] = porPessoa[l.brigadistaId] || []).push(l));
  lote.forEach((l) => (l.ignorar = false));
  Object.values(porPessoa).forEach((arr) => {
    if (arr.length < 2) return;
    const assinado = arr.find((l) => /assinad/i.test(l.file.name)) || arr[0];
    arr.forEach((l) => l !== assinado && (l.ignorar = true));
  });
}
function jaArquivado(brigadistaId, emissao) {
  return documentos.some((d) => d.tipo === "Certificado de Formação" && d.brigadista_id === brigadistaId && (!emissao || d.data_emissao === emissao));
}
function renderLote() {
  const box = document.getElementById("lote-previa");
  const btn = document.getElementById("btn-importar-lote");
  if (!lote.length) {
    box.innerHTML = "";
    btn.disabled = true;
    return;
  }
  const emissao = document.getElementById("lote-emissao").value;
  const opcoes = (sel) =>
    '<option value="">— não importar —</option>' +
    brigadistas
      .filter((b) => b.ativo && b.e_brigadista)
      .map((b) => `<option value="${b.id}" ${b.id === sel ? "selected" : ""}>${escHtml(b.nome)}</option>`)
      .join("");
  let ok = 0;
  const linhas = lote.map((l, i) => {
    let st;
    if (!l.brigadistaId) st = '<span class="badge badge-danger">Escolha o brigadista</span>';
    else if (l.ignorar) st = '<span class="badge badge-muted">Ignorado (já há versão assinada)</span>';
    else if (jaArquivado(l.brigadistaId, emissao)) st = '<span class="badge badge-muted">Já arquivado</span>';
    else (st = '<span class="badge badge-ok">Pronto</span>'), ok++;
    const b = brigadistas.find((x) => x.id === l.brigadistaId);
    return `<tr><td class="small">${escHtml(l.file.name)}</td>
      <td><select class="sel-lote" data-i="${i}">${opcoes(l.brigadistaId)}</select></td>
      <td>${b && b.classificacao ? escHtml(b.classificacao) : "-"}</td><td>${st}</td></tr>`;
  });
  const pessoas = new Set(lote.filter((l) => l.brigadistaId).map((l) => l.brigadistaId));
  const semArquivo = brigadistas.filter((b) => b.ativo && b.e_brigadista && !pessoas.has(b.id)).map((b) => b.nome);
  box.innerHTML = `<p class="small"><b>${lote.length}</b> arquivo(s) · <b>${ok}</b> pronto(s) para importar.${
    semArquivo.length ? ` Brigadistas sem arquivo nesta seleção: ${semArquivo.length}.` : ""
  }</p>
  <div class="table-wrap"><table><thead><tr><th>Arquivo</th><th>Brigadista</th><th>Classificação</th><th>Situação</th></tr></thead><tbody>${linhas.join("")}</tbody></table></div>`;
  box.querySelectorAll(".sel-lote").forEach((s) =>
    s.addEventListener("change", () => {
      lote[+s.dataset.i].brigadistaId = s.value || null;
      marcarDuplicados();
      renderLote();
    })
  );
  btn.disabled = !ok || !emissao;
  btn.textContent = `📥 Importar ${ok} certificado(s)`;
}

async function importarLote() {
  const emissao = document.getElementById("lote-emissao").value;
  const validade = document.getElementById("lote-validade").value || null;
  if (!emissao) return showToast("Informe a data de emissão.", "error");
  const prontos = lote.filter((l) => l.brigadistaId && !l.ignorar && !jaArquivado(l.brigadistaId, emissao));
  const obs = document.getElementById("lote-obs").value.trim() || null;
  const btn = document.getElementById("btn-importar-lote");
  btn.disabled = true;
  let feitos = 0;
  const falhas = [];
  for (const l of prontos) {
    btn.textContent = `Enviando ${feitos + 1} de ${prontos.length}...`;
    try {
      const b = brigadistas.find((x) => x.id === l.brigadistaId);
      const nivel = b.classificacao ? ` — Nível ${b.classificacao}${b.carga_horaria ? ` (${b.carga_horaria}h)` : ""}` : "";
      const arquivo_url = await uploadPrivado(l.file, "certificados/");
      const { error } = await supabaseClient.from("documentos").insert({
        tipo: "Certificado de Formação",
        titulo: `Formação de Brigada de Incêndio ${emissao.slice(0, 4)}${nivel}`,
        brigadista_id: b.id,
        data_emissao: emissao,
        data_validade: validade,
        arquivo_url,
        arquivo_nome: l.file.name,
        observacoes: obs,
      });
      if (error) throw error;
      feitos++;
    } catch (err) {
      console.error(err);
      falhas.push(l.file.name);
    }
  }
  showToast(`${feitos} certificado(s) importado(s).` + (falhas.length ? ` Falharam: ${falhas.length}.` : ""), falhas.length ? "error" : "success");
  document.getElementById("lote-arquivos").value = "";
  lote = [];
  await carregar();
  renderLote();
  document.querySelector('.tab-btn[data-tab="situacao"]').click();
}
