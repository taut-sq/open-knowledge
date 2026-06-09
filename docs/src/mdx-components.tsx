import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { AgentIcons } from '@/components/agent-icons';
import { CopyPrompt } from '@/components/copy-prompt';
import { CtaButton } from '@/components/cta-button';
import { DownloadButton } from '@/components/download-button';
import { Mermaid } from '@/components/mermaid';
import { LayerStack, QuickstartCTA, WhereToStart } from '@/components/overview-blocks';

export function getMDXComponents(): MDXComponents {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    AgentIcons,
    Card,
    Cards,
    CopyPrompt,
    CtaButton,
    DownloadButton,
    Image: ImageZoom,
    LayerStack,
    Mermaid,
    QuickstartCTA,
    Step,
    Steps,
    WhereToStart,
    Tab,
    Tabs,
    TypeTable,
  };
}
