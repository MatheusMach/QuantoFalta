const $ = (id) => document.getElementById(id);

function desenhar(dados) {
  const tem = dados && dados.turmas && dados.turmas.length;
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

chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === "local" && mudancas.dados) desenhar(mudancas.dados.newValue);
});
chrome.storage.local.get("dados").then(({ dados }) => desenhar(dados));
