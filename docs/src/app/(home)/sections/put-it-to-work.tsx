import type { ReactNode } from 'react';
import { Section } from '../section';
import SectionHeading from '../section-heading';
import { AgentBrainGraphic } from './agent-brain-graphic';
import { EngSpecsGraphic } from './eng-specs-graphic';
import { KnowledgeBaseGraphic } from './knowledge-base-graphic';

type UseCaseCard = {
  visual: ReactNode;
  title: string;
  description: string;
};

const cards: UseCaseCard[] = [
  {
    visual: <AgentBrainGraphic />,
    title: 'Agent brain',
    description:
      'A shared knowledge base your agents read from and write to — the persistent memory behind every session.',
  },
  {
    visual: <EngSpecsGraphic />,
    title: 'Engineering specs',
    description:
      'Specs, RFCs and runbooks living next to the code, edited by humans and coding agents in the same loop.',
  },
  {
    visual: <KnowledgeBaseGraphic />,
    title: 'Knowledge base',
    description:
      'A living wiki for your team — docs, notes, and decisions in plain markdown, kept current by everyone who works on them.',
  },
];

export function PutItToWork() {
  return (
    <Section className="container">
      <SectionHeading tag="Use cases">Put it to work.</SectionHeading>
      <div className="mt-16 grid grid-cols-1 gap-y-12 lg:grid-cols-3 lg:gap-8">
        {cards.map((card) => (
          <article key={card.title} className="flex flex-col gap-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slide-bg">
              {card.visual}
            </div>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-lg font-semibold text-slide-text">{card.title}</h3>
              <p className="text-base text-slide-muted">{card.description}</p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
