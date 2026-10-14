// Cálculo e HTML dos painéis, compartilhado entre o popup e o minipainel do SIGAA.
// Script clássico: expõe tudo em `QF`.
var QF = (() => {
  const PORTAL_URL = "https://sis.sig.uema.br/sigaa/portais/discente/discente.jsf";

  // "45T56" -> 2 encontros/semana de 2 aulas; "2T34 4T12" -> 2 encontros de 2 aulas
  function aulasPorEncontro(horario) {
    let aulas = 0, encontros = 0;
    for (const m of (horario || "").matchAll(/(\d+)[MTN](\d+)/g)) {
      encontros += m[1].length;
      aulas += m[1].length * m[2].length;
    }
    return encontros ? aulas / encontros : null;
  }

  // Completa uma turma lida do SIGAA com limite, saldo e situação.
  function calcular(t) {
    const r = { ...t };
    if (t.erro) return { ...r, situacao: "erro" };
    if (!t.ch) return { ...r, situacao: "sem-frequencia" };

    r.limite = t.ch - Math.ceil((t.ch * (t.minimo || 75)) / 100);
    r.restam = r.limite - t.faltas;
    const porEncontro = aulasPorEncontro(t.horario);
    r.diasRestantes = porEncontro && r.restam >= 0 ? Math.floor(r.restam / porEncontro) : null;
    r.uso = r.limite > 0 ? t.faltas / r.limite : 0;

    if (!t.ministradas && !t.faltas) r.situacao = "sem-aulas";
    else if (r.restam < 0) r.situacao = "reprovado";
    else if (r.uso >= 0.75) r.situacao = "perigo";
    else if (r.uso >= 0.5) r.situacao = "atencao";
    else r.situacao = "ok";
    return r;
  }

  // A UEMA usa três notas: média 7 aprova direto; média entre 5 e 7 dá
  // direito à prova final; depois dela, (média da disciplina + final) / 2 >= 5.
  // A segunda chamada ocupa o lugar da avaliação que o aluno não realizou.
  function calcularNotas(valores) {
    const notas = Array.from({ length: 3 }, (_, i) => {
      const n = valores && valores[i];
      return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null;
    });
    const lancadas = notas.filter((n) => n != null);
    const restantes = 3 - lancadas.length;
    const soma = lancadas.reduce((total, n) => total + n, 0);
    const paraCima = (n) => Math.max(0, Math.ceil((n - 1e-9) * 10) / 10);

    if (restantes) {
      const porAvaliacao = (total) => paraCima((total - soma) / restantes);
      const direto = porAvaliacao(21);
      const provaFinal = porAvaliacao(15);
      return {
        notas, lancadas: lancadas.length, restantes,
        direto, diretoPossivel: direto <= 10,
        provaFinal, provaFinalPossivel: provaFinal <= 10,
      };
    }

    const media = Math.round((soma / 3) * 100) / 100;
    if (media >= 7) return { notas, lancadas: 3, restantes: 0, media, situacao: "aprovado" };
    if (media >= 5) {
      return { notas, lancadas: 3, restantes: 0, media, situacao: "final", notaFinal: paraCima(10 - media) };
    }
    return { notas, lancadas: 3, restantes: 0, media, situacao: "reprovado-nota" };
  }

  const ORDEM = { reprovado: 0, perigo: 1, atencao: 2, ok: 3, "sem-aulas": 4, "sem-frequencia": 5, erro: 6 };

  const ROTULO = {
    reprovado: "Reprovado por falta",
    perigo: "Perigo",
    atencao: "Atenção",
    ok: "Tranquilo",
    "sem-aulas": "Sem aulas lançadas",
    "sem-frequencia": "Sem frequência",
    erro: "Não consegui ler",
  };

  function ordenar(turmas) {
    return turmas.map(calcular)
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao] || (b.uso || 0) - (a.uso || 0));
  }

  // ------------------------------------------------------------ texto

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  function titulo(nome) {
    return String(nome || "").toLowerCase()
      .replace(/(^|\s)(\p{L})/gu, (m, esp, l) => esp + l.toUpperCase())
      .replace(/\s(De|Da|Do|Das|Dos|E)(?=\s)/g, (m) => m.toLowerCase());
  }

  function haQuanto(ms) {
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return "agora mesmo";
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h} h`;
    return new Date(ms).toLocaleDateString("pt-BR");
  }

  function meta(dados) {
    return [
      dados.matricula && `Matrícula ${dados.matricula}`,
      dados.semestre && dados.semestre,
      `atualizado ${haQuanto(dados.atualizadoEm)}`,
    ].filter(Boolean).join(" · ");
  }

  function selo(t) {
    return t.limite != null ? `${t.faltas}/${t.limite}` : "—";
  }

  function detalhe(t) {
    if (t.situacao === "sem-frequencia") return "Sem controle de frequência no SIGAA.";
    if (t.situacao === "erro") return `Não consegui ler a frequência (${esc(t.erro)}).`;
    if (t.situacao === "sem-aulas") return `Professor ainda não lançou frequência. Limite: ${t.limite} faltas.`;
    if (t.restam < 0) return `Passou ${-t.restam} falta(s) do limite.`;
    const dias = t.diasRestantes != null ? ` (≈ ${t.diasRestantes} dia${t.diasRestantes === 1 ? "" : "s"})` : "";
    return `Pode faltar mais <b>${t.restam}</b> aula${t.restam === 1 ? "" : "s"}${dias}.`;
  }

  function numero(n) {
    return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  function htmlNotas(t) {
    const calculo = calcularNotas(t.notas);
    if (!calculo.lancadas) return "";
    const valores = calculo.notas.map((n, i) =>
      `<span class="qf-nota-valor"><small>N${i + 1}</small><b>${n == null ? "—" : numero(n)}</b></span>`).join("");
    let mensagem;

    if (calculo.restantes) {
      const alvo = calculo.restantes === 1 ? "na avaliação restante ou 2ª chamada" : "em cada avaliação restante";
      if (calculo.diretoPossivel) {
        mensagem = `Precisa de <b>${numero(calculo.direto)}</b> ${alvo} para passar direto.`;
      } else {
        mensagem = "A aprovação direta já não é possível com as notas lançadas.";
      }
      if (calculo.provaFinalPossivel) {
        mensagem += ` Para chegar à prova final, precisa de <b>${numero(calculo.provaFinal)}</b> ${alvo}.`;
      } else {
        mensagem += " Mesmo com 10, não alcança a média mínima para a prova final.";
      }
    } else if (calculo.situacao === "aprovado") {
      mensagem = `Média <b>${numero(calculo.media)}</b>: aprovado por média.`;
    } else if (calculo.situacao === "final") {
      mensagem = `Média <b>${numero(calculo.media)}</b>: precisa de <b>${numero(calculo.notaFinal)}</b> na prova final.`;
    } else {
      mensagem = `Média <b>${numero(calculo.media)}</b>: abaixo da média mínima para fazer a prova final.`;
    }

    return `<section class="qf-notas"><div class="qf-notas-valores">${valores}</div><p>${mensagem}</p></section>`;
  }

  // ------------------------------------------------------------ blocos de HTML

  function htmlResumo(turmas) {
    const cont = {};
    let totalFaltas = 0;
    for (const t of turmas) {
      cont[t.situacao] = (cont[t.situacao] || 0) + 1;
      totalFaltas += t.faltas || 0;
    }
    return [
      `<span class="qf-chip"><b>${totalFaltas}</b> faltas</span>`,
      ...["reprovado", "perigo", "atencao", "ok"].filter((s) => cont[s]).map((s) =>
        `<span class="qf-chip qf-s-${s}"><i></i><b>${cont[s]}</b> ${esc(ROTULO[s].toLowerCase())}</span>`),
    ].join("");
  }

  // Lista enxuta: nome + selo colorido
  function htmlLista(turmas) {
    return turmas.map((t) => `
      <li class="qf-linha qf-s-${t.situacao}" title="${esc(ROTULO[t.situacao])}">
        <span class="qf-nome">${esc(titulo(t.nome))}</span>
        <span class="qf-selo">${selo(t)}</span>
      </li>`).join("");
  }

  // Cartões com detalhe
  function htmlCartoes(turmas) {
    return turmas.map((t) => {
      const temNumero = t.limite != null;
      const pct = temNumero && t.limite > 0 ? Math.min(100, Math.round((t.faltas / t.limite) * 100)) : 0;
      const presenca = t.ministradas ? Math.round((t.presencas / t.ministradas) * 100) : null;
      const rodape = [
        t.horario && `<span>${esc(t.horario)}</span>`,
        presenca != null && `<span>${presenca}% de presença · ${t.ministradas} aulas dadas</span>`,
      ].filter(Boolean).join("");
      return `
        <article class="qf-cartao qf-s-${t.situacao}">
          <div class="qf-cartao-topo">
            <h3>${esc(titulo(t.nome))}</h3>
            <span class="qf-pilula">${esc(ROTULO[t.situacao])}</span>
          </div>
          ${temNumero ? `
            <p class="qf-numero"><b>${t.faltas}</b> de ${t.limite} faltas</p>
            <div class="qf-barra"><i style="width:${pct}%"></i></div>` : ""}
          <p class="qf-detalhe">${detalhe(t)}</p>
          ${htmlNotas(t)}
          ${rodape ? `<p class="qf-rodape">${rodape}</p>` : ""}
        </article>`;
    }).join("");
  }

  return { PORTAL_URL, calcular, calcularNotas, ordenar, aulasPorEncontro, ROTULO, esc, titulo, haQuanto,
    meta, selo, htmlResumo, htmlLista, htmlCartoes };
})();
