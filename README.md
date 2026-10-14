<p align="center">
  <img src="imagens/puffle.png" alt="Puffle vermelho com um ponto de interrogação" width="180">
</p>

<h1 align="center">QuantoFalta?</h1>

<p align="center">
Extensão do Chrome que mostra quantas faltas você tem em cada disciplina do SIGAA,
sem precisar abrir turma por turma. Também lê as notas lançadas e calcula quanto é
necessário nas avaliações restantes, na segunda chamada e na prova final.
</p>

## Como instalar

1. Descompacte o zip e guarde a pasta `extensao` 
2. No Chrome, abre `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar expandida** e escolha a pasta `extensao`.
5. Fixe o ícone na barra: clique no quebra-cabeça 🧩 e no alfinete do QuantoFalta?.

![Página de extensões do Chrome: ligue o modo do canto superior direito e clique em Carregar expandida](imagens/chrome-extensoes.png)

![Janela "Selecione o diretório da extensão" aberta na pasta QuantoFalta, com o botão Selecionar pasta](imagens/selecionar-pasta.png)

## Como usar
é bem intuitivo 
- loga no sig normalmente
- vai ta lá clica em atualizar pra recalcular e expandir o painel caso queira ver mais detalhes 

## Cálculo das notas

O painel considera as regras do Regimento dos Cursos de Graduação da UEMA:

- média das três notas igual ou superior a 7: aprovação direta;
- média entre 5 e 7: direito à prova final;
- na prova final, a média entre a nota da disciplina e a nota da final deve ser pelo menos 5;
- a segunda chamada substitui a avaliação não realizada.

Base normativa: arts. 119, 120 e 123 da
[Resolução nº 1816/2024-CEPE/UEMA](https://dados.uema.br/wp-content/uploads/2024/07/resolucao-1816-2024-cepe-uema.pdf).

Quando ainda faltam notas, a extensão mostra a menor nota necessária em cada
avaliação restante, supondo a mesma nota em todas elas. Os cálculos são uma ajuda
e não substituem o resultado oficial do SIGAA.

## Privacidade

A extensão só lê páginas do SIGAA usando o login que você já fez no navegador, então não tem como eu roubar dado nenhum sio '-' não tem servidor  
