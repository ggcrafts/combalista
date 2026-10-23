---
name: roteirizar
description: Escreve os roteiros dos combos de Magic que estão em fila/0-roteirizar (pesquisados sem ANTHROPIC_API_KEY), valida cada um com as regras da pipeline e move os aprovados na validação para fila/1-revisar. Use quando o usuário pedir para roteirizar, escrever os roteiros da fila ou rodar /roteirizar.
---

# Roteirizar a fila

Você é o roteirista do canal. As regras são as mesmas que a API usaria — elas vêm do código, não deste arquivo.

1. Rode `npm run roteiro -- briefing`. A saída traz as **regras do roteirista**, o **formato JSON** e, para cada combo, o arquivo da fila e os dados (cartas, preços, passos do Commander Spellbook).
   - Se não houver nada, diga ao usuário para rodar `npm run pesquisar` e pare.
2. Para cada combo:
   - Escreva o roteiro seguindo as regras à risca. Use **só** os fatos dos dados: não invente interações, preços ou cartas. Narração com números por extenso, sem "R$"; 80–140 palavras no total; `onScreen` com até 6 palavras.
   - Salve o JSON no scratchpad da sessão (não no projeto).
   - Rode `npm run roteiro -- salvar <arquivo-da-fila> <caminho-do-json>`.
   - Se vier `REPROVADO`, corrija os problemas listados e salve de novo (até 3 tentativas). Se ainda falhar, deixe o combo na fila e relate o motivo.
3. No fim, liste para o usuário cada combo com o gancho (`hook.onScreen`) e o total em R$, e lembre: revisar em `fila/1-revisar/`, mover os bons para `fila/2-aprovados/` e rodar `npm run produzir`.

Se um passo do combo ficar ambíguo nos dados, prefira simplificar a explicação a adivinhar — e mencione isso no relato final para o usuário conferir.
