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
      supabaseClient.from("brigadistas").select("id,nome,cargo,ativo,e_brigadista").order("nome"),
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
        <a class="btn btn-secondary" href="${escHtml(d.arquivo_url)}" target="_blank" title="Abrir">👁️</a>
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
        <td>${escHtml(b.cargo || "-")}</td>
        <td>${doc ? `<a href="${escHtml(doc.arquivo_url)}" target="_blank">${escHtml(doc.titulo)}</a>` : turmaVigente ? `<a href="${escHtml(turmaVigente.arquivo_url)}" target="_blank">${escHtml(turmaVigente.titulo)} (turma)</a>` : "-"}</td>
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
    const arquivo_url = await uploadArquivo(BUCKET_DOCUMENTOS, file, pasta);
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
