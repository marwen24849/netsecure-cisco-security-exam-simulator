# NetSecure

A local, vanilla HTML/CSS/JavaScript Cisco Network Security exam simulator with exam mode, practice mode, a dedicated exam revision view, timed attempts, question navigation, saved questions, history, and learning analytics.

## Run it

Open `index.html` directly, or serve this folder with VS Code Live Server. Direct file opening works for the interface; browsers may block loading `data/questions.json` from `file://`, so use Live Server or import a JSON bank from the dashboard in that case.

## Question bank

`data/questions.json` contains all 153 records numbered 1–153, extracted from the user-provided HTML. Source-marked answer keys are structured for all 153 records, including the matching maps transcribed from the Question 121 and 127 exhibits. The source page lists the exam through question 153: https://itexamanswers.net/network-security-version1-0-final-exam-answers-full.html.

Thirty exhibit image references are included across 29 records. Questions 121 and 127 use local copies in `assets/images`; the other exhibit references point to the source site and need an internet connection. The answer key is transcribed from the supplied page and its exhibits; it has not been independently checked against Cisco materials.

You can edit `data/questions.json` directly or use **Import question bank** in the app. Imported files are stored in this browser's local storage.

The app accepts either an array of question records or an object with a `questions` array. A record uses this shape:

```json
{
  "id": 1,
  "topic": "ASA and Firewalls",
  "type": "single",
  "question": "Question text",
  "options": ["Answer one", "Answer two", "Answer three", "Answer four"],
  "correctAnswers": [1],
  "explanation": "Optional explanation.",
  "images": [{ "src": "https://example.com/exhibit.png", "alt": "Network exhibit" }]
}
```

`correctAnswers` contains zero-based option indexes. Use `type: "multiple"` and include every correct index for multiple-answer questions. For matching records, provide `pairs: [{"left":"...","options":["..."],"correct":0}]`. For ordering records, provide `items: ["...", "..."]` and `correctOrder: [1, 0]`. Images can be given as an `images` array or as one `image` value; each entry may be a URL string or `{ "src": "...", "alt": "...", "caption": "..." }`.

The importer checks the structure and reports missing IDs, prompts, and answer keys. Records intentionally marked `incomplete: true` are retained for review but are excluded from practice and block scored full exams. The importer does not verify answer correctness or fetch remote exhibits.

## Features

- 90-minute default exam timer, configurable before each attempt, with 10- and 5-minute warnings and automatic submission.
- One-question exam view with direct navigation, answer/flag state, unanswered count, and a confirmation before submission.
- Results at a 70% passing threshold, per-question review, and time-spent reporting.
- Practice mode with a configurable starting question number and question count, topic filtering, source or random order, shuffled answer choices, and immediate feedback.
- Exam revision with topic filters, hidden answer keys, explanations, and memory cues for active recall.
- Weak-topic analytics, exam and completed practice-lab history with scores and answer reviews, bookmarks, question search, and JSON/CSV result export.
- Local persistence for the question bank, settings, bookmarks, practice progress, and attempts.

All interface content is in English. Question content and explanations are provided by the imported bank.
