(function () {
  const validTypes = new Set(['single', 'multiple', 'matching', 'ordering']);

  function normalizeBank(input) {
    const questions = Array.isArray(input) ? input : input && Array.isArray(input.questions) ? input.questions : null;
    if (!questions) return { ok: false, questions: [], errors: ['The JSON must be an array or an object containing a questions array.'] };
    const errors = [];
    const ids = new Set();

    questions.forEach((q, index) => {
      const label = `Question ${index + 1}`;
      if (!q || typeof q !== 'object' || Array.isArray(q)) { errors.push(`${label} must be an object.`); return; }
      if (q.id === undefined || q.id === null || String(q.id).trim() === '') errors.push(`${label} is missing an id.`);
      else if (ids.has(String(q.id))) errors.push(`${label} has a duplicate id (${q.id}).`);
      else ids.add(String(q.id));
      if (typeof q.question !== 'string' || !q.question.trim()) errors.push(`${label} is missing question text.`);
      if (!validTypes.has(q.type)) errors.push(`${label} has an unsupported type. Use single, multiple, matching, or ordering.`);
      if (q.incomplete === true) return;
      if (q.type === 'single' || q.type === 'multiple') {
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.some(x => typeof x !== 'string')) errors.push(`${label} needs at least two text options.`);
        if (!Array.isArray(q.correctAnswers) || q.correctAnswers.length === 0 || q.correctAnswers.some(n => !Number.isInteger(n) || n < 0 || n >= (q.options || []).length)) errors.push(`${label} needs valid zero-based correctAnswers indexes.`);
        if (q.type === 'single' && Array.isArray(q.correctAnswers) && q.correctAnswers.length !== 1) errors.push(`${label} is single choice and must have exactly one correct answer.`);
      }
      if (q.type === 'matching') {
        if (!Array.isArray(q.pairs) || q.pairs.length < 1) errors.push(`${label} needs a pairs array.`);
        else q.pairs.forEach((pair, pairIndex) => {
          if (!pair || typeof pair.left !== 'string' || !Array.isArray(pair.options) || pair.options.length < 1 || !Number.isInteger(pair.correct) || pair.correct < 0 || pair.correct >= pair.options.length) errors.push(`${label}, match ${pairIndex + 1} needs left text, options, and a valid correct index.`);
        });
      }
      if (q.type === 'ordering') {
        const length = Array.isArray(q.items) ? q.items.length : 0;
        if (length < 2 || q.items.some(item => typeof item !== 'string')) errors.push(`${label} needs at least two text items.`);
        if (!Array.isArray(q.correctOrder) || q.correctOrder.length !== length || new Set(q.correctOrder).size !== length || q.correctOrder.some(n => !Number.isInteger(n) || n < 0 || n >= length)) errors.push(`${label} needs correctOrder as a complete zero-based index permutation.`);
      }
    });

    return { ok: errors.length === 0, questions, errors };
  }

  function makeBlankAnswer(question) {
    if (!question) return [];
    if (question.type === 'matching') return question.pairs.map(() => -1);
    if (question.type === 'ordering') return question.items.map((_, index) => index);
    return [];
  }

  function hasAnswer(question, answer) {
    if (!question || answer === undefined || answer === null) return false;
    if (question.type === 'matching') return Array.isArray(answer) && answer.length === question.pairs.length && answer.every(value => Number.isInteger(value) && value >= 0);
    if (question.type === 'ordering') return Array.isArray(answer) && answer.length === question.items.length;
    return Array.isArray(answer) && answer.length > 0;
  }

  function isCorrect(question, answer) {
    if (!hasAnswer(question, answer)) return false;
    if (question.type === 'matching') return question.pairs.every((pair, index) => answer[index] === pair.correct);
    if (question.type === 'ordering') return question.correctOrder.every((value, index) => answer[index] === value);
    const selected = [...new Set(answer)].sort((a, b) => a - b);
    const correct = [...new Set(question.correctAnswers)].sort((a, b) => a - b);
    return selected.length === correct.length && selected.every((value, index) => value === correct[index]);
  }

  function correctText(question, displayOrder) {
    if (question.type === 'matching') return question.pairs.map(pair => `${pair.left} → ${pair.options[pair.correct]}`).join('; ');
    if (question.type === 'ordering') return question.correctOrder.map(index => question.items[index]).join(' → ');
    return question.correctAnswers.map(index => {
      const displayIndex = Array.isArray(displayOrder) ? displayOrder.indexOf(index) : index;
      return `${String.fromCharCode(65 + Math.max(0, displayIndex))}. ${question.options[index]}`;
    }).join(' · ');
  }

  function answerText(question, answer, displayOrder) {
    if (!hasAnswer(question, answer)) return 'No answer';
    if (question.type === 'matching') return question.pairs.map((pair, index) => `${pair.left} → ${pair.options[answer[index]]}`).join('; ');
    if (question.type === 'ordering') return answer.map(index => question.items[index]).join(' → ');
    return answer.map(index => {
      const displayIndex = Array.isArray(displayOrder) ? displayOrder.indexOf(index) : index;
      return `${String.fromCharCode(65 + Math.max(0, displayIndex))}. ${question.options[index]}`;
    }).join(' · ');
  }

  window.NetSecureQuiz = { normalizeBank, makeBlankAnswer, hasAnswer, isCorrect, correctText, answerText };
})();
