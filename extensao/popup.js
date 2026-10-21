const $ = (id) => document.getElementById(id);

let dadosAtuais = null;
let instituicao = null;

function desenhar() {
  const inst = QF.INSTITUICOES[instituicao];
  const dados = dadosAtuais;
  // dados salvos de outro SIGAA não aparecem com esta instituição selecionada
  const daqui = dados && (!dados.origem || dados.origem === inst.origem);
  const tem = daqui && dados.turmas && dados.turmas.length;

  for (const b of document.querySelectorAll(".qf-inst button"))
    b.setAttribute("aria-pressed", String(b.dataset.inst === instituicao));
  $("entrar").href = `${inst.origem}/sigaa/verTelaLogin.do`;
  $("atualizar").href = `${inst.origem}/sigaa/portais/discente/discente.jsf#qf-atualizar`;
  $("nota").textContent = inst.nota;

  $("vazio").hidden = !!tem;
  $("atualizar").hidden = !tem;
  $("resumo").innerHTML = "";
  $("grade").innerHTML = "";
  $("aluno").textContent = "";
  $("meta").textContent = "";
  if (!tem) return;

  const turmas = QF.ordenar(dados.turmas);
  $("aluno").textContent = dados.nome ? QF.titulo(dados.nome) : "";
  $("meta").textContent = QF.meta(dados);
  $("resumo").innerHTML = QF.htmlResumo(turmas);
  $("grade").innerHTML = QF.htmlCartoes(turmas);
}

for (const b of document.querySelectorAll(".qf-inst button")) {
  b.addEventListener("click", () => {
    instituicao = b.dataset.inst;
    chrome.storage.local.set({ instituicao });
    desenhar();
  });
}

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area !== "local" || !mudancas.dados) return;
  dadosAtuais = mudancas.dados.newValue;
  desenhar();
});

chrome.storage.local.get(["dados", "instituicao"]).then(({ dados, instituicao: salva }) => {
  dadosAtuais = dados;
  // sem escolha salva: usa a do último SIGAA sincronizado, senão UFMA
  const doUltimo = Object.keys(QF.INSTITUICOES).find((k) => QF.INSTITUICOES[k].origem === dados?.origem);
  instituicao = QF.INSTITUICOES[salva] ? salva : doUltimo || "ufma";
  desenhar();
});
