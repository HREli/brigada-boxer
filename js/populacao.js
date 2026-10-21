// =========================================================================
// BRIGADA BOXER - Pessoas no prédio (lista de colaboradores para evacuação)
// Cada importação grava uma "fotografia" nova; a tela usa sempre a mais recente.
// =========================================================================

let pessoas = [];
let importacoes = [];
let nomesBrigadistas = new Set();
let importPop = null;
let detalheAberto = null;

const ORDEM_ANDARES = ["TÉRREO", "1º ANDAR", "2º ANDAR"];

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  const buttons = document.querySelectorAll(".tab-btn");
  buttons.forEach((btn) =>
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((s) => (s.style.display = "none"));
      document.getElementById("tab-" + btn.dataset.tab).style.display = "block";
    })
  );
  document.querySelectorAll("#indicadores-pop .clicavel").forEach((c) =>
    c.addEventListener("click", () => {
      detalheAberto = detalheAberto === c.dataset.ind ? null : c.dataset.ind;
      renderDetalhe();
    })
  );
  document.getElementById("busca-pop").addEventListener("input", renderLista);
  document.getElementById("filtro-local-pop").addEventListener("change", renderLista);
  document.getElementById("input-pop").addEventListener("change", lerPlanilhaPop);
  document.getElementById("data-ref-pop").addEventListener("change", () => importPop && renderPrevia());
  document.getElementById("btn-importar-pop").addEventListener("click", importarPop);
  document.getElementById("btn-pdf-chamada").addEventListener("click", pdfChamada);
  carregar();
});

// "1º andar", "1o andar", "1 ANDAR" -> "1º ANDAR"; "Térreo" -> "TÉRREO"
function normalizarLocal(v) {
  const n = normalizarNome(v);
  if (!n) return "";
  if (n.startsWith("TERREO")) return "TÉRREO";
  const m = n.match(/^(\d+)\s*[ºO°]?\s*ANDAR/);
  if (m) return `${m[1]}º ANDAR`;
  if (n.includes("HOME")) return "HOME OFFICE";
  if (n.includes("EXTERNO")) return "EXTERNO";
  return String(v).trim().toUpperCase();
}
const foraDoPredio = (p) => ["EXTERNO", "HOME OFFICE"].includes(normalizarLocal(p.localizacao)) || !p.localizacao;
const eTerceiro = (p) => /CONTRATAD|TERCEIR|PRESTADOR/i.test(p.vinculo || "");
const eBrigadista = (p) => nomesBrigadistas.has(normalizarNome(p.nome));

async function carregar() {
  if (!CONFIGURADO) return;
  try {
    const [imp, brig] = await Promise.all([
      supabaseClient.from("populacao_importacoes").select("*").order("created_at", { ascending: false }).limit(20),
      supabaseClient.from("brigadistas").select("nome").eq("ativo", true).eq("e_brigadista", true),
    ]);
    if (imp.error) throw imp.error;
    importacoes = imp.data || [];
    nomesBrigadistas = new Set((brig.data || []).map((b) => normalizarNome(b.nome)));
    pessoas = [];
    if (importacoes.length) {
      const { data, error } = await supabaseClient.from("populacao").select("*").eq("importacao_id", importacoes[0].id).order("nome");
      if (error) throw error;
      pessoas = data || [];
    }
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar: " + err.message, "error");
  }
  pessoas.forEach(setorDe); // define os nomes padronizados dos setores antes de agrupar
  renderAviso();
  renderIndicadores();
  renderAndares();
  renderLista();
  renderHistorico();
  renderDetalhe();
}

function renderAviso() {
  const el = document.getElementById("aviso-lista");
  if (!importacoes.length) {
    el.innerHTML = '<div class="config-warning">Nenhuma lista importada ainda. Use a aba <b>📥 Atualizar lista</b>.</div>';
    return;
  }
  const ult = importacoes[0];
  const ref = ult.data_referencia || ult.created_at.slice(0, 10);
  const dias = -diasAte(ref);
  el.innerHTML = `<div class="${dias > 30 ? "config-warning" : "info-lista"}">Lista atualizada em <b>${formatarDataBR(ref)}</b> · ${ult.total} pessoa(s)${
    dias > 30 ? ` · <b>há ${dias} dias — atualize a lista</b>` : ""
  }</div>`;
}

function contaAndar(andar) {
  return pessoas.filter((p) => normalizarLocal(p.localizacao) === andar).length;
}

function renderIndicadores() {
  document.getElementById("ind-predio").textContent = pessoas.filter((p) => !foraDoPredio(p)).length;
  document.getElementById("ind-terreo").textContent = contaAndar("TÉRREO");
  document.getElementById("ind-1andar").textContent = contaAndar("1º ANDAR");
  document.getElementById("ind-2andar").textContent = contaAndar("2º ANDAR");
  document.getElementById("ind-externo").textContent = pessoas.filter(foraDoPredio).length;
  document.getElementById("ind-terceiros").textContent = pessoas.filter((p) => eTerceiro(p) && !foraDoPredio(p)).length;
}

function filtroDetalhe(chave) {
  if (chave === "predio") return { titulo: "No prédio", f: (p) => !foraDoPredio(p) };
  if (chave === "externo") return { titulo: "Externos / Home office", f: foraDoPredio };
  if (chave === "terceiros") return { titulo: "Terceiros no prédio", f: (p) => eTerceiro(p) && !foraDoPredio(p) };
  return { titulo: chave.charAt(0) + chave.slice(1).toLowerCase(), f: (p) => normalizarLocal(p.localizacao) === chave };
}

function renderDetalhe() {
  const painel = document.getElementById("ind-detalhe");
  document.querySelectorAll("#indicadores-pop .clicavel").forEach((c) => c.classList.toggle("aberto", c.dataset.ind === detalheAberto));
  if (!detalheAberto) {
    painel.style.display = "none";
    return;
  }
  const { titulo, f } = filtroDetalhe(detalheAberto);
  const lista = pessoas.filter(f).sort((a, b) => a.nome.localeCompare(b.nome));
  // Agrupa: "No prédio" por andar; andares por setor; demais por localização/empresa
  const chaveGrupo =
    detalheAberto === "predio"
      ? (p) => normalizarLocal(p.localizacao)
      : ORDEM_ANDARES.includes(detalheAberto) || detalheAberto.endsWith("ANDAR")
      ? setorDe
      : detalheAberto === "terceiros"
      ? (p) => p.empresa || "-"
      : (p) => normalizarLocal(p.localizacao) || "Sem localização";
  const grupos = {};
  lista.forEach((p) => (grupos[chaveGrupo(p)] = grupos[chaveGrupo(p)] || []).push(p));
  const ordem = Object.keys(grupos).sort((a, b) =>
    detalheAberto === "predio" ? andaresPresentes().indexOf(a) - andaresPresentes().indexOf(b) : grupos[b].length - grupos[a].length || a.localeCompare(b)
  );
  painel.style.display = "block";
  painel.innerHTML = `
    <div class="row justify-between mb-16">
      <h3 style="margin:0;">${escHtml(titulo)} <span class="org-count">${lista.length}</span></h3>
      <button class="btn btn-secondary" id="btn-fechar-detalhe">✕ Fechar</button>
    </div>
    ${
      lista.length
        ? ordem
            .map(
              (g) => `<div class="detalhe-grupo">
          <div class="detalhe-grupo-cab"><span>${escHtml(g)}</span><b>${grupos[g].length}</b></div>
          <div class="detalhe-grid">${grupos[g]
            .map(
              (p) => `<div class="detalhe-item ${eBrigadista(p) ? "brig" : ""}" style="cursor:default;">
                <div class="detalhe-avatar">${eBrigadista(p) ? "🔥" : escHtml(p.nome.trim().charAt(0))}</div>
                <div class="detalhe-texto"><b>${escHtml(p.nome)}</b>
                  <span>${escHtml(
                    [chaveGrupo === setorDe ? "" : setorDe(p), eTerceiro(p) ? p.empresa : p.vinculo, eBrigadista(p) ? "Brigadista" : ""].filter(Boolean).join(" · ")
                  )}</span>
                </div>
              </div>`
            )
            .join("")}</div>
        </div>`
            )
            .join("")
        : '<div class="empty-state small" style="padding:16px;">Ninguém nesta lista.</div>'
    }`;
  document.getElementById("btn-fechar-detalhe").addEventListener("click", () => {
    detalheAberto = null;
    renderDetalhe();
  });
}

function andaresPresentes() {
  const extras = [...new Set(pessoas.filter((p) => !foraDoPredio(p)).map((p) => normalizarLocal(p.localizacao)))].filter((a) => !ORDEM_ANDARES.includes(a));
  return [...ORDEM_ANDARES, ...extras.sort()];
}

// Nome do setor padronizado (ignora diferenças de maiúsculas/acentos, ex.: "EXpedição")
const _rotuloSetor = {};
function setorDe(p) {
  // Terceiros: usa a área (ex.: Limpeza, Refeitório); demais: departamento
  const bruto = eTerceiro(p) ? p.area || p.departamento || `Terceiros (${p.empresa || "-"})` : p.departamento || p.area || "Sem setor";
  const k = normalizarNome(bruto);
  if (!_rotuloSetor[k] || /^[A-ZÀ-Ú][a-zà-ú]/.test(bruto)) _rotuloSetor[k] = _rotuloSetor[k] && !/^[A-ZÀ-Ú][a-zà-ú]/.test(_rotuloSetor[k]) ? bruto : _rotuloSetor[k] || bruto;
  return _rotuloSetor[k];
}

const ICONE_ANDAR = { "TÉRREO": "T", "1º ANDAR": "1º", "2º ANDAR": "2º" };

function renderAndares() {
  const cont = document.getElementById("andares-container");
  if (!pessoas.length) {
    cont.innerHTML = '<div class="empty-state">Importe a lista de colaboradores para ver a distribuição.</div>';
    return;
  }
  const totalPredio = pessoas.filter((p) => !foraDoPredio(p)).length || 1;
  cont.innerHTML = `<div class="andares-grid">${andaresPresentes()
    .map((andar) => {
      const doAndar = pessoas.filter((p) => normalizarLocal(p.localizacao) === andar);
      if (!doAndar.length) return "";
      const porSetor = {};
      doAndar.forEach((p) => (porSetor[setorDe(p)] = porSetor[setorDe(p)] || []).push(p));
      const brig = doAndar.filter(eBrigadista).length;
      const maior = Math.max(...Object.values(porSetor).map((ps) => ps.length));
      const pct = Math.round((doAndar.length / totalPredio) * 100);
      return `<section class="andar-card">
        <header class="andar-head">
          <div class="andar-icone">${escHtml(ICONE_ANDAR[andar] || andar.slice(0, 2))}</div>
          <div class="andar-info">
            <h4>${escHtml(andar.charAt(0) + andar.slice(1).toLowerCase())}</h4>
            <div class="andar-sub">${Object.keys(porSetor).length} setor(es) · ${pct}% do prédio</div>
          </div>
          <div class="andar-numeros">
            <div class="andar-num"><b>${doAndar.length}</b><span>pessoas</span></div>
            <div class="andar-num brig"><b>${brig}</b><span>🔥 brigadistas</span></div>
          </div>
        </header>
        <div class="setor-lista">
          ${Object.entries(porSetor)
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
            .map(([setor, ps]) => {
              const nb = ps.filter(eBrigadista).length;
              const terc = ps.every(eTerceiro);
              return `<details class="setor-row">
                <summary>
                  <span class="setor-nome">${escHtml(setor)}${terc ? ' <span class="tag-terceiro">terceiro</span>' : ""}</span>
                  <span class="setor-barra"><i style="width:${Math.max(6, (ps.length / maior) * 100)}%"></i></span>
                  <span class="setor-qtd">${ps.length}</span>
                  <span class="setor-brig" title="Brigadistas neste setor">${nb ? "🔥" + nb : ""}</span>
                </summary>
                <div class="setor-pessoas">${ps
                  .sort((a, b) => a.nome.localeCompare(b.nome))
                  .map((p) => `<span class="pessoa-chip ${eBrigadista(p) ? "brig" : ""}">${eBrigadista(p) ? "🔥 " : ""}${escHtml(p.nome)}</span>`)
                  .join("")}</div>
              </details>`;
            })
            .join("")}
        </div>
      </section>`;
    })
    .join("")}</div>`;
}

function renderLista() {
  const busca = normalizarNome(document.getElementById("busca-pop").value);
  const sel = document.getElementById("filtro-local-pop");
  const atual = sel.value;
  const locais = [...new Set(pessoas.map((p) => normalizarLocal(p.localizacao)).filter(Boolean))];
  sel.innerHTML = '<option value="">Todas</option>' + locais.map((l) => `<option>${escHtml(l)}</option>`).join("");
  sel.value = atual;
  const lista = pessoas.filter((p) => {
    if (sel.value && normalizarLocal(p.localizacao) !== sel.value) return false;
    if (busca && !normalizarNome([p.nome, p.area, p.departamento, p.empresa, p.vinculo].join(" ")).includes(busca)) return false;
    return true;
  });
  document.getElementById("contagem-pop").textContent = `${lista.length} de ${pessoas.length} pessoa(s)`;
  document.getElementById("tabela-pop").innerHTML = lista
    .map(
      (p) => `<tr>
      <td><b>${eBrigadista(p) ? "🔥 " : ""}${escHtml(p.nome)}</b></td>
      <td>${escHtml(p.empresa || "-")}</td>
      <td>${escHtml(p.vinculo || "-")}</td>
      <td>${escHtml(p.area || "-")}<div class="small text-muted">${escHtml(p.departamento || "")}</div></td>
      <td>${escHtml(normalizarLocal(p.localizacao) || "-")}</td>
    </tr>`
    )
    .join("");
}

function renderHistorico() {
  document.getElementById("historico-pop").innerHTML = importacoes.length
    ? importacoes
        .map(
          (i, idx) =>
            `<div>${idx === 0 ? "✅ <b>Atual</b> — " : ""}Lista de ${formatarDataBR(i.data_referencia || i.created_at)} · ${i.total} pessoas · enviada em ${new Date(i.created_at).toLocaleString("pt-BR")}${
              i.arquivo_nome ? " · " + escHtml(i.arquivo_nome) : ""
            }</div>`
        )
        .join("")
    : "Nenhuma atualização ainda.";
}

// ---------------- Importação ----------------
const COLS_POP = {
  NOME: "nome",
  "NOME COMPLETO": "nome",
  COLABORADOR: "nome",
  EMPRESA: "empresa",
  VINCULO: "vinculo",
  MATRICULA: "matricula",
  AREA: "area",
  DEPARTAMENTO: "departamento",
  SETOR: "departamento",
  LOCALIZACAO: "localizacao",
  LOCAL: "localizacao",
  ANDAR: "localizacao",
  PISO: "localizacao",
};

function lerDataBR(v) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return "";
  const ano = m[3].length === 2 ? "20" + m[3] : m[3];
  return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

async function lerPlanilhaPop(e) {
  const file = e.target.files[0];
  importPop = null;
  document.getElementById("btn-importar-pop").disabled = true;
  if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    // Data de referência ("Atualização em" | 14.10.2026)
    let dataRef = "";
    linhas.slice(0, 6).forEach((l) => {
      const i = l.findIndex((c) => normalizarNome(c).startsWith("ATUALIZ"));
      if (i >= 0) dataRef = l.slice(i + 1).map(lerDataBR).find(Boolean) || dataRef;
    });
    document.getElementById("data-ref-pop").value = dataRef || hojeISOLocal();

    const idxCab = linhas.findIndex((l) => l.some((c) => COLS_POP[normalizarNome(c)] === "nome"));
    if (idxCab < 0) throw new Error('Não encontrei a coluna "Nome".');
    const cab = linhas[idxCab].map((c) => COLS_POP[normalizarNome(c)] || null);
    const registros = linhas
      .slice(idxCab + 1)
      .map((l) => {
        const o = {};
        cab.forEach((campo, i) => {
          if (campo && o[campo] === undefined) o[campo] = String(l[i] ?? "").replace(/\s+/g, " ").trim();
        });
        if (o.matricula === "-") o.matricula = "";
        if (o.localizacao) o.localizacao = normalizarLocal(o.localizacao);
        return o;
      })
      .filter((o) => o.nome);
    // Linhas idênticas repetidas (mesmo nome, empresa e local) são consideradas duplicadas
    const vistos = new Set();
    const duplicadas = [];
    const unicos = registros.filter((r) => {
      const k = [normalizarNome(r.nome), normalizarNome(r.empresa), r.localizacao].join("|");
      if (vistos.has(k)) {
        duplicadas.push(r.nome);
        return false;
      }
      vistos.add(k);
      return true;
    });
    unicos.forEach(aplicarPadraoTerceiros);
    importPop = { registros: unicos, duplicadas, arquivo: file.name };
    renderPrevia();
  } catch (err) {
    console.error(err);
    document.getElementById("previa-pop").innerHTML = `<div class="config-warning">❌ ${escHtml(err.message)}</div>`;
  }
}

// Área/departamento padrão para terceiros sem esses dados
const PADRAO_TERCEIROS = [
  { teste: (r) => /AEXECUTIVA|LIMPEZA/i.test(r.empresa + " " + r.vinculo), area: "Limpeza", departamento: "Geral" },
  { teste: (r) => /PRATO FINO|REFEIT|RESTAURANTE|COZINHA/i.test(r.empresa + " " + r.vinculo), area: "Refeitório", departamento: "Refeitório" },
];
function aplicarPadraoTerceiros(r) {
  if (!eTerceiro(r) || (r.area && r.departamento)) return;
  const regra = PADRAO_TERCEIROS.find((x) => x.teste(r));
  if (!regra) return;
  r.area = r.area || regra.area;
  r.departamento = r.departamento || regra.departamento;
}

function renderPrevia() {
  const { registros, duplicadas } = importPop;
  const antes = new Set(pessoas.map((p) => normalizarNome(p.nome)));
  const depois = new Set(registros.map((p) => normalizarNome(p.nome)));
  const entraram = registros.filter((p) => !antes.has(normalizarNome(p.nome)));
  const sairam = pessoas.filter((p) => !depois.has(normalizarNome(p.nome)));
  const contagem = {};
  registros.forEach((r) => (contagem[normalizarNome(r.nome)] = (contagem[normalizarNome(r.nome)] || 0) + 1));
  const repetidos = Object.entries(contagem).filter(([, n]) => n > 1).map(([nome, n]) => `${nome} (${n}x)`);
  const semLocal = registros.filter((r) => !r.localizacao).map((r) => r.nome);
  const porLocal = {};
  registros.forEach((r) => (porLocal[r.localizacao || "SEM LOCALIZAÇÃO"] = (porLocal[r.localizacao || "SEM LOCALIZAÇÃO"] || 0) + 1));
  const brigFora = [...nomesBrigadistas].filter((n) => !depois.has(n));
  const lista = (arr, max = 10) => arr.slice(0, max).map(escHtml).join(", ") + (arr.length > max ? ` e mais ${arr.length - max}` : "");

  document.getElementById("previa-pop").innerHTML = `
    <div class="previa-grid">
      <div class="previa-item"><b>${registros.length}</b> pessoas na planilha<div class="small text-muted">${Object.entries(porLocal)
        .map(([l, n]) => `${escHtml(l)}: ${n}`)
        .join(" · ")}</div></div>
      ${pessoas.length ? `<div class="previa-item ok"><b>${entraram.length}</b> entraram<div class="small text-muted">${lista(entraram.map((p) => p.nome))}</div></div>` : ""}
      ${pessoas.length ? `<div class="previa-item danger"><b>${sairam.length}</b> saíram<div class="small text-muted">${lista(sairam.map((p) => p.nome))}</div></div>` : ""}
    </div>
    ${duplicadas.length ? `<div class="info-lista mt-16">Linhas duplicadas removidas automaticamente: ${lista(duplicadas)}</div>` : ""}
    ${repetidos.length ? `<div class="config-warning mt-16"><b>Mesmo nome em empresas/andares diferentes</b> (confira): ${lista(repetidos)}</div>` : ""}
    ${semLocal.length ? `<div class="config-warning mt-16"><b>Sem localização</b> (não entram na contagem do prédio): ${lista(semLocal)}</div>` : ""}
    ${brigFora.length ? `<div class="config-warning mt-16"><b>Brigadistas que não estão na lista nova</b> — se saíram da empresa, inative-os em Colaboradores e Brigadistas: ${lista(brigFora)}</div>` : ""}
  `;
  document.getElementById("btn-importar-pop").disabled = registros.length === 0;
}

async function importarPop() {
  if (!importPop) return;
  const btn = document.getElementById("btn-importar-pop");
  btn.disabled = true;
  btn.textContent = "Atualizando...";
  try {
    const { data, error } = await supabaseClient.rpc("importar_populacao", {
      dados: importPop.registros,
      ref: document.getElementById("data-ref-pop").value || null,
      arquivo: importPop.arquivo,
    });
    if (error) throw error;
    showToast(`Lista atualizada: ${data} pessoa(s).`, "success");
    importPop = null;
    document.getElementById("input-pop").value = "";
    document.getElementById("previa-pop").innerHTML = "";
    await carregar();
    document.querySelector('.tab-btn[data-tab="andares"]').click();
  } catch (err) {
    console.error(err);
    showToast("Erro ao atualizar: " + err.message, "error");
  } finally {
    btn.textContent = "📥 Atualizar lista";
    btn.disabled = !importPop;
  }
}

// ---------------- PDF: lista de chamada no ponto de encontro ----------------
async function pdfChamada() {
  const noPredio = pessoas.filter((p) => !foraDoPredio(p));
  if (!noPredio.length) return showToast("Importe a lista primeiro.", "error");
  const ult = importacoes[0];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = await cabecalhoPdf(doc, "Lista de Chamada — Ponto de Encontro", [
    `Lista de ${formatarDataBR(ult.data_referencia || ult.created_at)} · ${noPredio.length} pessoa(s) no prédio`,
    "Data do evento: ____/____/______   Horário: ____:____   Responsável: ______________________",
  ]);
  const resumo = andaresPresentes()
    .map((a) => [a, noPredio.filter((p) => normalizarLocal(p.localizacao) === a).length])
    .filter(([, n]) => n);
  doc.autoTable({
    startY: y,
    head: [["Andar", "Pessoas", "Presentes no ponto", "Faltando"]],
    body: [...resumo.map(([a, n]) => [a, n, "", ""]), ["TOTAL", noPredio.length, "", ""]],
    styles: { fontSize: 9, minCellHeight: 8, valign: "middle" },
    headStyles: CORES_TABELA_PDF,
    margin: { left: 14, right: 14, bottom: 16 },
  });
  y = doc.lastAutoTable.finalY + 8;

  resumo.forEach(([andar]) => {
    const lista = noPredio.filter((p) => normalizarLocal(p.localizacao) === andar).sort((a, b) => setorDe(a).localeCompare(setorDe(b)) || a.nome.localeCompare(b.nome));
    if (y > 250) {
      doc.addPage();
      y = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COR_ESCURA);
    doc.text(`${andar} — ${lista.length} pessoa(s)`, 14, y);
    doc.autoTable({
      startY: y + 3,
      head: [["Nº", "Nome", "Setor", "Presente"]],
      body: lista.map((p, i) => [i + 1, (eBrigadista(p) ? "[B] " : "") + p.nome, setorDe(p), ""]),
      styles: { fontSize: 8.5, minCellHeight: 7, valign: "middle" },
      columnStyles: { 0: { cellWidth: 10 }, 3: { cellWidth: 22 } },
      headStyles: CORES_TABELA_PDF,
      margin: { left: 14, right: 14, bottom: 16 },
      didDrawCell: (d) => {
        if (d.section === "body" && d.column.index === 3) {
          doc.setDrawColor(120);
          doc.rect(d.cell.x + d.cell.width / 2 - 2.2, d.cell.y + d.cell.height / 2 - 2.2, 4.4, 4.4);
        }
      },
    });
    y = doc.lastAutoTable.finalY + 9;
  });
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("[B] = brigadista. Externos / home office não estão na lista.", 14, Math.min(y, 285));
  rodapePdf(doc);
  doc.save(`lista-chamada-evacuacao-${hojeISOLocal()}.pdf`);
}
