const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const contexto = {
  Date,
  Intl,
  console,
};
vm.createContext(contexto);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "..", "extensao", "comum.js"), "utf8"),
  contexto
);

const calcular = (notas) => contexto.QF.calcularNotas(notas);

assert.deepEqual(
  JSON.parse(JSON.stringify(calcular([10, null, null]))),
  {
    notas: [10, null, null],
    lancadas: 1,
    restantes: 2,
    direto: 5.5,
    diretoPossivel: true,
    provaFinal: 2.5,
    provaFinalPossivel: true,
  }
);

assert.equal(calcular([7, 7, null]).direto, 7);
assert.equal(calcular([7, 7, null]).provaFinal, 1);
assert.equal(calcular([5, 5, null]).diretoPossivel, false);
assert.equal(calcular([5, 5, null]).provaFinal, 5);
assert.equal(calcular([0, 0, null]).provaFinalPossivel, false);

assert.equal(calcular([7, 7, 7]).situacao, "aprovado");
assert.equal(calcular([5, 5, 5]).notaFinal, 5);
assert.equal(calcular([6.9, 6.9, 6.9]).notaFinal, 3.1);
assert.equal(calcular([4.9, 5, 5]).situacao, "reprovado-nota");

console.log("Cálculos de notas: OK");
