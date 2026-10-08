// Roda nas páginas do SIGAA.
// - Na tela de login: marca que a próxima visita ao portal deve atualizar.
// - No Portal do Discente: busca a frequência de cada turma (por requisições,
//   sem sair da página), salva no chrome.storage, põe um selo ao lado de cada
//   turma e oferece um minipainel flutuante.
(() => {
  const PORTAL = "/sigaa/portais/discente/discente.jsf";
  const ATUALIZAR_A_CADA_MIN = 10;
  const TRAVA_MAX_MIN = 3; // outra aba sincronizando há menos que isso -> não duplica
  // Na UFMA o <form> da turma fica vazio (o navegador o tira da tabela); o link fica solto no <td>.
  const LINK_TURMA = 'td.descricao a[onclick*="jsfcljs"]';
  const idDaTurma = (link) => link.closest("td").querySelector('input[name="idTurma"]')?.value;

  const armazenamento = chrome.storage.local;

  if (document.querySelector('input[name="user.login"]')) {
    armazenamento.set({ precisaAtualizar: true });
    return;
  }

  const quadro = document.getElementById("turmas-portal");
  if (!quadro || !quadro.querySelector(LINK_TURMA)) return;

  // ------------------------------------------------------------ SIGAA (JSF)

  const parser = new DOMParser();
  const html = (texto) => parser.parseFromString(texto, "text/html");

  async function buscar(url, opcoes = {}) {
    const resp = await fetch(url, { credentials: "include", ...opcoes });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const doc = html(await resp.text());
    if (doc.querySelector('input[name="user.login"]')) throw new Error("sessao-expirada");
    return doc;
  }

  // Reproduz o clique de um link JSF: jsfcljs(document.getElementById('form'), {param: valor}, '')
  async function clicarJsf(doc, link) {
    const m = /jsfcljs\(document\.getElementById\('([^']+)'\),\{([^}]*)\}/.exec(link.getAttribute("onclick") || "");
    if (!m) throw new Error("link sem jsfcljs");
    const proprio = link.closest("form");
    const form = proprio && proprio.id === m[1] ? proprio : doc.getElementById(m[1]);
    const corpo = new URLSearchParams();
    // form.elements inclui campos associados ao form mesmo fora dele no DOM (caso da UFMA)
    const campos = new Set([...form.elements, ...form.querySelectorAll("input[name]")]);
    if (![...campos].some((c) => c.name)) {
      // form vazio: pega os campos soltos da turma (idTurma no <td> e o hidden com o nome do form)
      link.closest("td")?.querySelectorAll("input[name]").forEach((c) => campos.add(c));
      doc.querySelectorAll(`input[name="${CSS.escape(m[1])}"]`).forEach((c) => campos.add(c));
    }
    for (const input of campos) if (input.name && input.tagName === "INPUT") corpo.append(input.name, input.value);
    if (!corpo.has("javax.faces.ViewState")) {
      const vs = doc.querySelector('input[name="javax.faces.ViewState"]');
      if (vs) corpo.append(vs.name, vs.value);
    }
    for (const p of m[2].matchAll(/'([^']*)':'([^']*)'/g)) corpo.set(p[1], p[2]);
    return buscar(new URL(form.getAttribute("action"), location.origin), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo,
    });
  }

  function lerFrequencia(doc) {
    const texto = (doc.querySelector("#conteudo") || doc.body).textContent;
    // UEMA: "Mapa de Frequência"; UFMA: "Mapa de Freqüências"
    if (!/Mapa de Freq/i.test(texto)) throw new Error("página de frequência não reconhecida");
    const num = (re) => {
      const m = re.exec(texto);
      return m ? parseFloat(m[1].replace(",", ".")) : null;
    };
    const presencas = num(/Frequ[eê]ncia:\s*(\d+)/);
    const ministradas = num(/Aulas Ministradas:\s*(\d+)/);
    let somaLinhas = 0; // laço simples: o SIGAA carrega o Prototype.js, que reescreve Array#reduce
    for (const m of texto.matchAll(/(\d+)\s*Falta\(s\)/g)) somaLinhas += Number(m[1]);
    // UFMA não mostra CH nem aulas ministradas, mas já traz o total e o máximo de faltas
    const totalFaltas = num(/Total de Faltas:\s*(\d+)/);
    let registros = 0;
    for (const _ of texto.matchAll(/Presente|\d+\s*Falta\(s\)/g)) registros++;
    return {
      maxFaltas: num(/ximo de Faltas Permitido:\s*(\d+)/),
      registros,
      presencas,
      ministradas,
      ch: num(/CH do Componente:\s*(\d+)/),
      minimo: num(/superior a\s*([\d.,]+)\s*%/) || 75,
      faltas: presencas != null && ministradas != null ? ministradas - presencas : totalFaltas ?? somaLinhas,
    };
  }

  function dadosDoAluno(doc) {
    const texto = doc.body.innerText || doc.body.textContent;
    const nome = doc.querySelector("p.usuario span");
    return {
      nome: nome ? nome.textContent.trim() : null,
      matricula: (/Matr[ií]cula:\s*(\d+)/.exec(texto) || [])[1] || null,
      semestre: (/Semestre atual:\s*([\d.]+)/.exec(texto) || [])[1] || null,
    };
  }

  async function sincronizar(aoProgredir) {
    let portal = await buscar(PORTAL);
    const total = portal.querySelectorAll(LINK_TURMA).length;
    const turmas = [];

    for (let i = 0; i < total; i++) {
      // cada entrada numa turma muda o estado da sessão; volta ao portal antes da próxima
      if (i > 0) portal = await buscar(PORTAL);
      const link = portal.querySelectorAll(LINK_TURMA)[i];
      const linha = link.closest("tr");
      const turma = {
        id: idDaTurma(link) || String(i),
        nome: link.textContent.trim(),
        horario: linha.cells[2] ? linha.cells[2].textContent.trim() : "",
      };
      aoProgredir(i + 1, total, turma.nome);
      try {
        const ava = await clicarJsf(portal, link);
        const item = [...ava.querySelectorAll("#formMenu div.itemMenu")].find(
          (d) => d.textContent.trim() === "Frequência"
        );
        if (!item) turma.ch = 0;
        else Object.assign(turma, lerFrequencia(await clicarJsf(ava, item.closest("a"))));
      } catch (e) {
        if (e.message === "sessao-expirada") throw e;
        turma.erro = e.message;
      }
      turmas.push(turma);
    }

    return { ...dadosDoAluno(document), origem: location.origin, atualizadoEm: Date.now(), turmas };
  }

  // ------------------------------------------------------------ barra acima da tabela de turmas

  const url = (caminho) => chrome.runtime.getURL(caminho);

  const barra = document.createElement("div");
  barra.className = "qf-barra";
  barra.innerHTML = `
    <img class="qf-barra-icone" src="${url("icones/32.png")}" alt="">
    <strong class="qf-barra-titulo">Quanto<span>Falta?</span></strong>
    <span class="qf-status">carregando…</span>
    <span class="qf-barra-acoes">
      <button type="button" class="qf-bbtn" data-acao="atualizar">Atualizar</button>
      <button type="button" class="qf-bbtn qf-bbtn-primario" data-acao="painel">Abrir painel</button>
    </span>`;
  const tabelaTurmas = quadro.querySelector(LINK_TURMA).closest("table");
  tabelaTurmas.parentNode.insertBefore(barra, tabelaTurmas);
  const status = barra.querySelector(".qf-status");
  const botaoPainel = barra.querySelector('[data-acao="painel"]');

  // ------------------------------------------------------------ minipainel flutuante
  // Fica num shadow root para o CSS do SIGAA não interferir (e vice-versa).

  const host = document.createElement("div");
  host.id = "quantofalta";
  const sombra = host.attachShadow({ mode: "open" });
  sombra.innerHTML = `
    <link rel="stylesheet" href="${url("qf.css")}">
    <link rel="stylesheet" href="${url("painel-site.css")}">
    <section class="qf-raiz qf-flutuante" hidden>
      <header class="qf-cab">
        <img class="qf-logo" src="${url("icones/128.png")}" alt="">
        <div>
          <p class="qf-marca">Quanto<span>Falta?</span></p>
          <p class="qf-meta"></p>
        </div>
        <div class="qf-acoes">
          <button type="button" class="qf-btn" data-acao="expandir">Expandir</button>
          <button type="button" class="qf-btn qf-btn-icone" data-acao="fechar" title="Fechar" aria-label="Fechar">×</button>
        </div>
      </header>
      <div class="qf-chips"></div>
      <ul class="qf-lista"></ul>
      <div class="qf-grade"></div>
      <p class="qf-vazio" hidden>Buscando suas faltas…</p>
    </section>`;
  document.body.appendChild(host);
  const painel = sombra.querySelector(".qf-flutuante");
  const painelMeta = sombra.querySelector(".qf-meta");
  const botaoExpandir = sombra.querySelector('[data-acao="expandir"]');

  let dadosAtuais = null;
  let progresso = null; // texto "atualizando 3/10…" enquanto sincroniza

  function hora(ms) {
    return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function desenharSelos(turmas) {
    quadro.querySelectorAll(".qf-selo-tabela").forEach((s) => s.remove());
    const porId = new Map(turmas.map((t) => [t.id, t]));
    for (const link of quadro.querySelectorAll(LINK_TURMA)) {
      const id = idDaTurma(link);
      const t = porId.get(id);
      if (!t) continue;
      const selo = document.createElement("span");
      selo.className = `qf-selo-tabela qf-t-${t.situacao}`;
      if (t.limite != null) {
        selo.textContent = `${t.faltas}/${t.limite} faltas`;
        selo.title = t.restam >= 0 ? `Pode faltar mais ${t.restam} aula(s)` : "Passou do limite de faltas";
      } else {
        selo.textContent = QF.ROTULO[t.situacao];
      }
      link.insertAdjacentElement("afterend", selo);
    }
  }

  function desenhar() {
    const turmas = dadosAtuais ? QF.ordenar(dadosAtuais.turmas) : [];

    if (progresso) status.textContent = progresso;
    else if (!dadosAtuais) status.textContent = "ainda não atualizado";
    else {
      const risco = turmas.filter((t) => t.situacao === "perigo" || t.situacao === "reprovado").length;
      status.textContent =
        `atualizado às ${hora(dadosAtuais.atualizadoEm)}` + (risco ? ` · ${risco} disciplina(s) perto do limite` : "");
    }
    desenharSelos(turmas);

    const expandido = painel.classList.contains("qf-expandido");
    painelMeta.textContent = progresso ||
      (dadosAtuais ? (expandido ? QF.meta(dadosAtuais) : `atualizado ${QF.haQuanto(dadosAtuais.atualizadoEm)}`) : "");
    sombra.querySelector(".qf-vazio").hidden = turmas.length > 0;
    sombra.querySelector(".qf-chips").innerHTML = turmas.length ? QF.htmlResumo(turmas) : "";
    sombra.querySelector(".qf-lista").innerHTML = expandido ? "" : QF.htmlLista(turmas);
    sombra.querySelector(".qf-grade").innerHTML = expandido ? QF.htmlCartoes(turmas) : "";
  }

  function aplicarEstadoPainel({ aberto, expandido }) {
    painel.hidden = !aberto;
    painel.classList.toggle("qf-expandido", !!expandido);
    botaoPainel.textContent = aberto ? "Fechar painel" : "Abrir painel";
    botaoExpandir.textContent = expandido ? "Recolher" : "Expandir";
    desenhar();
  }

  // aberto/expandido fica salvo: quem deixou o painel aberto já o vê no próximo login
  async function mudarPainel(mudanca) {
    const { painelAberto, painelExpandido } = await armazenamento.get(["painelAberto", "painelExpandido"]);
    const estado = { aberto: !!painelAberto, expandido: !!painelExpandido, ...mudanca };
    await armazenamento.set({ painelAberto: estado.aberto, painelExpandido: estado.expandido });
    aplicarEstadoPainel(estado);
  }

  // ------------------------------------------------------------ atualização

  let rodando = false;
  async function atualizar() {
    if (rodando) return;
    rodando = true;
    barra.classList.add("qf-rodando");
    await armazenamento.set({ sincronizandoDesde: Date.now() });
    let erro = null;
    try {
      const dados = await sincronizar((i, n, nome) => {
        progresso = `atualizando ${i}/${n} · ${QF.titulo(nome)}`;
        desenhar();
      });
      dadosAtuais = dados;
      await armazenamento.set({ dados, precisaAtualizar: false });
    } catch (e) {
      erro = e.message === "sessao-expirada" ? "sessão expirou — faça login de novo" : `erro ao atualizar (${e.message})`;
    } finally {
      progresso = null;
      await armazenamento.remove("sincronizandoDesde");
      barra.classList.remove("qf-rodando");
      rodando = false;
    }
    desenhar();
    if (erro) status.textContent = erro;
  }

  barra.addEventListener("click", (ev) => {
    const acao = ev.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "atualizar") atualizar();
    if (acao === "painel") mudarPainel({ aberto: painel.hidden });
  });

  sombra.addEventListener("click", (ev) => {
    const acao = ev.target.closest("[data-acao]")?.dataset.acao;
    if (acao === "fechar") mudarPainel({ aberto: false });
    if (acao === "expandir") mudarPainel({ expandido: !painel.classList.contains("qf-expandido") });
  });

  // outra aba do SIGAA atualizou -> reflete aqui também
  chrome.storage.onChanged.addListener((mudancas, area) => {
    if (area === "local" && mudancas.dados && !rodando) {
      dadosAtuais = mudancas.dados.newValue || null;
      desenhar();
    }
  });

  (async () => {
    const salvo = await armazenamento.get([
      "dados", "precisaAtualizar", "sincronizandoDesde", "painelAberto", "painelExpandido",
    ]);
    const meu = dadosDoAluno(document);
    // dados de outra pessoa que usou este Chrome não aparecem
    const dados = salvo.dados;
    dadosAtuais = dados && (!dados.matricula || dados.matricula === meu.matricula) ? dados : null;
    aplicarEstadoPainel({ aberto: !!salvo.painelAberto, expandido: !!salvo.painelExpandido });

    const pedido = location.hash === "#qf-atualizar";
    const velho = !dadosAtuais || Date.now() - dadosAtuais.atualizadoEm > ATUALIZAR_A_CADA_MIN * 60000;
    const outraAba = salvo.sincronizandoDesde && Date.now() - salvo.sincronizandoDesde < TRAVA_MAX_MIN * 60000;
    if (pedido || ((salvo.precisaAtualizar || velho) && !outraAba)) atualizar();
  })();
})();
