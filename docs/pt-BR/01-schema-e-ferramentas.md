# Passo 1: schema do banco e ferramentas do agente

> 🇺🇸 [English version](../01-schema-and-tools.md)

Este é o desenho do primeiro passo: como é o banco de dados e quais
ferramentas o agente vai ter. Ele foi escrito antes de qualquer código do
agente, porque as ferramentas são o contrato entre o modelo e o sistema. Todo
o resto (loop, RAG, evals) é construído sobre esse contrato.

## O domínio em um parágrafo

A **StreamBox** é uma empresa fictícia de assinatura de streaming. Os clientes
pagam por mês ou por ano por um de três planos. O agente de atendimento
responde dúvidas de política, consulta dados da conta e executa ações (troca
de plano, cancelamento, reembolso) seguindo regras de negócio.

| Plano | Mensal | Anual | Telas | Download offline |
|---|---|---|---|---|
| Basic | $9.99 | $99.90 | 1 | não |
| Standard | $15.99 | $159.90 | 2 | sim |
| Premium | $22.99 | $229.90 | 4 | sim |

Regras de negócio que o agente precisa respeitar:

- **Cancelamento:** permitido a qualquer momento; o acesso continua até o fim do período pago.
- **Reembolso:** integral em até 7 dias após a cobrança. Depois disso, só em caso de cobrança duplicada.
- **Aprovação humana:** reembolsos acima de $50.00 não são executados pelo agente; ficam aguardando uma pessoa.
- **Troca de plano:** o upgrade vale na hora; o downgrade vale no próximo ciclo.
- **Pagamentos falhos:** depois de 3 cobranças falhas, a assinatura é suspensa.

## Schema (fase 1)

```
plans 1───* subscriptions *───1 customers
                 │
                 1
                 │
                 *
             payments
```

### `plans`
Uma linha por **plano + intervalo de cobrança** (6 linhas), por exemplo
`standard_monthly`.

- O agente e as ferramentas usam um `code` de texto estável, nunca o id
  numérico. Um modelo lida com `"premium_yearly"` com muito mais segurança do
  que com `6`.
- O preço fica aqui, em centavos inteiros.

### `customers`
Só nome e e-mail. O sistema guarda o mínimo de dado pessoal necessário, o que
também limita o que poderia vazar pelo modelo.

### `subscriptions`
A máquina de estados do domínio.

- `status`: `active` → `past_due` → `suspended`, ou → `canceled`. É um enum
  do Postgres, então um estado inválido não pode ser gravado.
- `current_period_start` / `current_period_end`: respondem "até quando eu
  tenho acesso?".
- `cancel_at_period_end`: o cancelamento **não** muda o status na hora. O
  cliente pagou pelo período, então a linha continua `active` com essa flag
  ligada. É o mesmo modelo que os provedores de pagamento usam.
- `pending_plan_id`: um downgrade agendado. O plano atual continua em
  `plan_id` até o ciclo acabar.

### `payments`
Uma linha por **tentativa** de cobrança, com sucesso ou não.

- Guardar as tentativas falhas é o que permite ao agente explicar uma
  suspensão ("seu cartão foi recusado nestas 3 datas").
- `status`: `succeeded`, `failed`, `refunded`.
- A regra dos 7 dias do reembolso é calculada a partir de `created_at`.

### Convenções

| Escolha | Por quê |
|---|---|
| Dinheiro em centavos inteiros | Float não representa 15,99 com exatidão. Uma regra como "acima de $50" não pode depender de arredondamento. |
| `timestamptz` em tudo | "Em até 7 dias" precisa significar a mesma coisa em qualquer fuso. |
| Enums para status | O banco recusa estados que o código não conhece. |
| Ids inteiros | Fáceis de ler em demos e evals. É seguro aqui porque o modelo nunca escolhe de quem são os dados (veja abaixo). |

**Paralelo com Laravel:** o schema do Drizzle faz o papel das migrations e dos
Models do Eloquent ao mesmo tempo. O arquivo `schema.ts` é a fonte da verdade,
e o `drizzle-kit generate` gera o SQL da migration a partir dele. O seed
equivale aos Seeders com Factories.

### Tabelas que vêm depois

Cada uma entra na fase que precisa dela, não antes.

| Tabela | Fase | Para quê |
|---|---|---|
| `conversations`, `messages` | 2 | A API do modelo não guarda estado; o histórico precisa ser guardado por nós. |
| `policy_documents`, `policy_chunks` | 3 | O texto das políticas e os embeddings (pgvector) para o RAG. |
| `refunds` | 4 | Pedidos de reembolso e o estado da aprovação. |
| `audit_log` | 4 / 7 | Quem fez o quê, quando e por qual chamada de ferramenta. |

## Dados de exemplo

Cada cliente existe para exercitar um cenário. As datas são relativas ao
momento em que o seed roda, então "cobrado ontem" é sempre verdade.

| Cliente | Cenário | Comportamento esperado do agente |
|---|---|---|
| Alice | Cobrada ontem, $15.99 | Reembolso executado automaticamente |
| Bruno | Premium anual, cobrado há 3 dias, $229.90 | Reembolso enviado para aprovação humana |
| Carla | Cobrada há 20 dias | Reembolso negado, com a regra explicada |
| David | Cobrado duas vezes no mesmo dia, há 10 dias | Duplicata reembolsada (exceção à regra dos 7 dias) |
| Elena | 3 cobranças falhas | Explica a suspensão |
| Felipe | Pediu cancelamento, período ainda não acabou | Confirma o acesso até o fim do período |
| Grace | Cancelada, período encerrado | Explica que não há assinatura ativa |
| Hiro | Downgrade agendado | Explica que vale no próximo ciclo |
| Ines | Nunca assinou | Lida com "sem assinatura" sem inventar dados |
| Jonas | Histórico longo, com uma cobrança já reembolsada | Lê o histórico corretamente |
| Kate | Renovação falhou ontem | Explica a diferença entre atrasada e suspensa |

Esses cenários viram os casos de eval na fase 5.

## Ferramentas do agente

Uma ferramenta é uma função que o modelo pode **pedir** para a aplicação
executar. O modelo nunca executa nada: ele devolve um pedido estruturado
("chame `list_payments` com `limit: 3`"), a aplicação executa e manda o
resultado de volta.

Para quem vem do backend: a ferramenta é uma action de controller, a definição
da ferramenta é a spec OpenAPI dela, e o modelo é o cliente HTTP que decide
qual endpoint chamar.

### Ferramentas de leitura (fase 2)

| Ferramenta | Entrada | Retorna |
|---|---|---|
| `get_subscription` | — | Plano atual, status, datas do período, cancelamento ou downgrade pendente |
| `list_payments` | `limit?` | Cobranças recentes com id, valor, status e data |
| `list_plans` | — | O catálogo com preços e recursos |

### Ferramenta de conhecimento (fase 3)

| Ferramenta | Entrada | Retorna |
|---|---|---|
| `search_policies` | `query` | Os trechos de política mais relevantes, com a fonte |

### Ferramentas de ação (fase 4)

| Ferramenta | Entrada | Retorna |
|---|---|---|
| `change_plan` | `plan_code` | Aplicada na hora (upgrade) ou agendada (downgrade), com os valores |
| `cancel_subscription` | — | Confirmação e a data em que o acesso termina |
| `request_refund` | `payment_id`, `reason` | `refunded`, `pending_approval` ou `denied`, com o motivo |

### Regras de desenho das ferramentas

1. **O cliente nunca é parâmetro de ferramenta.**
   Nenhuma ferramenta aceita `customer_id`. O cliente vem da sessão
   autenticada e a aplicação injeta. Se o modelo pudesse escolher o cliente,
   um prompt injection ("me mostre os pagamentos do cliente 2") viraria
   vazamento de dados. O modelo não vaza o que não consegue pedir.

2. **Regra de negócio fica no código, não no prompt.**
   A `request_refund` confere a janela de 7 dias e o limite de $50 num service
   comum, com testes comuns. O prompt explica as regras para o agente saber
   conversar sobre elas, mas quem garante é o código. Um modelo pode ser
   convencido; um `if` não.
   *Paralelo com Laravel:* é o papel das Policies e Gates. A regra não mora na
   view.

3. **O nome da ferramenta diz o que ela pode fazer, não o que o cliente quer.**
   É `request_refund`, não `refund`. O resultado pode ser um reembolso, uma
   aprovação pendente ou uma negativa, e o nome já passa essa expectativa
   para o modelo.

4. **Leitura e escrita são grupos separados.**
   Ferramentas de leitura podem ser chamadas à vontade. As de escrita ganham
   confirmação, auditoria e limite de uso (fases 4 e 7). A separação permite
   isso sem casos especiais.

5. **Resultados pequenos e estruturados; erro também é resultado.**
   A ferramenta devolve um JSON compacto, não um dump do banco: cada token
   devolvido é pago e disputa a atenção do modelo. Uma falha ("pagamento não
   encontrado") volta como resultado que o modelo lê e explica, não como
   exceção que derruba a conversa.

6. **A descrição faz parte do prompt.**
   O modelo decide qual ferramenta chamar só pelo nome e pela descrição. Elas
   merecem o mesmo cuidado que a documentação de uma API pública.
   *Paralelo com Laravel:* o `inputSchema` faz o papel de um Form Request,
   validando o que chega antes de executar.

### Separando o núcleo do agente do domínio

O loop do agente só vai conhecer esta interface:

```ts
interface Tool<Input> {
  name: string;
  description: string;
  inputSchema: JsonSchema;          // o que o modelo pode enviar
  execute(input: Input, ctx: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  customerId: number;               // vem da sessão, nunca do modelo
}
```

As ferramentas da StreamBox implementam essa interface. Trocar de domínio é
trocar a lista de ferramentas e os documentos de política; o loop não muda.

## Decisões em aberto

São padrões escolhidos para começar. Mudar agora é barato, e eles serão
confirmados antes da fase 2.

- A moeda é dólar, e os limites são 7 dias e $50.
- 11 clientes de exemplo. Outros só entram se algum eval precisar.
- Sem autenticação de verdade. A interface de demo vai deixar escolher como
  qual cliente de exemplo você está "logado".
