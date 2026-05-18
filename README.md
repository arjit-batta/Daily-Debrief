# Daily Debrief 🪞

A personal AI accountability agent. Evening check-in that tracks patterns 
and reflects back what you're avoiding.

---

## The Problem

Most productivity apps are about inputs — adding tasks, setting reminders. 
Nobody has solved the reflection layer.

I know what I need to do. My failure mode is consistency, not knowledge. 
Existing apps track what I plan but never ask what actually happened and why.

Daily Debrief is a 2-minute evening conversation with an AI that knows 
your history and calls out your patterns.

---

## What It Does

- **Evening check-in** — Three prompts: what you planned, what you did, 
  what got in the way
- **AI reflection** — Claude responds with a contextual observation that 
  references yesterday and spots emerging patterns
- **Persistent memory** — Last 7 days of entries passed to Claude on every 
  check-in, so it builds a real picture over time
- **History log** — Collapsible past entries, newest first

---

## What Makes It Different

Every to-do app tracks inputs. Daily Debrief tracks the gap between 
intention and reality — and uses AI to find patterns in that gap.

After a week of entries, it knows: which types of tasks you consistently 
defer, what time-of-day or situational triggers cause drop-off, and whether 
your personal commitments get sacrificed for work ones.

That's not a feature any task manager offers. It requires an AI that 
reasons across your history, not just stores it.

---

## Technical Approach

- **Vanilla HTML/CSS/JS** — no frameworks, runs in any browser
- **Claude API** — claude-opus-4-5 model via Anthropic's messages API
- **Chain-of-Thought prompting** — system prompt structures Claude's 
  reasoning: acknowledge today, reference yesterday explicitly, identify 
  patterns across the week, suggest one concrete change
- **localStorage** — entries persist locally in the browser; privacy-first, 
  no backend required
- **Sliding context window** — last 7 days of full entries (planned, actual, 
  blockers, and past reflections) passed on every API call

---

## How to Run

Requires a local server (browser blocks API calls from file:// URLs).

```bash
cd daily-debrief
python3 -m http.server 8080
```

Open http://localhost:8080

On first check-in, paste your Anthropic API key when prompted. 
Key is stored only in your browser's localStorage.

---

## Roadmap

- [ ] **Voice input** — speak your check-in instead of typing
- [ ] **Weekly pattern summary** — Sunday digest of the week's patterns
- [ ] **Streak tracking** — consistency visualisation
- [ ] **Export** — download entries as CSV or markdown

---

## Why I Built This

I'm a PM who thinks about AI product design daily. I wanted hands-on 
experience building an agent with persistent memory — not a toy demo, 
but something I'd use every evening and iterate on based on real friction.

The core PM question I wanted to answer: can a 2-minute daily habit, 
supported by an AI that remembers your history, actually change behaviour? 
I'm now the guinea pig.
