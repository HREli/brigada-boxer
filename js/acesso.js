// =========================================================================
// BRIGADA BOXER - Controle de acesso
// Líderes (coordenador + líderes de andar) entram com CPF + senha e editam.
// Demais pessoas apenas visualizam: botões e campos de edição ficam ocultos.
// =========================================================================

const DOMINIO_ACESSO = "brigada.boxersoldas.app";
const acesso = { editor: false, admin: false, nome: "" };

// Elementos que continuam funcionando no modo "somente visualizar"
const LIVRES = [
  ".tab-btn", "[id^=filtro]", "[id^=busca]", "#ordenar-por", "#ano-anterior", "#ano-seguinte",
  ".kpi", ".faixa", ".num-pres", ".chip-filtro", "#btn-fechar-detalhe", ".modal-close",
  "button[id*=pdf]", "button[id*=export]", "#btn-print-quadro", ".btn-gerar-pdf", "#btn-modelo",
  "#btn-acesso", "#modal-acesso *", ".btn-situacao",
].join(",");
const ABAS_EDICAO = ["nova", "novo", "importar", "fotos"];

function aplicarLeitura(raiz = document) {
  if (acesso.editor) return;
  raiz.querySelectorAll("button, input, select, textarea, label.btn").forEach((el) => {
    if (el.matches(LIVRES) || el.closest("#modal-acesso")) return;
    if (el.tagName === "BUTTON" || el.matches("label.btn") || el.type === "file") el.classList.add("oculto-leitura");
    else el.disabled = true;
  });
  raiz.querySelectorAll(".tab-btn").forEach((b) => {
    if (ABAS_EDICAO.includes(b.dataset.tab)) b.classList.add("oculto-leitura");
  });
}

function cpfDigitos(v) {
  return String(v || "").replace(/\D/g, "");
}

async function verificarAcesso() {
  if (!CONFIGURADO) return;
  const { data } = await supabaseClient.auth.getSession();
  if (data && data.session) {
    const { data: eu } = await supabaseClient.rpc("meu_acesso");
    if (eu && eu.length) Object.assign(acesso, { editor: true, admin: !!eu[0].admin, nome: eu[0].nome });
  }
}

function montarBotaoAcesso() {
  const top = document.querySelector(".topbar");
  if (!top) return;
  const btn = document.createElement("button");
  btn.id = "btn-acesso";
  btn.className = "btn-acesso";
  btn.innerHTML = acesso.editor
    ? `👤 ${escHtml(acesso.nome.split(" ")[0])}${acesso.admin ? " · admin" : ""}`
    : "🔒 Entrar (líderes)";
  btn.title = acesso.editor ? "Você pode editar. Clique para sair ou gerenciar acessos." : "Somente visualização. Líderes: clique para entrar.";
  const back = top.querySelector(".back-link");
  top.insertBefore(btn, back || null);
  if (!back) btn.style.marginLeft = "auto";
  btn.addEventListener("click", abrirModalAcesso);
  if (!acesso.editor) {
    const faixa = document.createElement("div");
    faixa.className = "faixa-leitura";
    faixa.innerHTML = '👁️ Modo <b>somente visualização</b>. Líderes autorizados: clique em <b>🔒 Entrar</b> para editar.';
    const cont = document.querySelector(".container");
    if (cont) cont.prepend(faixa);
  }
}

function abrirModalAcesso() {
  let m = document.getElementById("modal-acesso");
  if (!m) {
    m = document.createElement("div");
    m.id = "modal-acesso";
    m.className = "modal-backdrop";
    document.body.appendChild(m);
    // Fecha só pelo ✕ (clicar fora não fecha mais, para não perder o que foi digitado)
  }
  m.style.display = "flex";
  if (acesso.editor) return telaLogado(m);
  telaEntrar(m);
}

// Uma tela para entrar e outra para criar/trocar a senha (primeiro acesso ou esqueci)
function telaEntrar(m, modo = "entrar") {
  const criar = modo === "criar";
  m.innerHTML = `<div class="modal" style="max-width:400px;">
    <div class="modal-header"><h3 style="margin:0;">${criar ? "Criar ou trocar minha senha" : "Entrar para editar"}</h3><button class="modal-close" data-fechar>✕</button></div>
    <p class="small text-muted" style="margin-top:0;">${
      criar
        ? "Para o primeiro acesso ou se esqueceu a senha. Confirme seus dados e escolha a senha nova."
        : "Acesso dos líderes autorizados da brigada."
    }</p>
    <div class="field"><label>CPF</label><input type="text" id="ac-cpf" inputmode="numeric" placeholder="000.000.000-00" autocomplete="username" /></div>
    ${criar ? '<div class="field mt-16"><label>Data de nascimento</label><input type="date" id="ac-nasc" /></div>' : ""}
    <div class="field mt-16"><label>${criar ? "Nova senha (mínimo 6 caracteres)" : "Senha"}</label><input type="password" id="ac-senha" autocomplete="${criar ? "new-password" : "current-password"}" /></div>
    ${criar ? '<div class="field mt-16"><label>Repita a nova senha</label><input type="password" id="ac-senha2" autocomplete="new-password" /></div>' : ""}
    <div class="row mt-16"><button class="btn btn-primary" id="ac-ok">${criar ? "Salvar senha e entrar" : "Entrar"}</button></div>
    <p class="small mt-16"><a href="#" id="ac-trocar" style="color:var(--brand-red);font-weight:600;">${criar ? "← Voltar para entrar" : "Primeiro acesso ou esqueci minha senha"}</a></p>
    <div id="ac-erro" class="small" style="color:var(--danger);"></div>
  </div>`;
  m.querySelector("[data-fechar]").onclick = () => (m.style.display = "none");
  m.querySelector("#ac-trocar").onclick = (e) => {
    e.preventDefault();
    telaEntrar(m, criar ? "entrar" : "criar");
  };
  const cpf = m.querySelector("#ac-cpf");
  cpf.addEventListener("input", () => {
    const d = cpfDigitos(cpf.value).slice(0, 11);
    cpf.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  });
  m.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => e.key === "Enter" && m.querySelector("#ac-ok").click()));
  cpf.focus();
  m.querySelector("#ac-ok").onclick = async () => {
    const erro = m.querySelector("#ac-erro");
    const btn = m.querySelector("#ac-ok");
    erro.textContent = "";
    const d = cpfDigitos(cpf.value);
    const senha = m.querySelector("#ac-senha").value;
    if (d.length !== 11) return (erro.textContent = "Informe o CPF completo.");
    if (!senha) return (erro.textContent = "Informe a senha.");
    btn.disabled = true;
    try {
      if (criar) {
        const nascimento = m.querySelector("#ac-nasc").value;
        if (!nascimento) throw new Error("Informe a data de nascimento.");
        if (senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
        if (senha !== m.querySelector("#ac-senha2").value) throw new Error("As senhas não conferem.");
        const { data, error } = await supabaseClient.functions.invoke("acesso", { body: { acao: "esqueci", cpf: d, nascimento, senha } });
        if (error) {
          let msg = error.message;
          try {
            msg = (await error.context.json()).erro || msg;
          } catch (e) {}
          throw new Error(msg);
        }
        if (data && data.erro) throw new Error(data.erro);
      }
      const { error } = await supabaseClient.auth.signInWithPassword({ email: `${d}@${DOMINIO_ACESSO}`, password: senha });
      if (error) throw new Error(criar ? "Senha salva, mas não foi possível entrar. Tente entrar de novo." : "CPF ou senha incorretos.");
      if (!criar) return location.reload();
      m.innerHTML = `<div class="modal" style="max-width:400px;text-align:center;">
        <h3 style="margin-top:0;">✅ Senha salva!</h3>
        <p>Você já está conectada como líder. Use esta senha nos próximos acessos.</p>
        <div class="row mt-16" style="justify-content:center;"><button class="btn btn-primary" id="ac-continuar">Continuar</button></div>
      </div>`;
      m.querySelector("#ac-continuar").onclick = () => location.reload();
    } catch (e) {
      erro.textContent = e.message;
      btn.disabled = false;
    }
  };
}

async function telaLogado(m) {
  m.innerHTML = `<div class="modal" style="max-width:520px;">
    <div class="modal-header"><h3 style="margin:0;">👤 ${escHtml(acesso.nome)}</h3><button class="modal-close" data-fechar>✕</button></div>
    <p class="small text-muted" style="margin-top:0;">Você está com acesso de <b>edição</b>${acesso.admin ? " e é a <b>administradora</b> dos acessos" : ""}.</p>
    <div id="ac-admin"></div>
    <div class="row mt-16"><button class="btn btn-secondary" id="ac-sair">Sair</button></div>
  </div>`;
  m.querySelector("[data-fechar]").onclick = () => (m.style.display = "none");
  m.querySelector("#ac-sair").onclick = async () => {
    await supabaseClient.auth.signOut();
    location.reload();
  };
  if (!acesso.admin) return;
  const box = m.querySelector("#ac-admin");
  box.innerHTML = '<p class="small">Carregando acessos...</p>';
  const { data, error } = await supabaseClient.functions.invoke("acesso", { body: { acao: "listar" } });
  if (error || !data || data.erro) return (box.innerHTML = '<p class="small" style="color:var(--danger)">Não foi possível carregar os acessos.</p>');
  box.innerHTML = `<h4 style="margin:6px 0 8px;">Quem pode editar</h4>${data.editores
    .map(
      (e) => `<div class="acesso-linha"><div><b>${escHtml(e.nome)}</b><div class="small text-muted">${escHtml(e.funcao || "")}${e.admin ? " · administradora" : ""}</div></div>
        <span class="badge ${e.cadastrado ? "badge-ok" : "badge-warn"}">${e.cadastrado ? "Senha criada" : "Aguardando 1º acesso"}</span>
</div>`
    )
    .join("")}<p class="small text-muted">Cada pessoa cria ou troca a própria senha em "Primeiro acesso ou esqueci minha senha" (CPF + data de nascimento). Para incluir ou retirar editores, fale com o suporte do sistema.</p>`;
  box.querySelectorAll(".btn-redefinir").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Redefinir o acesso? A pessoa precisará criar uma nova senha em 'Primeiro acesso'.")) return;
      const { data: r } = await supabaseClient.functions.invoke("acesso", { body: { acao: "redefinir", brigadista_id: b.dataset.id } });
      if (r && r.ok) {
        showToast("Acesso redefinido.", "success");
        telaLogado(m);
      } else showToast("Não foi possível redefinir.", "error");
    })
  );
}

// Inicialização: roda antes do conteúdo das páginas ser montado
const acessoPronto = (async () => {
  try {
    await verificarAcesso();
  } catch (e) {
    console.error(e);
  }
})();

document.addEventListener("DOMContentLoaded", async () => {
  await acessoPronto;
  // espera as telas montarem (os scripts de cada página rodam depois deste)
  await new Promise((r) => setTimeout(r, 0));
  document.body.classList.toggle("leitura", !acesso.editor);
  montarBotaoAcesso();
  aplicarLeitura();
  // Se a aba aberta por padrão é de edição (ex.: "Nova reunião"), abre a primeira aba de consulta
  if (!acesso.editor && document.querySelector(".tab-btn.active.oculto-leitura")) {
    const livre = [...document.querySelectorAll(".tab-btn")].find((b) => !b.classList.contains("oculto-leitura"));
    if (livre) livre.click();
  }
  if (!acesso.editor) {
    new MutationObserver((muts) => muts.forEach((mu) => mu.addedNodes.forEach((n) => n.nodeType === 1 && aplicarLeitura(n.parentNode || document)))).observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
});
