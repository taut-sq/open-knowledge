
export type PackId =
  | 'knowledge-base'
  | 'software-lifecycle'
  | 'plain-notes'
  | 'worldbuilding'
  | 'writing-pipeline'
  | 'entity-vault';

export const DEFAULT_PACK_ID: PackId = 'knowledge-base';

export interface StarterFolder {
  path: string;
  title: string;
  description: string;
  tags: string[];
  starterTemplate: string;
  extraTemplates?: readonly string[];
}

export interface StarterPack {
  id: PackId;
  name: string;
  description: string;
  defaultSubfolder?: string;
  folders: readonly StarterFolder[];
  templates: Readonly<Record<string, string>>;
  rootFiles?: Readonly<Record<string, string>>;
}


const KNOWLEDGE_BASE_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'external-sources',
    title: 'External Sources',
    description:
      'Raw sources saved verbatim — the fetched text of URLs, extracted PDFs, and copied files, each with the original URL and access date in frontmatter. Produced by `ingest`. Immutable after capture; no analysis here (that goes in `research/`).',
    tags: ['source', 'immutable', 'layer-ingest'],
    starterTemplate: 'clip',
  },
  {
    path: 'research',
    title: 'Research',
    description:
      'Provisional analysis that synthesizes the external sources. Every claim cites a doc in `external-sources/`; `status: provisional`. Promoted to `articles/` via `consolidate` once the findings are stable.',
    tags: ['research', 'provisional', 'layer-research'],
    starterTemplate: 'research-log',
  },
  {
    path: 'articles',
    title: 'Articles',
    description:
      'Canonical knowledge, committed after a team decision. The source of truth for the domain; carries a `supersedes:` chain back to the `research/` docs it replaces.',
    tags: ['article', 'canonical', 'layer-consolidate'],
    starterTemplate: 'article',
  },
] as const;

const KNOWLEDGE_BASE_TEMPLATES: Readonly<Record<string, string>> = {
  clip: `---
title: External Source
description: Capture a URL or article text verbatim as raw reference material. For binary files (PDFs, images, audio), use the \`ingest\` tool instead — this \`clip\` template is for text sources only.
---
---
source_url:
date_fetched: {{date}}
preservation: text-extracted
tags: [source, immutable, layer-ingest, text]
---

## Source

## Highlights

## My notes
`,
  'research-log': `---
title: Research Log
description: Provisional analysis synthesizing external sources. Every factual claim cites a doc in external-sources/. Promoted to articles/ via consolidate once findings are stable.
---
---
status: provisional
sources: []
created: {{date}}
author: {{user}}
tags: [research, provisional]
---

## Question

## Sources cited

## Findings

## Open questions
`,
  article: `---
title: Canonical Article
description: Canonical knowledge committed after a team decision. Carries status:canonical plus a supersedes chain tying back to the research/ docs it replaces. Source-of-truth for the domain.
---
---
status: canonical
supersedes: []
authored: {{date}}
author: {{user}}
tags: [article, canonical]
---

## Summary

## Body

## References
`,
};

const KNOWLEDGE_BASE_LOG_MD = `---
title: Work Log
description: Append-only audit trail of changes to this knowledge base.
---

# Work Log

Append-only audit trail. Add one dated entry per turn that creates, edits, or restructures content. The knowledge-base skill describes what to log and the entry shape.
`;


const SOFTWARE_LIFECYCLE_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'proposals',
    title: 'Proposals',
    description:
      'In-flight design proposals (RFC-shape), one file per proposal (`0001-feature-name.md`). Status flows `draft → fcp → accepted/rejected`; accepted proposals graduate to a record in `decisions/`.',
    tags: ['proposal', 'design', 'in-flight'],
    starterTemplate: 'proposal',
  },
  {
    path: 'decisions',
    title: 'Decisions',
    description:
      'Architecture Decision Records (MADR / Nygard shape), frozen once accepted. One file per decision (`NNNN-title.md`); a new decision links back via `Supersedes:` to the one it replaces.',
    tags: ['decision', 'adr', 'frozen'],
    starterTemplate: 'decision',
  },
  {
    path: 'specs',
    title: 'Specs',
    description:
      'Implementation specs derived from accepted proposals. Prefer the `github/spec-kit` triple — one folder per spec with `spec.md` + `plan.md` + `tasks.md` (the folder ships all three templates). References the parent proposal.',
    tags: ['spec', 'implementation'],
    starterTemplate: 'spec',
    extraTemplates: ['spec-plan', 'spec-tasks'],
  },
  {
    path: 'postmortems',
    title: 'Postmortems',
    description:
      'Blameless incident write-ups, one file per incident (`YYYY-MM-DD-name.md`): Summary / Timeline / Root cause / What went well / Action items (Google SRE shape).',
    tags: ['postmortem', 'incident', 'blameless'],
    starterTemplate: 'postmortem',
  },
  {
    path: 'guides',
    title: 'Guides',
    description:
      'How-to guides, onboarding docs, and service runbooks (Diátaxis "how-to"). Ships `guide`, `onboarding-guide`, and `runbook` templates; carries `last_verified`.',
    tags: ['guide', 'how-to', 'onboarding'],
    starterTemplate: 'guide',
    extraTemplates: ['onboarding-guide', 'runbook'],
  },
] as const;

const SOFTWARE_LIFECYCLE_TEMPLATES: Readonly<Record<string, string>> = {
  proposal: `---
title: Proposal Title
description: One-line summary of the proposal.
---
---
status: draft
authors: [{{user}}]
created: {{date}}
tags: [proposal]
---

## Motivation

## Design

## Drawbacks

## Alternatives

## Unresolved questions
`,
  decision: `---
title: Decision Title
description: One-line decision summary.
---
---
status: proposed
date: {{date}}
deciders: [{{user}}]
supersedes: []
tags: [decision]
---

## Context

## Decision

## Consequences
`,
  spec: `---
title: Spec Title
description: One-line description of what's being built.
---
---
status: draft
owner: {{user}}
target_release:
created: {{date}}
parent_proposal:
tags: [spec]
---

## Goals

## Non-goals

## Design

## Migration

## Test plan
`,
  'spec-plan': `---
title: 'Plan: <Spec Title>'
description: Implementation plan derived from the parent spec. Pairs with spec.md and tasks.md (github/spec-kit triple shape).
---
---
parent_spec:
created: {{date}}
author: {{user}}
tags: [spec, plan]
---

## Approach

## Phases

## Risks + unknowns

## Dependencies

## Rollout
`,
  'spec-tasks': `---
title: 'Tasks: <Spec Title>'
description: Task checklist for the parent spec. Pairs with spec.md and plan.md (github/spec-kit triple shape).
---
---
parent_spec:
created: {{date}}
author: {{user}}
tags: [spec, tasks]
---

## Tasks

- [ ]
- [ ]
- [ ]

## Done when

## Out of scope
`,
  guide: `---
title: '<Topic>: <Action>'
description: One-line summary of what the reader will accomplish.
---
---
category: how-to
last_verified: {{date}}
tags: [guide]
---

## Goal

## Steps

## Troubleshooting

## Links
`,
  'onboarding-guide': `---
title: 'Onboarding: <Audience>'
description: First-N-days setup path for <audience> (e.g. new engineer, new contributor, new oncall).
---
---
category: onboarding
audience:
last_verified: {{date}}
tags: [guide, onboarding]
---

## Who this is for

## Day 1: get set up

## Day 1-3: first useful contribution

## Week 1: orient

## When you're stuck

## Links
`,
  runbook: `---
title: '<Service>: <Symptom>'
description: Oncall procedure for diagnosing and remediating <symptom> in <service>.
---
---
category: runbook
service:
severity:
last_verified: {{date}}
tags: [guide, runbook, oncall]
---

## Symptom

## Diagnosis

## Remediation

## Escalation

## Links
`,
  postmortem: `---
title: 'Incident: <short name>'
description: Blameless postmortem for <incident>.
---
---
severity:
duration:
services: []
status: draft
date: {{date}}
authors: [{{user}}]
tags: [postmortem]
---

## Summary

## Timeline

## Root cause

## What went well

## Action items
`,
};


const PLAIN_NOTES_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'notes',
    title: 'Notes',
    description:
      'Flat notes, one file per topic. The "I just want to write" home base — link freely and the graph builds itself.',
    tags: ['notes', 'flat'],
    starterTemplate: 'note',
  },
  {
    path: 'daily',
    title: 'Daily',
    description:
      'Daily journal entries, one file per day (`YYYY-MM-DD.md`): morning intentions, evening reflection.',
    tags: ['daily', 'journal'],
    starterTemplate: 'daily',
  },
] as const;

const PLAIN_NOTES_TEMPLATES: Readonly<Record<string, string>> = {
  note: `---
title: Note title
description: One-line summary.
---
---
created: {{date}}
author: {{user}}
tags: []
---
`,
  daily: `---
title: Daily entry
description: Daily journal entry.
---
---
title: {{date}}
date: {{date}}
author: {{user}}
mood:
top3: []
gratitude: []
tags: [daily]
---

## Morning intentions

## Throughout the day

## Evening reflection

- What shipped:
- What stalled:
- Gratitude:
`,
};


const WORLDBUILDING_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'characters',
    title: 'Characters',
    description:
      'One file per character (PC + NPC); frontmatter carries `type`, status, faction, first appearance.',
    tags: ['character', 'fiction', 'entity'],
    starterTemplate: 'character',
  },
  {
    path: 'settings',
    title: 'Settings',
    description:
      'Locations, regions, and world-rules — the "where" of the story. Frontmatter carries region, controlling faction, danger level.',
    tags: ['setting', 'location', 'world'],
    starterTemplate: 'setting',
  },
  {
    path: 'themes',
    title: 'Themes',
    description:
      'Recurring narrative concerns (love, betrayal, identity) — the "why" of the story. Each entry captures the theme and its tension.',
    tags: ['theme', 'narrative', 'meaning'],
    starterTemplate: 'theme',
  },
  {
    path: 'factions',
    title: 'Factions',
    description:
      'Political, social, criminal, magical, or religious groups — the "who-vs-who" of the story. Ships `faction`, `political-faction`, and `religion` templates.',
    tags: ['faction', 'group', 'politics'],
    starterTemplate: 'faction',
    extraTemplates: ['political-faction', 'religion'],
  },
  {
    path: 'lore',
    title: 'Lore',
    description:
      'History, mythology, cosmology, and magic systems — the foundational fabric the story stands on. Ships `lore`, `magic-system`, and `historical-event` templates.',
    tags: ['lore', 'history', 'world'],
    starterTemplate: 'lore',
    extraTemplates: ['magic-system', 'historical-event'],
  },
] as const;

const WORLDBUILDING_TEMPLATES: Readonly<Record<string, string>> = {
  character: `---
title: Character Name
description: One-line characterization.
---
---
type: character
status: alive
faction: []
first_appeared:
created: {{date}}
author: {{user}}
tags: [character]
---

## Appearance

## Voice & motives

## Arc

## Links
`,
  setting: `---
title: Setting Name
description: One-line atmospheric summary.
---
---
type: setting
region:
controlling_faction:
danger_level:
created: {{date}}
author: {{user}}
tags: [setting]
---

## Sense of place

## What happens here

## What's hidden
`,
  theme: `---
title: Theme Name
description: One-line statement of the recurring concern.
---
---
type: theme
created: {{date}}
author: {{user}}
tags: [theme]
---

## Statement

## Manifestations

## Tension
`,
  faction: `---
title: Faction Name
description: One-line description of who they are and what they want.
---
---
type: faction
alignment:
leader:
members: []
rivals: []
created: {{date}}
author: {{user}}
tags: [faction]
---

## Agenda

## Resources

## Internal tensions
`,
  'political-faction': `---
title: Faction Name
description: One-line summary of their politics and their ambition.
---
---
type: political-faction
form: monarchy
seat:
leader:
holdings: []
allies: []
rivals: []
ideology:
created: {{date}}
author: {{user}}
tags: [faction, politics]
---

## Ideology

## Holdings

## Power structure

## Relations

## Pressure points
`,
  religion: `---
title: Religion Name
description: One-line summary of the faith and its central tension.
---
---
type: religion
deity:
pantheon: []
clergy_structure:
founded_era:
followers_count_rough:
holy_sites: []
schisms: []
created: {{date}}
author: {{user}}
tags: [faction, religion]
---

## Core belief

## Practices

## Hierarchy

## Schisms + heresies

## Relations with power
`,
  lore: `---
title: Lore Topic
description: One-line summary.
---
---
type: lore
era:
scope: history
created: {{date}}
author: {{user}}
tags: [lore]
---

## Core

## Variants

## Implications
`,
  'magic-system': `---
title: Magic System Name
description: One-line summary of the source and the cost.
---
---
type: magic-system
source:
cost:
discoverable_by: []
practitioners: []
forbidden_acts: []
created: {{date}}
author: {{user}}
tags: [lore, magic]
---

## Source

## Costs + limits

## Practitioners

## Forbidden acts

## How it shapes the world
`,
  'historical-event': `---
title: Event Name
description: One-line summary of what happened and why it mattered.
---
---
type: historical-event
when:
where:
duration:
key_figures: []
factions_involved: []
sources_cited: []
created: {{date}}
author: {{user}}
tags: [lore, history]
---

## What happened

## Causes

## Consequences

## In-world tellings

## Source
`,
};


const WRITING_PIPELINE_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'ideas',
    title: 'Ideas',
    description:
      'One-line ideas captured before they fade — premises, headlines, fragments. Not a draft folder; promote an idea into `drafts/` when you commit to writing it.',
    tags: ['idea', 'inbox', 'pre-draft'],
    starterTemplate: 'idea',
  },
  {
    path: 'drafts',
    title: 'Drafts',
    description:
      'Active prose. Frontmatter tracks `status`, word count, and parent idea. CRDT history covers every revision, so no named-revision folders.',
    tags: ['draft', 'prose'],
    starterTemplate: 'draft',
  },
  {
    path: 'published',
    title: 'Published',
    description:
      'Shipped work; carries `published_at`, `canonical_url`, `channel`. Treat as immutable — to revise, copy to a new draft.',
    tags: ['published', 'live'],
    starterTemplate: 'published',
  },
] as const;

const WRITING_PIPELINE_TEMPLATES: Readonly<Record<string, string>> = {
  idea: `---
title: Idea title
description: One-line hook.
---
---
captured_at: {{date}}
hook:
tags: [idea]
---

## Stimulus
`,
  draft: `---
title: Draft title
description: What's this piece about?
---
---
status: drafting
target_form:
target_words:
parent_idea:
created: {{date}}
author: {{user}}
tags: [draft]
---

`,
  published: `---
title: Published title
description: One-line summary.
---
---
status: published
published_at:
canonical_url:
channel:
parent_draft:
author: {{user}}
tags: [published]
---

`,
};


const ENTITY_VAULT_FOLDERS: readonly StarterFolder[] = [
  {
    path: 'people',
    title: 'People',
    description:
      'Person dossiers. Compiled-truth section above `--- timeline ---` (rewritten as understanding changes); append-only timeline below using `- **YYYY-MM-DD** | source | @author — evidence` bullets. Frontmatter `type: person`. Prefer path-qualified links such as `[[companies/acme|Acme]]` and `[[meetings/2026-05-12-acme|meeting]]` when identity matters. Agent: when a meeting note mentions a person not yet captured, stub a file here; route new facts into either compiled-truth (current synthesis) or timeline (raw evidence). Never rewrite the timeline.',
    tags: ['person', 'entity', 'dossier'],
    starterTemplate: 'person',
  },
  {
    path: 'companies',
    title: 'Companies',
    description:
      'Company dossiers. Same body convention as `people/`: compiled-truth above `--- timeline ---`, append-only parseable timeline below. Frontmatter `type: company`. Prefer path-qualified links to `people/`, `meetings/`, and `concepts/`. Agent: when a person dossier references a company not yet captured, stub a file here; surface company-to-person edges when both exist.',
    tags: ['company', 'entity', 'dossier'],
    starterTemplate: 'company',
  },
  {
    path: 'meetings',
    title: 'Meetings',
    description:
      'Meeting notes. Filename `YYYY-MM-DD-<slug>.md`. Frontmatter carries `title`, `date`, `attendees:` (prefer person slugs/names that resolve to `people/` dossiers), and `type: meeting`. Body is raw notes with path-qualified links to the people, companies, and concepts mentioned. Agent: after a meeting note lands, extract entity mentions and append dated timeline bullets to each referenced dossier. Do NOT rewrite the meeting note; it is the verbatim record.',
    tags: ['meeting', 'note'],
    starterTemplate: 'meeting',
  },
  {
    path: 'concepts',
    title: 'Concepts',
    description:
      'Evergreen idea pages: abstract patterns, frameworks, recurring concepts that surface across people / companies / meetings. Compiled-truth above `--- timeline ---`, append-only parseable timeline below. Frontmatter `type: concept`. Agent: when a meeting note or person dossier references a concept (e.g. "agent-runtime observability") not yet captured, stub a file here; thread path-qualified links so the concept becomes a hub for everywhere it appears.',
    tags: ['concept', 'idea', 'evergreen'],
    starterTemplate: 'concept',
  },
  {
    path: 'originals',
    title: 'Originals',
    description:
      "Your own thinking, untransformed. Frontmatter `type: original`. Use freely; link to anything that should become its own entity. Agent: treat originals as authoritative source material when extracting facts; these are the user's words, not inferences. Append timeline entries to referenced dossiers when a clear new claim appears, citing the original by markdown link.",
    tags: ['original', 'thinking', 'user'],
    starterTemplate: 'original',
  },
  {
    path: 'media',
    title: 'Media',
    description:
      "Bulk transcripts, voice notes, articles, large attachments. Frontmatter `type: transcript` (template provided). Often `.okignore`-d so the OK index stays light. Keep raw media/source material here; analysis belongs in dossiers, not here. If you also run Garry Tan's `gbrain`, import/sync can index these Markdown transcripts alongside the entity dossiers.",
    tags: ['media', 'transcript', 'bulk'],
    starterTemplate: 'transcript',
  },
] as const;

const ENTITY_VAULT_TEMPLATES: Readonly<Record<string, string>> = {
  person: `---
title: Person Name
description: One-line characterization. Who they are, why they matter to you.
---
---
type: person
title: Person Name
created: {{date}}
author: {{user}}
tags: [person]
---

## Compiled truth

(Your current best understanding. Rewrite this section as new evidence changes the synthesis. Prefer path-qualified links such as [[companies/acme|Acme]] when identity matters.)

--- timeline ---

## Timeline

- **{{date}}** | source | @{{user}} — First evidence entry. Confidence: draft.
`,
  company: `---
title: Company Name
description: One-line company summary. What they do, who's involved.
---
---
type: company
title: Company Name
created: {{date}}
author: {{user}}
tags: [company]
---

## Compiled truth

(Your current best understanding of the company. Rewrite this section as new evidence changes the synthesis. Prefer path-qualified links such as [[people/jane-founder|Jane Founder]].)

--- timeline ---

## Timeline

- **{{date}}** | source | @{{user}} — First evidence entry. Confidence: draft.
`,
  meeting: `---
title: Meeting Title
description: One-line meeting summary. Fill in after the meeting.
---
---
type: meeting
title: Meeting Title
date: {{date}}
attendees: []
author: {{user}}
tags: [meeting]
---

## Notes

(Raw notes from the meeting. Prefer path-qualified links such as [[people/jane-founder|Jane Founder]], [[companies/jane-co|Jane Co]], and [[concepts/agent-runtime-observability|agent-runtime observability]].)

## Action items

- [ ]
`,
  concept: `---
title: Concept Name
description: One-line concept summary. What it names and why it recurs.
---
---
type: concept
title: Concept Name
created: {{date}}
author: {{user}}
tags: [concept]
---

## Compiled truth

(Your current best understanding of the concept. Rewrite as evidence accumulates. Prefer path-qualified links to source entities.)

--- timeline ---

## Timeline

- **{{date}}** | source | @{{user}} — First evidence entry. Confidence: draft.
`,
  original: `---
title: Idea Title
description: One-line summary of the idea or take.
---
---
type: original
title: Idea Title
date: {{date}}
author: {{user}}
tags: [original]
---

(Your own thinking. Link to anything that should become its own entity, preferably with path-qualified wikilinks once the entity dossier exists.)
`,
  transcript: `---
title: Transcript
description: One-line transcript summary. Source and key topic.
---
---
type: transcript
title: Transcript
date: {{date}}
source:
duration:
author: {{user}}
tags: [transcript, media]
---

## Source

## Transcript

(Paste raw transcript. Keep this raw; route analysis and durable claims into entity dossiers with dated timeline bullets.)
`,
};

const ENTITY_VAULT_LOG_MD = `---
title: Work Log
description: Append-only audit trail. After each turn that creates, edits, or restructures content in the vault, append one dated entry here (one per turn, not per file).
---

# Work Log

Append-only audit trail. **Append a dated entry after any turn that creates, edits, or restructures content in the vault.** One entry per turn, not per file.

What to log:

- New entity dossiers stubbed (\`people/\` / \`companies/\` / \`concepts/\`)
- Meeting notes captured
- GBrain automation summaries, if you choose to copy or route them back into the vault
- Original-thinking captures
- Folder restructures or rule changes

**Reference docs as markdown links, not bare paths.** Every doc you touched should appear as \`[name](./path/to/doc.md)\` so the log shows up in \`links({ kind: "backlinks" })\` for those docs.

<!-- Example entry shape:

## YYYY-MM-DD: <short title>

- <what was done>
- Dossiers updated: [Jane Founder](./people/jane-founder.md), [Jane Co](./companies/jane-co.md)
- Meetings logged: [2026-05-12 coffee](./meetings/2026-05-12-jane-founder-coffee.md)
- Open follow-ups: <topic-1>, <topic-2>

-->
`;

const ENTITY_VAULT_USER_MD = `---
title: User profile
description: Who you are. Agent reads this on every briefing / enrichment pass. Keep current.
---

# User profile

**Name:**

**Role:**

**Current focus areas:**

- ...

**Network anchors:** (people you talk to most — link to their dossiers in \`people/\` once they exist)

- ...

**Communication style:** (how you prefer briefings, summaries, suggestions)

`;

const ENTITY_VAULT_SOUL_MD = `---
title: Agent identity
description: Agent persona, values, voice. Mirrors the SOUL.md convention used in GBrain-style agent workflows; fill in by hand or from your preferred interview flow.
---

# Agent identity (SOUL.md)

**Persona name:**

**Voice + tone:** (how the agent speaks: formal / casual / direct / hedged / etc.)

**Values:** (what the agent optimizes for when faced with trade-offs)

- ...

**What to avoid:** (postures / framings / topics the agent should never adopt)

- ...

Fill this in by hand, or use an agent interview to generate it. Treat it as the local source of truth for how agents should speak and make trade-offs in this vault.
`;

const ENTITY_VAULT_ACCESS_POLICY_MD = `---
title: Access policy
description: What the agent may read, write, and surface. A 4-tier privacy model for GBrain-style agent workflows, useful even without GBrain installed.
---

# Access policy

## Tier 1: Public

(Things the agent may surface in any briefing or shared context.)

## Tier 2: Internal / professional

(Things the agent may use to inform briefings + dossiers, but should not surface to external parties without prompting.)

## Tier 3: Personal

(Things the agent may use to anchor briefings, but should never write into a dossier that might be shared.)

## Tier 4: Restricted

(Things the agent should never read or surface. Use \`.okignore\` to enforce hard exclusion at the file level.)

`;

const ENTITY_VAULT_HEARTBEAT_MD = `---
title: Operational cadence
description: When the agent does scheduled work: daily briefings, end-of-day dossier maintenance, weekly audits. If you also use GBrain, note its sync/dream cadence here.
---

# Heartbeat

## Daily

- **Morning briefing** (ad-hoc agent prompt, or \`gbrain briefing\` if you run GBrain): today's calendar + per-attendee dossier context.
- **End of day**: ingest the day's meeting notes; ask an agent to extract entity mentions and update dossiers.

## Nightly (optional GBrain automation)

- If you run Garry Tan's \`gbrain\`, note the \`sync\` / \`dream\` cadence here so OK users know when the engine re-indexes this Markdown vault.

## Weekly

- Audit: dossiers untouched in 30+ days, contradictions between compiled-truth and recent timeline entries.

## Monthly

- Run OK's \`links({ kind: "dead" })\` across the vault. Triage redlinks into new entities (agents create dossiers through OK), typo fixes (OK edits in place), or removal (drop the link; a tracked task captures any future-doc intent).

`;


export const STARTER_PACKS: Readonly<Record<PackId, StarterPack>> = {
  'knowledge-base': {
    id: 'knowledge-base',
    name: 'Knowledge base',
    description:
      'Source-grounded canonical articles. Three layers (sources → research → articles) wired to the ingest / research / consolidate MCP tools.',
    defaultSubfolder: 'brain',
    folders: KNOWLEDGE_BASE_FOLDERS,
    templates: KNOWLEDGE_BASE_TEMPLATES,
    rootFiles: { 'log.md': KNOWLEDGE_BASE_LOG_MD },
  },
  'software-lifecycle': {
    id: 'software-lifecycle',
    name: 'Software lifecycle',
    description:
      'Proposals, decisions, specs, postmortems, guides. The doc lifecycle for an engineering team or OSS project.',
    defaultSubfolder: 'project-docs',
    folders: SOFTWARE_LIFECYCLE_FOLDERS,
    templates: SOFTWARE_LIFECYCLE_TEMPLATES,
  },
  'plain-notes': {
    id: 'plain-notes',
    name: 'Plain notes',
    description:
      'Just notes/ + daily/. The "I just want to write" escape hatch. No posture imposed, link freely.',
    defaultSubfolder: undefined,
    folders: PLAIN_NOTES_FOLDERS,
    templates: PLAIN_NOTES_TEMPLATES,
  },
  worldbuilding: {
    id: 'worldbuilding',
    name: 'Worldbuilding',
    description:
      'Encyclopedia for fiction: characters, settings, themes, factions, lore. The graph is the product; agent excels at auto-stub creation and dead-link cleanup.',
    defaultSubfolder: 'world',
    folders: WORLDBUILDING_FOLDERS,
    templates: WORLDBUILDING_TEMPLATES,
  },
  'writing-pipeline': {
    id: 'writing-pipeline',
    name: 'Writing pipeline',
    description:
      'Three-stage drafting flow: ideas → drafts → published. Lean by default; CRDT history covers per-file revisions.',
    defaultSubfolder: 'writing',
    folders: WRITING_PIPELINE_FOLDERS,
    templates: WRITING_PIPELINE_TEMPLATES,
  },
  'entity-vault': {
    id: 'entity-vault',
    name: 'Entity vault (GBrain-compatible)',
    description:
      'Track people, companies, meetings, and concepts with dossiers: rewritable summaries plus append-only evidence timelines. GBrain-compatible Markdown; OK handles editing and review.',
    defaultSubfolder: 'vault',
    folders: ENTITY_VAULT_FOLDERS,
    templates: ENTITY_VAULT_TEMPLATES,
    rootFiles: {
      'log.md': ENTITY_VAULT_LOG_MD,
      'USER.md': ENTITY_VAULT_USER_MD,
      'SOUL.md': ENTITY_VAULT_SOUL_MD,
      'ACCESS_POLICY.md': ENTITY_VAULT_ACCESS_POLICY_MD,
      'HEARTBEAT.md': ENTITY_VAULT_HEARTBEAT_MD,
    },
  },
};

export const STARTER_PACK_IDS: readonly PackId[] = Object.keys(STARTER_PACKS) as PackId[];

export function resolvePack(packId?: PackId): StarterPack {
  if (!packId) return STARTER_PACKS[DEFAULT_PACK_ID];
  const pack = STARTER_PACKS[packId];
  if (!pack) {
    return STARTER_PACKS[DEFAULT_PACK_ID];
  }
  return pack;
}

export function isKnownPackId(value: unknown): value is PackId {
  return typeof value === 'string' && (STARTER_PACK_IDS as readonly string[]).includes(value);
}

export function coercePackId(value: unknown): PackId | undefined {
  return isKnownPackId(value) ? value : undefined;
}

export interface StarterPackFolderInfo {
  path: string;
  summary: string;
}

export interface StarterPackEntryCounts {
  files: number;
  folders: number;
}

export interface StarterPackInfo {
  id: PackId;
  name: string;
  description: string;
  defaultSubfolder?: string;
  folders: StarterPackFolderInfo[];
  entryCounts: StarterPackEntryCounts;
}

function deriveFolderSummary(description: string): string {
  const trimmed = description.trim();
  const match = /^([^.!?]+[.!?])/.exec(trimmed);
  const firstSentence = (match?.[1] ?? trimmed).trim();
  if (firstSentence.length <= 140) return firstSentence;
  return `${firstSentence.slice(0, 137)}…`;
}

export function listStarterPacks(): StarterPackInfo[] {
  return STARTER_PACK_IDS.map((id) => {
    const pack = STARTER_PACKS[id];
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      defaultSubfolder: pack.defaultSubfolder,
      folders: pack.folders.map((f) => ({
        path: f.path,
        summary: deriveFolderSummary(f.description),
      })),
      entryCounts: computePackEntryCounts(pack),
    };
  });
}

function computePackEntryCounts(pack: StarterPack): StarterPackEntryCounts {
  const folders = pack.folders.length;
  let files = 0;
  for (const folder of pack.folders) {
    files += 1 + (folder.extraTemplates?.length ?? 0);
  }
  files += pack.rootFiles ? Object.keys(pack.rootFiles).length : 0;
  return { files, folders };
}


export const STARTER_FOLDERS: readonly StarterFolder[] = KNOWLEDGE_BASE_FOLDERS;

export const STARTER_TEMPLATES: Readonly<Record<string, string>> = KNOWLEDGE_BASE_TEMPLATES;

export const LOG_MD_TEMPLATE = KNOWLEDGE_BASE_LOG_MD;

export const STARTER_FOLDER_FRONTMATTER_FILENAME = 'frontmatter.yml';

export function buildStarterFolderFrontmatterYaml(folder: StarterFolder): string {
  const lines: string[] = [];
  lines.push(`title: ${yamlScalar(folder.title)}`);
  lines.push(`description: ${yamlScalar(folder.description)}`);
  lines.push('tags:');
  for (const tag of folder.tags) {
    lines.push(`  - ${yamlScalar(tag)}`);
  }
  return `${lines.join('\n')}\n`;
}

function yamlScalar(value: string): string {
  if (value === '') return '""';
  if (/[:#\n"'\\]|^\s|\s$/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}
