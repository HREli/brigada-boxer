// =========================================================================
// BRIGADA BOXER - Dashboard Geral
// =========================================================================

document.addEventListener("DOMContentLoaded", () => {
  mostrarAvisoConfiguracao();
  carregarDashboard();
});

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasEntreDash(dataFutura) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataFutura + "T00:00:00");
  return Math.round((alvo - hoje) / 86400000);
}

function statusEfetivoAcao(a) {
  if (a.data_conclusao) return "Concluída";
  return a.prazo < hojeISO() ? "Atrasada" : "Em andamento";
}

function formatarDataDash(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function diasDesdeDash(dataPassada) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataPassada + "T00:00:00");
  return Math.round((hoje - alvo) / 86400000);
}

// Retorna o mapa {id: data_inspecao_mais_recente} a partir de uma lista de inspeções
function mapaUltimaInspecao(inspecoes, campoId) {
  const ordenadas = [...inspecoes].sort((a, b) => (b.data_inspecao || "").localeCompare(a.data_inspecao || ""));
  const mapa = {};
  ordenadas.forEach((i) => {
    if (!mapa[i[campoId]]) mapa[i[campoId]] = i.data_inspecao;
  });
  return mapa;
}

async function carregarDashboard() {
  if (!CONFIGURADO) {
    return;
  }

  try {
    const [brigadistasRes, acoesRes, extintoresRes, hidrantesRes, inspExtRes, inspHidRes, docsRes] = await Promise.all([
      supabaseClient.from("brigadistas").select("*").eq("ativo", true).eq("e_brigadista", true),
      supabaseClient.from("acoes").select("*"),
      supabaseClient.from("extintores").select("*").eq("ativo", true),
      supabaseClient.from("hidrantes").select("*").eq("ativo", true),
      supabaseClient.from("inspecoes_extintor").select("extintor_id, data_inspecao"),
      supabaseClient.from("inspecoes_hidrante").select("hidrante_id, data_inspecao"),
      supabaseClient.from("documentos").select("*"),
    ]);

    const brigadistas = brigadistasRes.data || [];
    const todasAcoes = acoesRes.data || [];
    const acoes = todasAcoes.filter((a) => a.encaminhamento !== "Pauta Geral");
    const itensLideresPendentes = todasAcoes.filter(
      (a) => a.origem === "Reunião de Líderes" && ["Pauta Geral", "Ação Geral"].includes(a.encaminhamento) && !a.ata_geral_id
    );
    const documentos = docsRes.data || [];
    const extintores = extintoresRes.data || [];
    const hidrantes = hidrantesRes.data || [];
    const inspecoesExt = inspExtRes.data || [];
    const inspecoesHid = inspHidRes.data || [];

    // ---------------- Indicadores ----------------
    const acoesComStatus = acoes.map((a) => ({ ...a, statusEfetivo: statusEfetivoAcao(a) }));
    const totalAcoes = acoesComStatus.length;
    const acoesAtrasadas = acoesComStatus.filter((a) => a.statusEfetivo === "Atrasada");
    const acoesConcluidas = acoesComStatus.filter((a) => a.statusEfetivo === "Concluída");

    const extintoresAlerta = extintores.filter((e) => diasEntreDash(e.data_vencimento) <= 30);
    const hidrantesAlerta = hidrantes.filter((h) => diasEntreDash(h.data_vencimento) <= 30);

    const ultimaInspExt = mapaUltimaInspecao(inspecoesExt, "extintor_id");
    const ultimaInspHid = mapaUltimaInspecao(inspecoesHid, "hidrante_id");

    const extintoresInspAtrasada = extintores.filter((e) => {
      const ultima = ultimaInspExt[e.id];
      return !ultima || diasDesdeDash(ultima) >= 30;
    });
    const hidrantesInspAtrasada = hidrantes.filter((h) => {
      const ultima = ultimaInspHid[h.id];
      return !ultima || diasDesdeDash(ultima) >= 30;
    });

    document.getElementById("dash-brigadistas").textContent = brigadistas.length;
    document.getElementById("dash-acoes-total").textContent = totalAcoes;
    document.getElementById("dash-acoes-atrasadas").textContent = acoesAtrasadas.length;
    document.getElementById("dash-extintores-alerta").textContent = extintoresAlerta.length;
    document.getElementById("dash-hidrantes-alerta").textContent = hidrantesAlerta.length;
    document.getElementById("dash-ext-insp-atrasada").textContent = extintoresInspAtrasada.length;
    document.getElementById("dash-hid-insp-atrasada").textContent = hidrantesInspAtrasada.length;

    // ---------------- Cumprimento do Plano de Ação ----------------
    const pctPlano = totalAcoes > 0 ? Math.round((acoesConcluidas.length / totalAcoes) * 100) : 0;
    document.getElementById("pct-plano").textContent = pctPlano + "%";
    document.getElementById("bar-plano").style.width = pctPlano + "%";

    // ---------------- Cumprimento das inspeções do mês ----------------
    const agora = new Date();
    const prefixoMes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;

    const extintoresInspecionadosEsteMes = new Set(
      inspecoesExt.filter((i) => (i.data_inspecao || "").startsWith(prefixoMes)).map((i) => i.extintor_id)
    );
    const hidrantesInspecionadosEsteMes = new Set(
      inspecoesHid.filter((i) => (i.data_inspecao || "").startsWith(prefixoMes)).map((i) => i.hidrante_id)
    );

    const pctExt = extintores.length > 0 ? Math.round((extintoresInspecionadosEsteMes.size / extintores.length) * 100) : 0;
    const pctHid = hidrantes.length > 0 ? Math.round((hidrantesInspecionadosEsteMes.size / hidrantes.length) * 100) : 0;

    document.getElementById("pct-ext").textContent = pctExt + "%";
    document.getElementById("bar-ext").style.width = pctExt + "%";
    document.getElementById("pct-hid").textContent = pctHid + "%";
    document.getElementById("bar-hid").style.width = pctHid + "%";

    // ---------------- Alertas ----------------
    const alertas = [];

    acoesAtrasadas.forEach((a) => {
      alertas.push({
        titulo: "Ação atrasada: " + a.descricao,
        sub: `Responsável: ${a.responsavel} · Prazo: ${formatarDataDash(a.prazo)}`,
        badge: '<span class="badge badge-danger">Ação</span>',
      });
    });

    extintoresAlerta.forEach((e) => {
      const dias = diasEntreDash(e.data_vencimento);
      const sub = dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : `Vence em ${dias} dia(s)`;
      alertas.push({
        titulo: `Extintor ${e.identificador} - ${e.localizacao}`,
        sub,
        badge: dias < 0 ? '<span class="badge badge-danger">Vencido</span>' : '<span class="badge badge-warn">Extintor</span>',
      });
    });

    hidrantesAlerta.forEach((h) => {
      const dias = diasEntreDash(h.data_vencimento);
      const sub = dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : `Vence em ${dias} dia(s)`;
      alertas.push({
        titulo: `Hidrante ${h.localizacao}`,
        sub,
        badge: dias < 0 ? '<span class="badge badge-danger">Vencido</span>' : '<span class="badge badge-warn">Hidrante</span>',
      });
    });

    extintoresInspAtrasada.forEach((e) => {
      const ultima = ultimaInspExt[e.id];
      const sub = ultima ? `Última inspeção há ${diasDesdeDash(ultima)} dia(s)` : "Nunca inspecionado";
      alertas.push({
        titulo: `Inspeção mensal pendente: Extintor ${e.identificador} - ${e.localizacao}`,
        sub,
        badge: '<span class="badge badge-danger">Inspeção</span>',
      });
    });

    hidrantesInspAtrasada.forEach((h) => {
      const ultima = ultimaInspHid[h.id];
      const sub = ultima ? `Última inspeção há ${diasDesdeDash(ultima)} dia(s)` : "Nunca inspecionado";
      alertas.push({
        titulo: `Inspeção mensal pendente: Hidrante ${h.localizacao}`,
        sub,
        badge: '<span class="badge badge-danger">Inspeção</span>',
      });
    });

    // ---------------- Documentos (Atestado e certificados) ----------------
    const atestados = documentos
      .filter((d) => d.tipo === "Atestado da Brigada")
      .sort((a, b) => (b.data_validade || "").localeCompare(a.data_validade || ""));
    if (!atestados.length) {
      alertas.unshift({
        titulo: "Atestado da Brigada não arquivado",
        sub: "Arquive o atestado no menu Certificados e Atestado",
        badge: '<span class="badge badge-danger">Documento</span>',
      });
    } else if (atestados[0].data_validade && diasEntreDash(atestados[0].data_validade) <= 60) {
      const dias = diasEntreDash(atestados[0].data_validade);
      alertas.unshift({
        titulo: "Atestado da Brigada",
        sub: dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : `Vence em ${dias} dia(s)`,
        badge: dias < 0 ? '<span class="badge badge-danger">Vencido</span>' : '<span class="badge badge-warn">Documento</span>',
      });
    }

    const certificados = documentos.filter((d) => d.tipo === "Certificado de Formação");
    const certValidoTurma = certificados.some((d) => !d.brigadista_id && (!d.data_validade || diasEntreDash(d.data_validade) >= 0));
    const semCertificado = brigadistas.filter(
      (b) => !certificados.some((d) => d.brigadista_id === b.id && (!d.data_validade || diasEntreDash(d.data_validade) >= 0))
    );
    if (semCertificado.length && !certValidoTurma) {
      alertas.push({
        titulo: `${semCertificado.length} brigadista(s) sem certificado de formação válido`,
        sub: semCertificado.slice(0, 6).map((b) => b.nome).join(", ") + (semCertificado.length > 6 ? "..." : ""),
        badge: '<span class="badge badge-warn">Certificado</span>',
      });
    }
    certificados
      .filter((d) => d.data_validade && diasEntreDash(d.data_validade) >= 0 && diasEntreDash(d.data_validade) <= 60)
      .forEach((d) => {
        alertas.push({
          titulo: "Certificado vencendo: " + d.titulo,
          sub: `Vence em ${diasEntreDash(d.data_validade)} dia(s)`,
          badge: '<span class="badge badge-warn">Certificado</span>',
        });
      });

    if (itensLideresPendentes.length) {
      alertas.push({
        titulo: `${itensLideresPendentes.length} item(ns) da Reunião de Líderes aguardando a Reunião Geral`,
        sub: itensLideresPendentes.slice(0, 4).map((a) => a.descricao).join(" · "),
        badge: '<span class="badge badge-brigada">Reunião</span>',
      });
    }

    renderAlertas(alertas);
  } catch (err) {
    console.error(err);
    showToast("Erro ao carregar dashboard: " + err.message, "error");
  }
}

function renderAlertas(alertas) {
  const container = document.getElementById("dash-alertas-lista");
  const empty = document.getElementById("dash-alertas-empty");
  container.innerHTML = "";

  if (alertas.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  alertas.forEach((a) => {
    const div = document.createElement("div");
    div.className = "alert-item";
    div.innerHTML = `
      <div>
        <div class="titulo">${escapeHtmlDash(a.titulo)}</div>
        <div class="sub">${escapeHtmlDash(a.sub)}</div>
      </div>
      ${a.badge}
    `;
    container.appendChild(div);
  });
}

function escapeHtmlDash(str) {
  if (str == null) return "";
  return String(str).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
