(function () {
  const EXPECTED_QUESTIONS = 153;
  const PASS_MARK = 70;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const app = $('#app');
  const storage = window.NetSecureStorage;
  const quiz = window.NetSecureQuiz;
  const state = {
    view: 'dashboard', questions: [], expectedCount: EXPECTED_QUESTIONS,
    attempts: Array.isArray(storage.getAttempts()) ? storage.getAttempts() : [], bookmarks: Array.isArray(storage.getBookmarks()) ? storage.getBookmarks() : [],
    preferences: storage.getPreferences(), practiceStats: storage.getPractice() && typeof storage.getPractice() === 'object' ? storage.getPractice() : {},
    exam: null, practice: null, revision: { topic: 'all', order: [], index: 0, revealed: false }, result: null, searchTerm: '', timer: null, remaining: 0
  };
  const titles = {
    dashboard: 'Overview', 'exam-setup': 'Exam simulator', 'practice-setup': 'Practice lab',
    revision: 'Exam revision', analytics: 'Learning analytics', history: 'Attempt history', bookmarks: 'Saved questions',
    exam: 'Exam in progress', practice: 'Practice session', result: 'Exam results', search: 'Search questions'
  };

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function number(value) { return new Intl.NumberFormat('en-US').format(value || 0); }
  function pct(value) { return `${Math.round(Number(value) || 0)}%`; }
  function dateLabel(value) {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
  }
  function shortDate(value) {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  }
  function formatDuration(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  }
  function getQuestion(id) { return state.questions.find(question => String(question.id) === String(id)); }
  function getNumericQuestionId(question) {
    const id = Number(question && question.id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }
  function getIncompleteQuestions() { return state.questions.filter(question => question.incomplete === true); }
  function isBookmarked(id) { return state.bookmarks.some(value => String(value) === String(id)); }
  function safeImage(image) {
    const src = typeof image === 'string' ? image : image && image.src;
    if (!src || typeof src !== 'string') return null;
    if (/^(https?:\/\/|\.\.?\/|\/|data:image\/(png|jpeg|jpg|gif|webp);base64,)/i.test(src)) return src;
    return null;
  }
  function toast(message, error = false) {
    const node = document.createElement('div');
    node.className = `toast${error ? ' error' : ''}`;
    node.textContent = message;
    $('#toast-region').append(node);
    window.setTimeout(() => node.remove(), 3800);
  }
  function saveAttempts() { if (!storage.saveAttempts(state.attempts)) toast('Could not save this attempt. Browser storage may be full.', true); }
  function saveBookmarks() { if (!storage.saveBookmarks(state.bookmarks)) toast('Could not save bookmarks in this browser.', true); }
  function updateSidebar() {
    const count = state.questions.length;
    $('#sidebar-bank-count').textContent = `${number(count)} / ${number(state.expectedCount)} imported`;
    $('#sidebar-bank-progress').style.width = `${state.expectedCount ? Math.min(100, count / state.expectedCount * 100) : 0}%`;
    const ready = count >= state.expectedCount && getIncompleteQuestions().length === 0;
    $('#bank-dot').style.background = ready ? 'var(--green)' : 'var(--yellow)';
    $('#bank-dot').style.boxShadow = ready ? '0 0 10px rgba(66,214,162,.5)' : '';
  }
  function setView(view) {
    if ((view === 'exam-setup' || view === 'practice-setup' || view === 'bookmarks' || view === 'search') && !state.questions.length && (view === 'exam-setup' || view === 'practice-setup')) {
      toast('Import a question bank to start a session.');
    }
    state.view = view;
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view || (view === 'result' && item.dataset.view === 'history')));
    $('#crumb-current').textContent = titles[view] || 'Overview';
    $('#sidebar').classList.remove('open');
    render();
    app.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function heading(kicker, title, subtitle, actions = '') {
    return `<div class="page-heading"><div><p class="eyebrow"><span class="live-dot"></span>${esc(kicker)}</p><h1>${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ''}</div>`;
  }
  function emptyState(icon, title, copy, button = '') {
    return `<div class="empty-state"><div><div class="empty-orb">${icon}</div><strong>${esc(title)}</strong><p>${esc(copy)}</p>${button}</div></div>`;
  }
  function getTopicStats() {
    const totals = new Map();
    state.attempts.forEach(attempt => (attempt.details || []).forEach(detail => {
      const topic = detail.topic || 'Uncategorized';
      const stat = totals.get(topic) || { topic, correct: 0, answered: 0, total: 0 };
      stat.total++;
      if (detail.answered) { stat.answered++; if (detail.correct) stat.correct++; }
      totals.set(topic, stat);
    }));
    return [...totals.values()].map(item => ({ ...item, score: item.answered ? Math.round(item.correct / item.answered * 100) : 0 })).sort((a, b) => a.score - b.score || b.total - a.total);
  }
  function dashboard() {
    const attempts = state.attempts;
    const examAttempts = attempts.filter(attempt => (attempt.type || 'exam') === 'exam');
    const best = examAttempts.length ? Math.max(...examAttempts.map(a => Number(a.score) || 0)) : null;
    const last = examAttempts[0] || null;
    const average = examAttempts.length ? Math.round(examAttempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / examAttempts.length) : 0;
    const weak = getTopicStats().filter(item => item.answered > 0).slice(0, 5);
    const incompleteCount = getIncompleteQuestions().length;
    const history = examAttempts.slice(0, 7).reverse();
    const chart = history.length ? history.map((attempt, index) => `<div class="score-bar-wrap"><div class="score-bar" style="height:${Math.max(4, Number(attempt.score) || 0)}%" data-value="${Math.round(Number(attempt.score) || 0)}"></div><span class="score-label">${esc(shortDate(attempt.date) || `#${index + 1}`)}</span></div>`).join('') : `<div class="chart-empty">Complete an exam to build your score trend.</div>`;
    const topicRows = weak.length ? weak.map(item => `<div class="topic-row"><span class="topic-name" title="${esc(item.topic)}">${esc(item.topic)}</span><div class="topic-track"><span style="width:${item.score}%"></span></div><span class="topic-score">${item.score}%</span></div>`).join('') : emptyState('◎', 'No topic data yet', 'Your weakest topics appear after your first completed exam.');
    const progressDegrees = average / 100 * 360;
    return `${heading('LEARNING OVERVIEW', 'Good to see you again.', 'Build confidence in network security, one focused session at a time.', `<button class="button button-primary" data-view="exam-setup"><span class="button-icon">▶</span> Start exam</button><button class="button" data-view="practice-setup">Practice mode <span class="button-icon">↗</span></button>`)}
      <section class="welcome-banner"><div class="welcome-copy"><p class="eyebrow"><span class="live-dot"></span>YOUR SECURITY LEARNING HUB</p><h1>Prepare with clarity.<br />Practice with purpose.</h1><p>Simulate the final, focus on the topics that need attention, and watch your confidence grow over time.</p><div class="welcome-actions"><button class="button button-primary" data-view="exam-setup"><span class="button-icon">▶</span> Start an exam</button><button class="button" data-view="practice-setup">Explore practice lab <span>↗</span></button></div></div><div class="readiness-card"><div class="readiness-ring" style="--progress:${progressDegrees}deg"><div><strong>${examAttempts.length ? `${average}%` : '—'}</strong><small>average score</small></div></div><div class="readiness-copy"><strong>${examAttempts.length ? (average >= PASS_MARK ? 'On track for a pass' : 'Keep building momentum') : 'Your readiness starts here'}</strong><span>${examAttempts.length ? `Passing mark is <b>${PASS_MARK}%</b>. ${average >= PASS_MARK ? 'Keep your skills sharp.' : 'Practice your weakest areas next.'}` : 'Take an exam or practice a topic to create your first learning signal.'}</span></div></div></section>
      <section class="stat-grid" aria-label="Learning statistics">
        <article class="card stat-card" style="--glow:rgba(102,139,255,.14)"><div class="stat-head"><span>Questions imported</span><span class="stat-icon">▤</span></div><div class="stat-value">${number(state.questions.length)}<small>/ ${number(state.expectedCount)}</small></div><div class="stat-note">${incompleteCount ? `${incompleteCount} source items need answer review` : `Source page lists ${number(state.expectedCount)} questions`}</div></article>
        <article class="card stat-card" style="--glow:rgba(66,214,162,.12)"><div class="stat-head"><span>Completed attempts</span><span class="stat-icon">◷</span></div><div class="stat-value">${number(attempts.length)}</div><div class="stat-note"><span class="up">●</span> ${attempts.length ? `${number(examAttempts.length)} exams · ${number(attempts.length - examAttempts.length)} practice labs saved locally` : 'Your exam and lab history will build here'}</div></article>
        <article class="card stat-card" style="--glow:rgba(67,215,208,.12)"><div class="stat-head"><span>Best score</span><span class="stat-icon">⌁</span></div><div class="stat-value">${best === null ? '—' : `${Math.round(best)}%`}</div><div class="stat-note">${best === null ? 'Complete your first exam to set a best' : best >= PASS_MARK ? 'Above the 70% pass mark' : 'Keep working toward the pass mark'}</div></article>
        <article class="card stat-card" style="--glow:rgba(243,199,107,.1)"><div class="stat-head"><span>Last exam</span><span class="stat-icon">◌</span></div><div class="stat-value">${last ? `${Math.round(Number(last.score) || 0)}%` : '—'}</div><div class="stat-note">${last ? esc(dateLabel(last.date)) : 'No attempt yet'}</div></article>
      </section>
      <section class="dashboard-grid"><article class="card chart-card"><div class="card-header"><div><h2>Exam performance</h2><p>Your recent results at a glance</p></div><div class="chart-legend"><span><i class="legend-dot"></i>Score</span><span>Pass mark ${PASS_MARK}%</span></div></div><div class="card-body"><div class="score-chart"><div class="score-y"><span>100%</span><span>70%</span><span>0%</span></div>${chart}</div></div></article>
      <article class="card chart-card"><div class="card-header"><div><h2>Focus areas</h2><p>Topics to revisit from your attempt history</p></div><button class="button button-sm" data-view="analytics">View analytics ↗</button></div><div class="card-body"><div class="topic-list">${weak.length ? topicRows : topicRows}</div></div></article></section>
      <section class="quick-links"><button class="quick-link" data-view="exam-setup"><span>▤</span><span class="quick-link-copy"><strong>Exam simulator</strong><small>Timed test · 70% to pass</small></span><span>↗</span></button><button class="quick-link" data-view="practice-setup"><span>◉</span><span class="quick-link-copy"><strong>Practice lab</strong><small>Instant feedback · topic focused</small></span><span>↗</span></button><button class="quick-link" data-view="revision"><span>✦</span><span class="quick-link-copy"><strong>Exam revision</strong><small>Recall answers, then reveal explanations</small></span><span>↗</span></button><button class="quick-link" data-view="bookmarks"><span>☆</span><span class="quick-link-copy"><strong>Saved questions</strong><small>${number(state.bookmarks.length)} questions to revisit</small></span><span>↗</span></button></section>
      <div class="rules-strip"><span>ⓘ</span><span><strong>Exam rules</strong> &nbsp;90 minutes by default · ${PASS_MARK}% to pass · Answers and explanations stay hidden until submission.</span></div>`;
  }

  function examSetup() {
    const count = state.questions.length;
    const duration = Math.max(1, Math.min(240, Number(state.preferences.duration) || 90));
    return `${heading('SIMULATED EXAM', 'Make this attempt count.', 'Set your exam conditions, then work through one question at a time.', `<button class="button" data-action="import">Import questions <span>↗</span></button>`)}
      <div class="setup-grid"><section class="card setup-card"><h2>Exam configuration</h2><p>Match the real exam rhythm, or adjust the timer while you build confidence.</p><div class="form-grid"><div class="field"><label for="exam-duration">Time limit</label><select id="exam-duration"><option value="30" ${duration === 30 ? 'selected' : ''}>30 minutes</option><option value="60" ${duration === 60 ? 'selected' : ''}>60 minutes</option><option value="90" ${duration === 90 ? 'selected' : ''}>90 minutes</option><option value="120" ${duration === 120 ? 'selected' : ''}>120 minutes</option><option value="180" ${duration === 180 ? 'selected' : ''}>180 minutes</option><option value="custom" ${![30,60,90,120,180].includes(duration) ? 'selected' : ''}>Custom</option></select></div><div class="field" id="custom-duration-field" style="${[30,60,90,120,180].includes(duration) ? 'display:none' : ''}"><label for="custom-duration">Custom minutes (1–240)</label><input id="custom-duration" type="number" min="1" max="240" value="${duration}" /></div><div class="field full"><label class="checkbox-row"><input type="checkbox" id="exam-shuffle" checked /> Randomize question order for this attempt</label></div><div class="field full"><label class="checkbox-row"><input type="checkbox" id="exam-review" checked /> Include a full answer review after submission</label></div></div><div style="display:flex;gap:9px;align-items:center;margin-top:21px"><button class="button button-primary" data-action="start-exam" ${count ? '' : 'aria-disabled="true"'}><span class="button-icon">▶</span> Begin ${number(count)}-question exam</button><span class="muted" style="font-size:9px">Your timer begins immediately.</span></div>${count ? '' : `<div class="practice-feedback incorrect" style="margin-top:16px"><strong>Question bank not loaded</strong>The source page has 153 questions, but question records are not bundled here. Import a JSON bank to use the simulator.</div>`}</section>
      <aside class="setup-sidebar"><section class="card setup-fact"><h3>Exam at a glance</h3><div class="fact-row"><span>Questions available</span><strong>${number(count)} / ${number(state.expectedCount)}</strong></div><div class="fact-row"><span>Passing score</span><strong>${PASS_MARK}%</strong></div><div class="fact-row"><span>Answer visibility</span><strong>After submission</strong></div><div class="fact-row"><span>Question formats</span><strong>Choice, matching, order</strong></div></section><section class="card setup-fact"><h3>Before you begin</h3><div class="fact-row"><span>Navigation</span><strong>Jump to any question</strong></div><div class="fact-row"><span>Review flags</span><strong>Mark items to revisit</strong></div><div class="fact-row"><span>Auto-submit</span><strong>When the timer ends</strong></div><div class="fact-row"><span>Persistence</span><strong>Saved on this device</strong></div></section></aside></div>`;
  }

  function practiceSetup() {
    const usableQuestions = state.questions.filter(question => question.incomplete !== true);
    const topics = [...new Set(usableQuestions.map(q => q.topic || 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
    const count = usableQuestions.length;
    const numericIds = usableQuestions.map(getNumericQuestionId).filter(id => id !== null);
    const maxQuestionNumber = numericIds.length ? Math.max(...numericIds) : Math.max(count, 1);
    return `${heading('PRACTICE LAB', 'Learn by doing.', 'Work through focused questions with instant answers and explanations.', `<button class="button" data-action="import">Import questions</button>`)}
      <div class="setup-grid"><section class="card setup-card"><h2>Build a practice session</h2><p>Choose a topic, a starting question number, and how many questions to answer. The start number is included: 10 questions starting at 100 covers questions 100-109. Answer choices are shuffled, and each completed lab is saved to your attempt history.</p><div class="form-grid"><div class="field full"><label for="practice-topic">Topic</label><select id="practice-topic"><option value="all">All topics</option>${topics.map(topic => `<option value="${esc(topic)}">${esc(topic)}</option>`).join('')}</select></div><div class="field"><label for="practice-start">Start from question</label><input id="practice-start" type="number" min="1" max="${maxQuestionNumber}" value="1" /></div><div class="field"><label for="practice-count">Number of questions</label><input id="practice-count" type="number" min="1" max="${Math.max(count, 1)}" value="${Math.min(20, Math.max(count, 1))}" /></div><div class="field"><label for="practice-order">Question order</label><select id="practice-order"><option value="source" selected>Source order</option><option value="random">Random display order</option></select></div></div><div style="margin-top:21px"><button class="button button-primary" data-action="start-practice">Start practice</button></div>${count ? '' : `<div class="practice-feedback incorrect" style="margin-top:16px"><strong>Import a question bank to start</strong>Your sessions will save progress and explain answers as you go.</div>`}</section><aside class="setup-sidebar"><section class="card setup-fact"><h3>Practice mode</h3><div class="fact-row"><span>Feedback</span><strong>Instant after each answer</strong></div><div class="fact-row"><span>Explanations</span><strong>Available per question</strong></div><div class="fact-row"><span>Question pool</span><strong>${number(count)} loaded</strong></div></section><section class="card setup-fact"><h3>Progress snapshot</h3>${Object.keys(state.practiceStats).length ? Object.entries(state.practiceStats).slice(0, 4).map(([id, item]) => `<div class="fact-row"><span>Question ${esc(id)}</span><strong>${number(item.correct || 0)} correct / ${number(item.attempts || 0)} tries</strong></div>`).join('') : `<div class="topic-empty">Your practice progress will show here after your first answer.</div>`}</section></aside></div>`;
  }

  function imageMarkup(question) {
    const images = Array.isArray(question.images) ? question.images : question.image ? [question.image] : [];
    if (images.length) return images.map((image, index) => {
      const source = safeImage(image);
      if (!source) return '';
      const alt = typeof image === 'object' && image.alt ? image.alt : `Exhibit ${index + 1} for question ${question.id}`;
      const caption = typeof image === 'object' && image.caption ? `<div class="question-image-caption">${esc(image.caption)}</div>` : '';
      return `<img class="question-image" src="${esc(source)}" alt="${esc(alt)}" loading="lazy" />${caption}`;
    }).join('');
    if (question.imageMissing || question.imageReference) return `<div class="image-missing"><span>▧</span><span>Exhibit referenced in source: ${esc(question.imageReference || 'image unavailable')}. Add a local image to the question record.</span></div>`;
    return '';
  }
  function answerMarkup(question, answer, readonly = false, review = false, presentation = null) {
    if (question.type === 'matching') {
      const values = Array.isArray(answer) ? answer : quiz.makeBlankAnswer(question);
      const unused = Array.isArray(question.unusedOptions) && question.unusedOptions.length ? `<p class="answer-hint">Unused option${question.unusedOptions.length === 1 ? '' : 's'}: ${question.unusedOptions.map(esc).join(', ')}.</p>` : '';
      const pairOrder = presentation && presentation.pairOrder || question.pairs.map((_, pairIndex) => pairIndex);
      return `${unused}<div class="matching-list">${pairOrder.map(index => { const pair = question.pairs[index]; const order = presentation && presentation.pairs && presentation.pairs[index] || pair.options.map((_, optionIndex) => optionIndex); return `<div class="matching-row"><strong>${esc(pair.left)}</strong><select data-pair="${index}" ${readonly ? 'disabled' : ''}><option value="">Choose a match…</option>${order.map(optionIndex => `<option value="${optionIndex}" ${Number(values[index]) === optionIndex ? 'selected' : ''}>${esc(pair.options[optionIndex])}</option>`).join('')}</select></div>`; }).join('')}</div>`;
    }
    if (question.type === 'ordering') {
      const values = Array.isArray(answer) && answer.length === question.items.length ? answer : quiz.makeBlankAnswer(question);
      return `<div class="ordering-list">${values.map((itemIndex, index) => `<div class="ordering-item"><span class="order-index">${index + 1}</span><span>${esc(question.items[itemIndex])}</span>${readonly ? '' : `<span class="order-controls"><button data-action="order-move" data-from="${index}" data-to="${index - 1}" ${index === 0 ? 'disabled' : ''} aria-label="Move item up">↑</button><button data-action="order-move" data-from="${index}" data-to="${index + 1}" ${index === values.length - 1 ? 'disabled' : ''} aria-label="Move item down">↓</button></span>`}</div>`).join('')}</div>`;
    }
    const selected = Array.isArray(answer) ? answer : [];
    const order = presentation && presentation.choices || question.options.map((_, index) => index);
    return `<div class="answer-list">${order.map((index, displayIndex) => {
      const option = question.options[index];
      const isSelected = selected.includes(index);
      const correct = review && question.correctAnswers.includes(index);
      const wrongSelected = review && isSelected && !correct;
      return `<button class="answer-option${isSelected ? ' selected' : ''}${correct ? ' correct' : ''}${wrongSelected ? ' incorrect' : ''}" data-answer-index="${index}" ${readonly ? 'disabled' : ''}><span class="answer-letter">${String.fromCharCode(65 + displayIndex)}</span><span class="answer-copy">${esc(option)}</span><span class="answer-check">✓</span></button>`;
    }).join('')}</div>`;
  }
  function questionContent(question, numberInSession, total, answer, options = {}) {
    const typeLabel = { single: 'Single choice', multiple: 'Select all that apply', matching: 'Matching', ordering: 'Order the steps' }[question.type] || 'Question';
    const hint = question.type === 'multiple' ? 'Select every correct answer.' : question.type === 'matching' ? 'Choose the best match for each item.' : question.type === 'ordering' ? 'Use the arrows to arrange the items in order.' : '';
    return `<div class="question-meta"><span class="question-number">QUESTION ${numberInSession} / ${total}</span><span class="pill pill-blue">${esc(question.topic || 'Uncategorized')}</span><span class="pill">${typeLabel}</span></div><h2>${esc(question.question)}</h2>${imageMarkup(question)}${hint ? `<p class="answer-hint">${hint}</p>` : ''}${answerMarkup(question, answer, Boolean(options.readonly), Boolean(options.review), options.presentation)}`;
  }
  function timerMarkup() {
    const minutes = Math.floor(state.remaining / 60);
    const seconds = state.remaining % 60;
    const cls = state.remaining <= 300 ? 'critical' : state.remaining <= 600 ? 'warning' : '';
    return `<div class="timer ${cls}" id="timer-display"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6m-3 0v3"/></svg><span id="timer-value">${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}</span></div>`;
  }
  function updateTimerDisplay() {
    const display = $('#timer-display');
    const value = $('#timer-value');
    if (!display || !value) return;
    const minutes = Math.floor(state.remaining / 60);
    const seconds = state.remaining % 60;
    value.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    display.classList.toggle('warning', state.remaining <= 600 && state.remaining > 300);
    display.classList.toggle('critical', state.remaining <= 300);
  }
  function currentExamQuestion() {
    return state.exam && state.exam.order[state.exam.index] ? getQuestion(state.exam.order[state.exam.index]) : null;
  }
  function examView() {
    if (!state.exam) return examSetup();
    if (state.exam.reviewing) return examReviewView();
    const question = currentExamQuestion();
    if (!question) return emptyState('▤', 'This exam is unavailable', 'Return to the dashboard and start a new attempt.');
    const answer = state.exam.answers[String(question.id)];
    const answeredCount = state.exam.order.filter(id => quiz.hasAnswer(getQuestion(id), state.exam.answers[String(id)])).length;
    const flaggedCount = Object.values(state.exam.flagged).filter(Boolean).length;
    const total = state.exam.order.length;
    const flag = Boolean(state.exam.flagged[String(question.id)]);
    return `<div class="exam-topline"><div class="exam-progress-copy"><strong>Question ${state.exam.index + 1}</strong><span>of ${number(total)} · ${answeredCount} answered · ${total - answeredCount} unanswered · ${flaggedCount} flagged</span></div><div class="exam-top-actions">${timerMarkup()}<button class="button button-sm button-danger" data-action="submit-exam">Finish exam</button></div></div><div class="exam-progress-track"><span style="width:${(state.exam.index + 1) / total * 100}%"></span></div><div class="exam-layout"><section class="card question-card">${questionContent(question, state.exam.index + 1, total, answer)}<div class="question-footer"><div class="question-footer-left"><button class="button button-sm ${flag ? 'pill-yellow' : ''}" data-action="toggle-flag">${flag ? '★ Flagged for review' : '☆ Flag for review'}</button></div><div class="question-footer-right"><button class="button button-sm" data-action="previous-question" ${state.exam.index === 0 ? 'disabled' : ''}>← Previous</button><button class="button button-sm button-primary" data-action="next-question">${state.exam.index === total - 1 ? 'Review answers' : 'Next question'} →</button></div></div></section><aside class="exam-side"><section class="card navigator-card"><div class="navigator-heading"><h3>Question map</h3><span class="navigator-count">${state.exam.index + 1} / ${total}</span></div><div class="navigator-stats"><span class="navigator-stat"><i class="state-dot answered"></i>${answeredCount} answered</span><span class="navigator-stat"><i class="state-dot flagged"></i>${flaggedCount} flagged</span></div><div class="nav-grid">${state.exam.order.map((id, index) => {
      const q = getQuestion(id);
      const ans = state.exam.answers[String(id)];
      const classes = [quiz.hasAnswer(q, ans) ? 'answered' : '', state.exam.flagged[String(id)] ? 'flagged' : '', index === state.exam.index ? 'current' : ''].filter(Boolean).join(' ');
      return `<button class="nav-question ${classes}" data-action="jump-question" data-index="${index}" aria-label="Go to question ${index + 1}">${index + 1}</button>`;
    }).join('')}</div><div class="navigator-legend"><span class="legend-state"><i class="state-dot"></i>Unanswered</span><span class="legend-state"><i class="state-dot answered"></i>Answered</span><span class="legend-state"><i class="state-dot flagged"></i>Flagged</span><span class="legend-state"><i class="state-dot" style="background:var(--blue)"></i>Current</span></div></section><div class="exam-side-note"><strong>Answers stay private.</strong> Your selections, flags, and progress are saved for this attempt. Correct answers appear only after you submit.</div></aside></div>`;
  }

  function examReviewView() {
    const total = state.exam.order.length;
    const answered = state.exam.order.filter(id => quiz.hasAnswer(getQuestion(id), state.exam.answers[String(id)])).length;
    const unanswered = total - answered;
    const flagged = Object.values(state.exam.flagged).filter(Boolean).length;
    const items = state.exam.order.map((id, index) => {
      const question = getQuestion(id);
      const hasAnswer = quiz.hasAnswer(question, state.exam.answers[String(id)]);
      return `<div class="table-row" style="grid-template-columns:minmax(0,1fr) auto auto"><div class="table-primary"><strong>Question ${index + 1} · ${esc(question.topic || 'Uncategorized')}</strong><small>${esc(question.question)}</small></div><span class="pill ${state.exam.flagged[String(id)] ? 'pill-yellow' : hasAnswer ? 'pill-green' : 'pill-red'}">${state.exam.flagged[String(id)] ? 'Flagged' : hasAnswer ? 'Answered' : 'Unanswered'}</span><button class="button button-sm" data-action="jump-question" data-index="${index}">Review ↗</button></div>`;
    }).join('');
    return `<div class="exam-topline"><div class="exam-progress-copy"><strong>Review your exam</strong><span>${number(total)} questions · correct answers remain hidden</span></div><div class="exam-top-actions">${timerMarkup()}</div></div><div class="exam-progress-track"><span style="width:100%"></span></div><section class="card list-card"><div class="card-header"><div><h2>Before you submit</h2><p>${answered} answered · ${unanswered} unanswered · ${flagged} flagged</p></div><span class="pill ${unanswered ? 'pill-yellow' : 'pill-green'}">${unanswered ? `${unanswered} to review` : 'All answered'}</span></div>${items}<div class="question-footer" style="margin:0 18px"><div class="question-footer-left"><button class="button button-sm" data-action="return-exam">← Back to question</button></div><div class="question-footer-right"><button class="button button-sm button-danger" data-action="submit-exam">Submit exam</button></div></div></section>`;
  }

  function practiceView() {
    if (!state.practice || !state.practice.order.length) return practiceSetup();
    const question = getQuestion(state.practice.order[state.practice.index]);
    if (!question) return emptyState('Practice', 'Question unavailable', 'This item is no longer in the imported question bank.');
    const answer = state.practice.answers[String(question.id)];
    const presentation = state.practice.presentation[String(question.id)];
    const checked = Boolean(state.practice.checked[String(question.id)]);
    const correct = checked && quiz.isCorrect(question, answer);
    const stat = state.practiceStats[String(question.id)] || { attempts: 0, correct: 0 };
    const feedback = checked ? `<div class="practice-feedback${correct ? '' : ' incorrect'}"><strong>${correct ? 'Correct answer' : 'Not quite - review the correct answer'}</strong><span><b>Your answer:</b> ${esc(quiz.answerText(question, answer, presentation && presentation.choices))}</span><br /><span><b>Correct answer:</b> ${esc(quiz.correctText(question, presentation && presentation.choices))}</span>${question.explanation ? `<br /><span><b>Explanation:</b> ${esc(question.explanation)}</span>` : ''}</div>` : '';
    const saved = isBookmarked(question.id);
    return `<div class="exam-topline"><div class="exam-progress-copy"><strong>Question ${state.practice.index + 1}</strong><span>of ${number(state.practice.order.length)} | Bank question ${esc(question.id)} | ${esc(state.practice.topic || 'All topics')}</span></div><span class="pill">${number(stat.attempts)} previous tries</span></div><div class="exam-progress-track"><span style="width:${(state.practice.index + 1) / state.practice.order.length * 100}%"></span></div><section class="card question-card">${questionContent(question, state.practice.index + 1, state.practice.order.length, answer, { readonly: checked, presentation })}${feedback}<div class="question-footer"><div class="question-footer-left"><button class="button button-sm ${saved ? 'pill-yellow' : ''}" data-action="toggle-bookmark" data-id="${esc(question.id)}">${saved ? 'Saved' : 'Save question'}</button></div><div class="question-footer-right">${checked ? `<button class="button button-sm" data-action="previous-practice" ${state.practice.index === 0 ? 'disabled' : ''}>Previous</button><button class="button button-sm button-primary" data-action="next-practice">${state.practice.index === state.practice.order.length - 1 ? 'Finish practice' : 'Next question'}</button>` : `<button class="button button-sm button-primary" data-action="check-answer" ${quiz.hasAnswer(question, answer) ? '' : 'disabled'}>Check answer</button>`}</div></div></section>`;
  }

  function startRevision(topic = 'all') {
    const pool = state.questions.filter(question => question.incomplete !== true && (topic === 'all' || (question.topic || 'Uncategorized') === topic));
    state.revision = { topic, order: pool.map(question => question.id), index: 0, revealed: false };
  }
  function revisionMemoryCue(question) {
    const answer = quiz.correctText(question);
    if (question.type === 'matching') return `Recall each pair as a link: ${answer}. Then try to name the match from either side.`;
    if (question.type === 'ordering') return `Say the sequence as a chain: ${answer}. Cover the list and rebuild it from memory.`;
    return `Make a one-line link: ${question.topic || 'Key concept'} → ${answer}. Cover the answer and recall that link before checking.`;
  }
  function revisionView() {
    const questions = state.questions.filter(question => question.incomplete !== true);
    const topics = [...new Set(questions.map(question => question.topic || 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
    if (!state.revision.order.length && questions.length) startRevision(state.revision.topic || 'all');
    const question = getQuestion(state.revision.order[state.revision.index]);
    if (!question) {
      const hasBank = state.questions.length > 0;
      return `${heading('EXAM REVISION', 'Recall it before you reveal it.', 'Use active recall: answer from memory, then compare the key, explanation, and memory cue.', '')}<section class="card setup-card"><h2>${hasBank ? 'No complete questions to revise' : 'Your question bank is ready when you are'}</h2><p>${hasBank ? 'The imported records do not yet contain complete answer keys. Import a bank with answer details to use this section.' : 'Import the question bank to review questions with their answer keys and explanations.'}</p><button class="button button-primary" data-action="import">Import question bank</button></section>`;
    }
    const shownAnswer = state.revision.revealed;
    const correctAnswer = question.type === 'matching'
      ? question.pairs.map(pair => pair.correct)
      : question.type === 'ordering' ? question.correctOrder : question.correctAnswers;
    const topicLabel = state.revision.topic === 'all' ? 'All topics' : state.revision.topic;
    const explanation = typeof question.explanation === 'string' && question.explanation.trim()
      ? `<p><strong>Why it is correct</strong><br />${esc(question.explanation)}</p>`
      : `<p><strong>Explanation</strong><br />No detailed explanation was included in this question record. Use the highlighted answer key and the memory cue to practice recalling the defining concept.</p>`;
    return `${heading('EXAM REVISION', 'Recall it before you reveal it.', 'Test your memory first. Then check the correct answer, read why it fits, and use the cue to make it stick.', `<button class="button button-sm" data-action="shuffle-revision">↻ Shuffle questions</button>`)}
      <section class="revision-toolbar card"><div class="field"><label for="revision-topic">Review topic</label><select id="revision-topic"><option value="all" ${state.revision.topic === 'all' ? 'selected' : ''}>All topics (${number(questions.length)})</option>${topics.map(topic => { const count = questions.filter(item => (item.topic || 'Uncategorized') === topic).length; return `<option value="${esc(topic)}" ${state.revision.topic === topic ? 'selected' : ''}>${esc(topic)} (${number(count)})</option>`; }).join('')}</select></div><span class="pill pill-blue">${esc(topicLabel)}</span></section>
      <div class="exam-progress-track revision-progress"><span style="width:${(state.revision.index + 1) / state.revision.order.length * 100}%"></span></div>
      <section class="card question-card revision-card"><div class="question-meta"><span class="question-number">QUESTION ${state.revision.index + 1} / ${number(state.revision.order.length)}</span><span class="pill pill-blue">${esc(question.topic || 'Uncategorized')}</span><span class="pill">${{ single: 'Single choice', multiple: 'Select all that apply', matching: 'Matching', ordering: 'Order the steps' }[question.type] || 'Question'}</span></div><h2>${esc(question.question)}</h2>${imageMarkup(question)}${question.type === 'multiple' ? '<p class="answer-hint">Try to name every correct choice before revealing the key.</p>' : ''}
      ${shownAnswer ? `<div class="revision-answer"><div class="revision-answer-heading"><span class="revision-check">✓</span><strong>Correct answer</strong></div>${answerMarkup(question, correctAnswer, true, true)}<p class="revision-answer-text">${esc(quiz.correctText(question))}</p><div class="revision-notes">${explanation}<p><strong>Memory cue</strong><br />${esc(revisionMemoryCue(question))}</p></div></div>` : `<div class="revision-prompt"><span class="revision-prompt-icon">?</span><div><strong>Pause and answer from memory</strong><p>Say or write your answer before you reveal the key. This small effort makes recall stronger.</p></div></div>`}
      <div class="question-footer"><div class="question-footer-left"><button class="button button-sm ${isBookmarked(question.id) ? 'pill-yellow' : ''}" data-action="toggle-bookmark" data-id="${esc(question.id)}">${isBookmarked(question.id) ? '★ Saved' : '☆ Save question'}</button></div><div class="question-footer-right"><button class="button button-sm" data-action="previous-revision" ${state.revision.index === 0 ? 'disabled' : ''}>← Previous</button><button class="button button-sm ${shownAnswer ? '' : 'button-primary'}" data-action="toggle-revision-answer">${shownAnswer ? 'Hide answer' : 'Reveal answer'}</button><button class="button button-sm button-primary" data-action="next-revision" ${state.revision.index === state.revision.order.length - 1 ? 'disabled' : ''}>Next →</button></div></div></section>`;
  }

  function reviewCard(question, detail, index) {
    const good = Boolean(detail.correct);
    return `<article class="review-item"><button class="review-summary" data-action="toggle-review" aria-expanded="false"><span class="review-index${good ? '' : ' incorrect'}">${String(index + 1).padStart(2, '0')}</span><span class="review-question">${esc(question.question)}</span><span class="pill ${good ? 'pill-green' : 'pill-red'}">${good ? 'Correct' : detail.answered ? 'Incorrect' : 'Unanswered'}</span><span class="review-chevron">⌄</span></button><div class="review-detail" hidden>${imageMarkup(question)}<p><strong>Your answer:</strong> ${esc(quiz.answerText(question, detail.answer, detail.presentation && detail.presentation.choices))}</p><p><strong>Correct answer:</strong> ${esc(quiz.correctText(question, detail.presentation && detail.presentation.choices))}</p>${question.explanation ? `<p><strong>Explanation:</strong> ${esc(question.explanation)}</p>` : ''}</div></article>`;
  }
  function resultView() {
    if (!state.result) return historyView();
    const result = state.result;
    const isPractice = result.type === 'practice';
    const pass = !isPractice && result.score >= PASS_MARK;
    const details = (result.details || []).filter(detail => getQuestion(detail.id));
    const ringColor = pass ? 'var(--green)' : 'var(--red)';
    const actions = isPractice
      ? `<button class="button" data-view="history">Attempt history</button><button class="button button-primary" data-view="practice-setup">Practice another lab</button>`
      : `<button class="button" data-view="dashboard">← Dashboard</button><button class="button button-primary" data-action="retake-exam">Retake exam</button>`;
    const status = isPractice ? 'Practice lab' : pass ? `✓ PASS · ${PASS_MARK}% required` : `✕ FAIL · ${PASS_MARK}% required`;
    return `${heading(isPractice ? 'PRACTICE COMPLETE' : 'ATTEMPT COMPLETE', isPractice ? 'Your practice results' : 'Your exam results', isPractice ? `Review your ${result.topic || 'topic'} lab score and answers.` : 'Take a moment to review your score, then use the answer notes to choose what to practice next.', actions)}
      <section class="card result-hero"><div class="result-score"><div class="score-ring" style="--score:${Math.min(100, Math.max(0, result.score)) * 3.6}deg;--ring-color:${isPractice ? 'var(--cyan)' : ringColor}"><div><strong>${Math.round(result.score)}%</strong><small>${isPractice ? 'lab score' : 'final score'}</small></div></div><span class="pill ${isPractice ? 'pill-blue' : pass ? 'pill-green' : 'pill-red'}">${status}</span></div><div class="result-copy"><p class="eyebrow">${isPractice ? 'LAB COMPLETE' : pass ? 'STRONG WORK' : 'KEEP BUILDING'}</p><h1>${isPractice ? 'Practice session complete.' : pass ? 'You passed the exam.' : 'You are getting closer.'}</h1><p>${isPractice ? 'Use your answers and explanations to decide what to review next.' : pass ? 'Your score is above the passing threshold. Review the explanations to keep your knowledge sharp.' : 'Use the missed questions and topic insights below to guide your next practice session.'}</p><div class="result-stats"><div class="result-stat"><strong>${result.correct} / ${result.total}</strong><span>Correct</span></div><div class="result-stat"><strong>${result.incorrect}</strong><span>Incorrect</span></div><div class="result-stat"><strong>${result.unanswered}</strong><span>Unanswered</span></div><div class="result-stat"><strong>${formatDuration(result.timeSpent)}</strong><span>Time used</span></div></div></div></section>
      <div class="heading-actions" style="justify-content:flex-start;margin:0 0 14px"><button class="button button-sm" data-action="review-incorrect">Review incorrect questions</button><button class="button button-sm" data-action="export-results">Export results</button></div><section class="card list-card"><div class="card-header"><div><h2>Detailed answer review</h2><p>${number(details.length)} question${details.length === 1 ? '' : 's'} · Open an item for your answer and explanation</p></div><span class="pill ${isPractice ? 'pill-blue' : pass ? 'pill-green' : 'pill-red'}">${isPractice ? 'Completed' : pass ? 'Passed' : 'Needs practice'}</span></div><div class="card-body"><div class="review-list">${details.map((detail, index) => reviewCard(getQuestion(detail.id), detail, index)).join('')}</div></div></section>`;
  }

  function historyView() {
    const actions = `<button class="button button-sm" data-action="export-results">Export results</button><button class="button button-sm" data-view="practice-setup">New lab</button><button class="button button-sm button-primary" data-view="exam-setup">New exam</button>`;
    const attempts = state.attempts;
    const rows = attempts.map((attempt, index) => {
      const isPractice = attempt.type === 'practice';
      const passed = attempt.score >= PASS_MARK;
      return `<div class="table-row"><div class="table-primary"><strong>${isPractice ? 'Practice lab' : 'Network Security Final Exam'}</strong><small>${esc(dateLabel(attempt.date))} · ${number(attempt.total)} questions${isPractice && attempt.topic ? ` · ${esc(attempt.topic)}` : ''}</small></div><span>${formatDuration(attempt.timeSpent)}</span><span>${attempt.correct} / ${attempt.total}</span><span class="pill ${isPractice ? 'pill-blue' : passed ? 'pill-green' : 'pill-red'}">${Math.round(attempt.score)}% · ${isPractice ? 'LAB' : passed ? 'PASS' : 'FAIL'}</span><button class="button button-sm" data-action="open-attempt" data-index="${index}" aria-label="Review this attempt">↗</button></div>`;
    }).join('');
    return `${heading('YOUR ATTEMPTS', 'Attempt history', 'Review completed exams and practice labs, including scores, time, and answers.', actions)}<section class="card list-card"><div class="card-header"><div><h2>Previous exams and labs</h2><p>${number(attempts.length)} completed attempt${attempts.length === 1 ? '' : 's'} saved on this device</p></div><span class="pill">${PASS_MARK}% exam pass mark</span></div><div class="table-head"><span>Attempt</span><span>Time</span><span>Correct</span><span>Result</span><span></span></div>${rows || `<div class="table-empty">No completed attempts yet. Finish an exam or practice lab to save your first result.</div>`}</section>`;
  }

  function analyticsView() {
    const stats = getTopicStats().filter(item => item.answered > 0);
    const attempts = state.attempts.filter(attempt => (attempt.type || 'exam') === 'exam');
    const average = attempts.length ? Math.round(attempts.reduce((sum, a) => sum + (Number(a.score) || 0), 0) / attempts.length) : 0;
    const correctTotal = attempts.reduce((sum, a) => sum + (Number(a.correct) || 0), 0);
    const questionTotal = attempts.reduce((sum, a) => sum + (Number(a.total) || 0), 0);
    const topicList = stats.length ? stats.map(item => `<div class="topic-detail"><span><strong>${esc(item.topic)}</strong><br /><small class="muted">${item.correct} correct / ${item.answered} answered · ${item.total} appearances</small></span><span class="pill ${item.score < PASS_MARK ? 'pill-yellow' : 'pill-green'}">${item.score}% accuracy</span></div>`).join('') : `<div class="topic-empty">Complete an exam to see topic-level strengths and weaknesses. Each topic score uses answered questions across your saved attempts.</div>`;
    return `${heading('LEARNING INSIGHTS', 'Learning analytics', 'Find the chapters that need another pass and track your overall progress.', `<button class="button button-sm" data-view="history">View attempt history ↗</button>`)}<section class="stat-grid"><article class="card stat-card"><div class="stat-head">Average score <span class="stat-icon">↗</span></div><div class="stat-value">${attempts.length ? `${average}%` : '—'}</div><div class="stat-note">${attempts.length ? `${average >= PASS_MARK ? 'Above' : 'Below'} the ${PASS_MARK}% threshold` : 'No exam data yet'}</div></article><article class="card stat-card"><div class="stat-head">Questions answered <span class="stat-icon">✓</span></div><div class="stat-value">${number(correctTotal)}<small>/ ${number(questionTotal)}</small></div><div class="stat-note">Across all completed attempts</div></article><article class="card stat-card"><div class="stat-head">Exam attempts <span class="stat-icon">◷</span></div><div class="stat-value">${number(attempts.length)}</div><div class="stat-note">Stored on this device</div></article><article class="card stat-card"><div class="stat-head">Topics tracked <span class="stat-icon">◈</span></div><div class="stat-value">${number(stats.length)}</div><div class="stat-note">From your answer history</div></article></section><section class="analytics-grid"><article class="card wide"><div class="card-header"><div><h2>Topic performance</h2><p>Lowest accuracy topics appear first</p></div><span class="pill pill-blue">Learning focus</span></div><div class="card-body">${topicList}</div></article><article class="card"><div class="card-header"><div><h2>What to do next</h2><p>A simple next step for your learning</p></div></div><div class="card-body">${stats.length ? `<div class="topic-empty" style="text-align:left"><strong style="display:block;margin-bottom:7px;color:#e5cf96">Revisit ${esc(stats[0].topic)}</strong>Your current accuracy is ${stats[0].score}%. Use Practice Lab to focus on this topic and build recall with immediate feedback.</div><button class="button button-primary button-sm" style="margin-top:12px" data-view="practice-setup">Open practice lab ↗</button>` : `<div class="topic-empty">After your first exam, this panel will suggest a topic to revisit based on your results.</div>`}</div></article><article class="card"><div class="card-header"><div><h2>Pass threshold</h2><p>Final exam benchmark</p></div></div><div class="card-body"><div class="metric-big">${PASS_MARK}% <small>required to pass</small></div><div class="topic-track" style="height:8px"><span style="width:${Math.min(100, average)}%"></span></div><p class="muted" style="font-size:9px;margin:9px 0 0">${attempts.length ? `Your average is ${Math.abs(average - PASS_MARK)} points ${average >= PASS_MARK ? 'above' : 'below'} the benchmark.` : 'Your score trend will be compared with this benchmark.'}</p></div></article></section>`;
  }

  function bookmarksView() {
    const questions = state.bookmarks.map(getQuestion).filter(Boolean);
    const items = questions.map(question => `<div class="search-result" data-action="open-bookmark" data-id="${esc(question.id)}"><span class="search-result-num">Q${esc(question.id)}</span><span><strong>${esc(question.question)}</strong><small>${esc(question.topic || 'Uncategorized')} · ${esc(question.type)}</small></span><button class="button button-sm button-quiet" data-action="remove-bookmark" data-id="${esc(question.id)}" aria-label="Remove bookmark">★</button></div>`).join('');
    return `${heading('YOUR LIBRARY', 'Saved questions', 'Keep the tricky concepts close and revisit them whenever you are ready.', `<button class="button button-sm button-primary" data-view="practice-setup">Practice saved topics ↗</button>`)}<section class="card"><div class="card-header"><div><h2>Bookmarks</h2><p>${number(questions.length)} question${questions.length === 1 ? '' : 's'} saved</p></div></div><div class="card-body"><div class="search-results">${items || emptyState('☆', 'No saved questions yet', 'Bookmark an item in Practice Lab to build a personal review list.')}</div></div></section>`;
  }

  function searchView() {
    const query = state.searchTerm.trim().toLowerCase();
    const matches = query ? state.questions.filter(q => [q.question, q.topic, q.explanation, ...(q.options || []), ...(q.items || []), ...(q.pairs || []).flatMap(pair => [pair.left, ...(pair.options || [])])].join(' ').toLowerCase().includes(query)).slice(0, 50) : [];
    const list = matches.map(question => `<div class="search-result" data-action="open-search-question" data-id="${esc(question.id)}"><span class="search-result-num">Q${esc(question.id)}</span><span><strong>${esc(question.question)}</strong><small>${esc(question.topic || 'Uncategorized')} · ${esc(question.type)}</small></span><span class="pill">${isBookmarked(question.id) ? '★ Saved' : 'Open'}</span></div>`).join('');
    return `${heading('QUESTION SEARCH', 'Search the question bank', 'Search question text, answers, explanations, and topics.', `<button class="button button-sm" data-view="dashboard">← Overview</button>`)}<section class="card"><div class="card-header"><div><h2>Results ${query ? `for “${esc(state.searchTerm)}”` : ''}</h2><p>${number(matches.length)} matching question${matches.length === 1 ? '' : 's'}${matches.length === 50 ? ' · showing first 50' : ''}</p></div></div><div class="card-body"><div class="search-results">${query ? (list || emptyState('⌕', 'No matches found', 'Try another keyword or search for a topic such as ACL, VPN, or ASA.')) : emptyState('⌕', 'Search by keyword', 'Use the search field above to find a question, answer, or topic.')}</div></div></section>`;
  }

  function render() {
    updateSidebar();
    const view = state.view;
    const templates = {
      dashboard, 'exam-setup': examSetup, 'practice-setup': practiceSetup,
      exam: examView, practice: practiceView, result: resultView,
      revision: revisionView, analytics: analyticsView, history: historyView, bookmarks: bookmarksView, search: searchView
    };
    app.innerHTML = (templates[view] || dashboard)();
    if (view === 'exam-setup' && getIncompleteQuestions().length) {
      const incompleteQuestions = getIncompleteQuestions();
      const incompleteCount = incompleteQuestions.length;
      const incompleteIds = incompleteQuestions.map(question => esc(question.id)).join(' and ');
      const startButton = $('[data-action="start-exam"]', app);
      if (startButton) {
        startButton.disabled = true;
        startButton.innerHTML = `<span class="button-icon">!</span> Complete ${incompleteCount} answer maps first`;
      }
      const setupCard = $('.setup-card', app);
      if (setupCard) {
        const note = document.createElement('div');
        note.className = 'practice-feedback incorrect';
        note.innerHTML = `<strong>Full exam paused: ${incompleteCount} answer maps are missing</strong>Questions ${incompleteIds} are preserved with their exhibits, but the supplied HTML has no text answer map for them. Practice mode uses the ${state.questions.length - incompleteCount} complete questions. Add those mappings to unlock the full exam.`;
        setupCard.append(note);
      }
    }
    if (view === 'result' && state.result && state.result.includeReview === false) {
      const panel = $('.list-card', app);
      if (panel) panel.innerHTML = `<div class="card-header"><div><h2>Detailed answer review</h2><p>This attempt was configured to hide the review initially.</p></div></div><div class="card-body"><button class="button button-sm" data-action="show-answer-review">Show answer review</button></div>`;
    }
    $('#crumb-current').textContent = titles[view] || 'Overview';
  }

  function saveAnswer(question, answer) {
    if (state.view === 'exam' && state.exam) state.exam.answers[String(question.id)] = answer;
    else if (state.view === 'practice' && state.practice) {
      state.practice.answers[String(question.id)] = answer;
      delete state.practice.checked[String(question.id)];
    }
    render();
  }
  function choiceClick(button) {
    const question = state.view === 'exam' ? currentExamQuestion() : state.practice && getQuestion(state.practice.order[state.practice.index]);
    if (!question || !['single', 'multiple'].includes(question.type)) return;
    if (state.view === 'practice' && state.practice.checked[String(question.id)]) return;
    const index = Number(button.dataset.answerIndex);
    const current = state.view === 'exam' ? state.exam.answers[String(question.id)] || [] : state.practice.answers[String(question.id)] || [];
    const selected = question.type === 'single' ? [index] : current.includes(index) ? current.filter(item => item !== index) : [...current, index].sort((a, b) => a - b);
    saveAnswer(question, selected);
  }
  function currentDuration() {
    const preset = $('#exam-duration') && $('#exam-duration').value;
    let minutes = preset === 'custom' ? Number($('#custom-duration') && $('#custom-duration').value) : Number(preset);
    if (!minutes) minutes = Number(state.preferences.duration) || 90;
    minutes = Math.max(1, Math.min(240, Math.floor(minutes)));
    state.preferences.duration = minutes;
    storage.savePreferences(state.preferences);
    return minutes;
  }
  function startExam() {
    if (!state.questions.length) { toast('Import a question bank before starting an exam.'); return; }
    if (getIncompleteQuestions().length) { toast('Complete the missing answer details before starting a scored full exam.', true); return; }
    const duration = currentDuration();
    let order = state.questions.map(question => question.id);
    if ($('#exam-shuffle') && $('#exam-shuffle').checked) order = shuffle(order);
    state.exam = { order, index: 0, answers: {}, flagged: {}, duration, startedAt: Date.now(), includeReview: !$('#exam-review') || $('#exam-review').checked };
    state.result = null;
    state.remaining = duration * 60;
    state.view = 'exam';
    state.timer = window.NetSecureTimer.create(state.remaining, value => { state.remaining = value; updateTimerDisplay(); }, () => { toast('Time is up. Your exam was submitted automatically.'); submitExam(true); });
    render();
    state.timer.start();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }
  function shuffleDifferent(list) {
    const out = shuffle(list);
    if (out.length > 1 && out.every((value, index) => value === list[index])) return [...out.slice(1), out[0]];
    return out;
  }
  function submitExam(auto = false) {
    if (!state.exam) return;
    if (!auto) {
      const unanswered = state.exam.order.filter(id => !quiz.hasAnswer(getQuestion(id), state.exam.answers[String(id)])).length;
      const message = unanswered ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered. Submit this exam now?` : 'Submit your exam and reveal your result?';
      if (!window.confirm(message)) return;
    }
    if (state.timer) state.timer.stop();
    const details = state.exam.order.map(id => {
      const question = getQuestion(id);
      const answer = state.exam.answers[String(id)];
      const answered = quiz.hasAnswer(question, answer);
      return { id, topic: question.topic || 'Uncategorized', answer: answer === undefined ? null : answer, answered, correct: answered && quiz.isCorrect(question, answer) };
    });
    const total = details.length;
    const correct = details.filter(detail => detail.correct).length;
    const unanswered = details.filter(detail => !detail.answered).length;
    const duration = state.exam.duration * 60;
    const timeSpent = Math.max(0, Math.min(duration, duration - state.remaining));
    const attempt = { id: `attempt-${Date.now()}`, type: 'exam', date: new Date().toISOString(), total, correct, incorrect: total - correct - unanswered, unanswered, score: total ? correct / total * 100 : 0, timeSpent, includeReview: state.exam.includeReview, details };
    state.attempts.unshift(attempt);
    saveAttempts();
    state.result = attempt;
    state.exam = null;
    state.view = 'result';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function startPractice(options = {}) {
    if (!state.questions.length) { toast('Import a question bank before starting practice.'); return; }
    const topic = options.topic || ($('#practice-topic') && $('#practice-topic').value) || 'all';
    let pool = (options.questionIds
      ? options.questionIds.map(getQuestion).filter(Boolean)
      : topic === 'all' ? [...state.questions] : state.questions.filter(question => (question.topic || 'Uncategorized') === topic)).filter(question => question.incomplete !== true);
    const startInput = $('#practice-start');
    const startNumber = Math.max(1, Math.floor(Number(options.startNumber ?? (startInput && startInput.value) ?? 1) || 1));
    if (!options.questionIds) {
      const allIdsAreNumeric = pool.length > 0 && pool.every(question => getNumericQuestionId(question) !== null);
      if (allIdsAreNumeric) {
        pool = pool.map(question => ({ question, id: getNumericQuestionId(question) }))
          .filter(item => item.id >= startNumber)
          .sort((a, b) => a.id - b.id)
          .map(item => item.question);
      } else {
        pool = pool.slice(startNumber - 1);
      }
    }
    if (!pool.length) { toast(`There are no available questions at or after question ${startNumber}.`, true); return; }
    const countValue = Number(options.count || (options.questionIds && options.questionIds.length) || ($('#practice-count') && $('#practice-count').value) || 20);
    const count = Math.max(1, Math.min(pool.length, Math.floor(countValue)));
    const sourceOrder = options.sourceOrder || ($('#practice-order') && $('#practice-order').value === 'source');
    const selectedOrder = pool.slice(0, count).map(question => question.id);
    const sessionOrder = sourceOrder ? selectedOrder : shuffle(selectedOrder);
    const presentation = {};
    const answers = {};
    sessionOrder.forEach(id => {
      const question = getQuestion(id);
      const key = String(id);
      if (question.type === 'single' || question.type === 'multiple') presentation[key] = { choices: shuffleDifferent(question.options.map((_, index) => index)) };
      else if (question.type === 'matching') presentation[key] = { pairOrder: shuffleDifferent(question.pairs.map((_, index) => index)), pairs: question.pairs.map(pair => shuffleDifferent(pair.options.map((_, index) => index))) };
      else if (question.type === 'ordering') answers[key] = shuffleDifferent(question.items.map((_, index) => index));
    });
    state.practice = { order: sessionOrder, index: 0, answers, checked: {}, presentation, topic: topic === 'all' ? 'All topics' : topic, startedAt: Date.now() };
    state.view = 'practice';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function checkPractice() {
    const question = state.practice && getQuestion(state.practice.order[state.practice.index]);
    if (!question) return;
    const answer = state.practice.answers[String(question.id)];
    if (!quiz.hasAnswer(question, answer)) { toast('Choose an answer before checking it.'); return; }
    state.practice.checked[String(question.id)] = true;
    const stats = state.practiceStats[String(question.id)] || { attempts: 0, correct: 0 };
    stats.attempts++;
    if (quiz.isCorrect(question, answer)) stats.correct++;
    state.practiceStats[String(question.id)] = stats;
    storage.savePractice(state.practiceStats);
    render();
  }
  function completePractice() {
    if (!state.practice) return;
    const details = state.practice.order.map(id => {
      const question = getQuestion(id);
      const answer = state.practice.answers[String(id)];
      const answered = quiz.hasAnswer(question, answer);
      return { id, topic: question.topic || 'Uncategorized', answer: answer === undefined ? null : answer, answered, correct: answered && quiz.isCorrect(question, answer), presentation: state.practice.presentation[String(id)] || null };
    });
    const total = details.length;
    const correct = details.filter(detail => detail.correct).length;
    const unanswered = details.filter(detail => !detail.answered).length;
    const attempt = { id: `practice-${Date.now()}`, type: 'practice', topic: state.practice.topic, date: new Date().toISOString(), total, correct, incorrect: total - correct - unanswered, unanswered, score: total ? correct / total * 100 : 0, timeSpent: Math.max(0, Math.floor((Date.now() - state.practice.startedAt) / 1000)), details };
    state.attempts.unshift(attempt);
    saveAttempts();
    state.practice = null;
    state.result = attempt;
    state.view = 'result';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function toggleBookmark(id) {
    if (isBookmarked(id)) state.bookmarks = state.bookmarks.filter(value => String(value) !== String(id));
    else state.bookmarks.push(id);
    saveBookmarks();
    render();
  }
  function moveOrdering(from, to) {
    const question = state.view === 'exam' ? currentExamQuestion() : state.practice && getQuestion(state.practice.order[state.practice.index]);
    if (!question || question.type !== 'ordering') return;
    const map = state.view === 'exam' ? state.exam.answers : state.practice.answers;
    const key = String(question.id);
    const values = Array.isArray(map[key]) ? [...map[key]] : quiz.makeBlankAnswer(question);
    if (to < 0 || to >= values.length || from < 0 || from >= values.length) return;
    [values[from], values[to]] = [values[to], values[from]];
    saveAnswer(question, values);
  }
  function startIncorrectPractice() {
    if (!state.result) return;
    const wrong = state.result.details.filter(detail => !detail.correct).map(detail => detail.id);
    if (!wrong.length) { toast('There are no incorrect or unanswered questions in this attempt.'); return; }
    startPractice({ topic: 'all', count: wrong.length, sourceOrder: true, questionIds: wrong });
  }
  function exportResults() {
    if (!state.attempts.length) { toast('There are no results to export yet.'); return; }
    const format = window.confirm('Choose OK for JSON export, or Cancel for CSV export.') ? 'json' : 'csv';
    let content;
    let type;
    let filename;
    if (format === 'json') {
      content = JSON.stringify(state.attempts, null, 2); type = 'application/json'; filename = 'netsecure-results.json';
    } else {
      const rows = [['type', 'topic', 'date', 'score', 'status', 'correct', 'incorrect', 'unanswered', 'total', 'time_spent_seconds']];
      state.attempts.forEach(item => { const isPractice = item.type === 'practice'; rows.push([item.type || 'exam', item.topic || '', item.date, Math.round(item.score), isPractice ? 'COMPLETED' : item.score >= PASS_MARK ? 'PASS' : 'FAIL', item.correct, item.incorrect, item.unanswered, item.total, item.timeSpent]); });
      content = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n'); type = 'text/csv'; filename = 'netsecure-results.csv';
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    toast(`${format.toUpperCase()} results exported.`);
  }
  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const validation = quiz.normalizeBank(parsed);
        if (!validation.ok) {
          const summary = validation.errors.slice(0, 4).join(' ');
          toast(`Import failed: ${summary}${validation.errors.length > 4 ? ` Plus ${validation.errors.length - 4} more issues.` : ''}`, true);
          return;
        }
        state.questions = validation.questions;
        state.expectedCount = Number(parsed.expectedCount) || EXPECTED_QUESTIONS;
        state.revision = { topic: 'all', order: [], index: 0, revealed: false };
        if (!storage.saveQuestionBank(parsed)) toast('Question bank loaded, but browser storage could not save it. Use Live Server and keep a backup JSON.', true);
        state.view = 'dashboard';
        render();
        const missing = Array.from({ length: state.expectedCount }, (_, index) => index + 1).filter(id => !state.questions.some(question => String(question.id) === String(id)));
        if (state.questions.length !== state.expectedCount || missing.length) {
          const detail = missing.length ? `Missing IDs: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? ` and ${missing.length - 20} more` : ''}.` : `Expected ${state.expectedCount} records.`;
          toast(`${number(state.questions.length)} imported, but the bank does not match the expected ${number(state.expectedCount)} questions. ${detail}`, true);
        } else if (getIncompleteQuestions().length) toast(`${number(state.questions.length)} questions imported; ${getIncompleteQuestions().length} records still need answer details.`, true);
        else toast(`${number(state.questions.length)} questions imported. Verify answer keys and image references against your source.`);
      } catch (error) { toast('That file is not valid JSON.', true); }
    };
    reader.onerror = () => toast('Could not read that file.', true);
    reader.readAsText(file);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button, [data-view], .search-result');
    if (!button) return;
    if (button.dataset.view) { event.preventDefault(); setView(button.dataset.view); return; }
    if (button.dataset.answerIndex !== undefined) { choiceClick(button); return; }
    const action = button.dataset.action;
    if (!action) return;
    switch (action) {
      case 'import': $('#import-file').click(); break;
      case 'start-exam': startExam(); break;
      case 'start-practice': startPractice(); break;
      case 'toggle-revision-answer': state.revision.revealed = !state.revision.revealed; render(); break;
      case 'previous-revision': if (state.revision.index > 0) { state.revision.index--; state.revision.revealed = false; render(); } break;
      case 'next-revision': if (state.revision.index < state.revision.order.length - 1) { state.revision.index++; state.revision.revealed = false; render(); } break;
      case 'shuffle-revision': state.revision.order = shuffle([...state.revision.order]); state.revision.index = 0; state.revision.revealed = false; render(); break;
      case 'previous-question': if (state.exam && state.exam.index > 0) { state.exam.index--; render(); } break;
      case 'next-question': if (state.exam) { if (state.exam.index < state.exam.order.length - 1) state.exam.index++; else state.exam.reviewing = true; render(); } break;
      case 'jump-question': if (state.exam) { state.exam.index = Number(button.dataset.index); state.exam.reviewing = false; render(); } break;
      case 'return-exam': if (state.exam) { state.exam.reviewing = false; render(); } break;
      case 'toggle-flag': { const q = currentExamQuestion(); if (q) { state.exam.flagged[String(q.id)] = !state.exam.flagged[String(q.id)]; render(); } break; }
      case 'submit-exam': submitExam(false); break;
      case 'check-answer': checkPractice(); break;
      case 'previous-practice': if (state.practice && state.practice.index > 0) { state.practice.index--; render(); } break;
      case 'next-practice': if (state.practice && state.practice.index < state.practice.order.length - 1) { state.practice.index++; render(); } else completePractice(); break;
      case 'toggle-bookmark': toggleBookmark(button.dataset.id); break;
      case 'remove-bookmark': event.stopPropagation(); toggleBookmark(button.dataset.id); break;
      case 'order-move': moveOrdering(Number(button.dataset.from), Number(button.dataset.to)); break;
      case 'review-incorrect': startIncorrectPractice(); break;
      case 'retake-exam': setView('exam-setup'); break;
      case 'export-results': exportResults(); break;
      case 'show-answer-review': if (state.result) { state.result.includeReview = true; render(); } break;
      case 'open-attempt': { const attempt = state.attempts[Number(button.dataset.index)]; if (attempt) { state.result = attempt; setView('result'); } break; }
      case 'toggle-review': { const detail = button.nextElementSibling; const open = detail && !detail.hidden; if (detail) detail.hidden = open; button.setAttribute('aria-expanded', String(!open)); break; }
      case 'open-bookmark': if (!event.target.closest('[data-action="remove-bookmark"]')) { const id = button.dataset.id; startPractice({ questionIds: [id], count: 1, sourceOrder: true }); } break;
      case 'open-search-question': { const id = button.dataset.id; startPractice({ questionIds: [id], count: 1, sourceOrder: true }); break; }
    }
  });

  document.addEventListener('change', event => {
    if (event.target.id === 'revision-topic') { startRevision(event.target.value); render(); }
    if (event.target.matches('[data-pair]')) {
      const question = state.view === 'exam' ? currentExamQuestion() : state.practice && getQuestion(state.practice.order[state.practice.index]);
      if (!question) return;
      const map = state.view === 'exam' ? state.exam.answers : state.practice.answers;
      const values = Array.isArray(map[String(question.id)]) ? [...map[String(question.id)]] : quiz.makeBlankAnswer(question);
      values[Number(event.target.dataset.pair)] = event.target.value === '' ? -1 : Number(event.target.value);
      saveAnswer(question, values);
    }
    if (event.target.id === 'exam-duration') $('#custom-duration-field').style.display = event.target.value === 'custom' ? 'grid' : 'none';
  });
  $('#import-file').addEventListener('change', event => { importFile(event.target.files[0]); event.target.value = ''; });
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#global-search').addEventListener('input', event => {
    state.searchTerm = event.target.value;
    if (state.searchTerm.trim()) {
      state.view = 'search';
      $$('.nav-item').forEach(item => item.classList.remove('active'));
      $('#crumb-current').textContent = titles.search;
      render();
    } else if (state.view === 'search') {
      state.view = 'dashboard';
      $('#crumb-current').textContent = titles.dashboard;
      render();
    }
  });
  $('#global-search').addEventListener('focus', event => { if (window.innerWidth <= 600) { event.target.style.display = 'block'; event.target.parentElement.style.width = '180px'; event.target.parentElement.style.padding = '0 9px'; } });
  $('#global-search').addEventListener('keydown', event => { if (event.key === 'Enter' && state.searchTerm.trim()) setView('search'); if (event.key === 'Escape') { event.target.value = ''; state.searchTerm = ''; if (state.view === 'search') setView('dashboard'); } });
  $('#app').addEventListener('error', event => {
    if (event.target && event.target.tagName === 'IMG' && event.target.classList.contains('question-image')) {
      const placeholder = document.createElement('div');
      placeholder.className = 'image-missing';
      placeholder.innerHTML = '<span>▧</span><span>This exhibit could not be loaded. Check the image path in the imported question bank.</span>';
      event.target.replaceWith(placeholder);
    }
  }, true);
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#global-search').focus(); return; }
    const tag = event.target && event.target.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target.isContentEditable) return;
    if (state.view === 'exam' && state.exam) {
      const key = event.key.toLowerCase();
      const question = currentExamQuestion();
      if (['a', 'b', 'c', 'd'].includes(key) && question && ['single', 'multiple'].includes(question.type)) {
        const index = key.charCodeAt(0) - 97;
        if (index < question.options.length) { event.preventDefault(); const target = $(`[data-answer-index="${index}"]`); if (target) choiceClick(target); }
      } else if (event.key === 'ArrowLeft' && state.exam.index > 0) { state.exam.index--; render(); }
      else if (event.key === 'ArrowRight' && state.exam.index < state.exam.order.length - 1) { state.exam.index++; render(); }
    } else if (state.view === 'practice' && state.practice && event.key === 'Enter') {
      const question = getQuestion(state.practice.order[state.practice.index]);
      if (state.practice.checked[String(question.id)]) $('[data-action="next-practice"]')?.click();
      else $('[data-action="check-answer"]')?.click();
    }
  });

  async function loadQuestionData() {
    const imported = storage.getQuestionBank();
    let bundled = null;
    try {
      const response = await fetch('data/questions.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Question file could not be loaded.');
      const parsed = await response.json();
      const normalized = quiz.normalizeBank(parsed);
      if (normalized.ok) {
        bundled = { data: parsed, questions: normalized.questions };
      } else toast('The local question bank has invalid records.', true);
    } catch (error) {
      // Opening index.html directly can block local JSON fetches. Import remains available.
    }
    if (imported) {
      const normalized = quiz.normalizeBank(imported);
      if (normalized.ok) {
        const sameSource = bundled && imported.source && imported.source === bundled.data.source;
        const savedIncomplete = normalized.questions.filter(question => question.incomplete === true).length;
        const bundledIncomplete = bundled ? bundled.questions.filter(question => question.incomplete === true).length : 0;
        if (sameSource && normalized.questions.length === bundled.questions.length && savedIncomplete > bundledIncomplete) {
          state.questions = bundled.questions;
          state.expectedCount = Number(bundled.data.expectedCount) || EXPECTED_QUESTIONS;
          storage.saveQuestionBank(bundled.data);
          toast('The saved question bank was updated with the completed answer maps.');
        } else {
          state.questions = normalized.questions;
          state.expectedCount = Number(imported.expectedCount) || EXPECTED_QUESTIONS;
          render();
          return;
        }
      } else toast('Saved question bank could not be loaded. Import a corrected JSON file.', true);
    }
    if (bundled && !state.questions.length) {
      state.questions = bundled.questions;
      state.expectedCount = Number(bundled.data.expectedCount) || EXPECTED_QUESTIONS;
    }
    render();
  }

  render();
  loadQuestionData();
})();
