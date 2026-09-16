// Keep the OFX posting request in one canonical, testable shape.
// This module never logs bank transactions, identifiers or descriptions.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildOfxPostingPayload(selected, choices) {
  if (!Array.isArray(selected) || selected.length < 1 || selected.length > 100) {
    throw new Error('Selecione entre 1 e 100 movimentações para lançar.');
  }
  const seen = new Set();
  return selected.map(item => {
    const transactionId = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!UUID.test(transactionId)) {
      throw new Error('Uma movimentação veio sem identificador válido. Atualize a lista do OFX antes de tentar novamente.');
    }
    if (seen.has(transactionId.toLowerCase())) {
      throw new Error('A mesma movimentação foi selecionada mais de uma vez. Atualize a lista do OFX.');
    }
    seen.add(transactionId.toLowerCase());
    const choice = choices?.[item.id] || {};
    const entryType = choice.entryType;
    if ((entryType !== 'revenue' && entryType !== 'expense') ||
        (entryType === 'revenue' && Number(item.amount) <= 0) ||
        (entryType === 'expense' && Number(item.amount) >= 0)) {
      throw new Error('Revise o tipo de lançamento das movimentações selecionadas.');
    }
    const description = String(choice.description ?? item.description ?? '').trim();
    if (!description || description.length > 300) {
      throw new Error('Revise as descrições dos lançamentos selecionados.');
    }
    const categoryId = choice.categoryId || null;
    if (categoryId !== null && (typeof categoryId !== 'string' || !UUID.test(categoryId))) {
      throw new Error('Uma categoria selecionada não tem identificador válido. Atualize a lista do OFX.');
    }
    return { transactionId, entryType, categoryId, description };
  });
}

export function explainOfxPostingError(error) {
  const message = error?.message || error?.error_description || 'Não foi possível registrar os lançamentos.';
  if (/Identificador de movimentação inválido/i.test(message)) {
    return 'O banco recusou o formato de identificação enviado, embora a Central tenha validado a seleção. Nenhum lançamento foi confirmado. Atualize a página e tente uma única movimentação; se persistir, informe o código OFX-ID-SERVER ao suporte.';
  }
  return message;
}
