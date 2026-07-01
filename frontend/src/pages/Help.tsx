import { useState, useEffect, useRef, useMemo } from 'react';
import { marked } from 'marked';

import gettingStartedRaw from '../docs/getting-started.md?raw';
import importingRaw from '../docs/importing.md?raw';
import categoriesRaw from '../docs/categories.md?raw';
import rulesRaw from '../docs/rules.md?raw';
import budgetsRaw from '../docs/budgets.md?raw';
import sinkingFundsRaw from '../docs/sinking-funds.md?raw';
import recurringRaw from '../docs/recurring.md?raw';
import reportsRaw from '../docs/reports.md?raw';
import settingsRaw from '../docs/settings.md?raw';

function slugify(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/(^-|-$)/g, '');
}

function extractSections(content: string) {
  const sections: { text: string; slug: string }[] = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^## (.+)$/);
    if (m) sections.push({ text: m[1], slug: slugify(m[1]) });
  }
  return sections;
}

function renderMarkdown(content: string): string {
  const html = marked.parse(content, { async: false }) as string;
  // Inject id attributes on h1/h2/h3 for scroll-to
  return html.replace(/<h([123])>([^<]+)<\/h\1>/g, (_, d, text) => {
    return `<h${d} id="${slugify(text)}">${text}</h${d}>`;
  });
}

const DOCS = [
  { id: 'getting-started', title: 'Getting Started', content: gettingStartedRaw },
  { id: 'importing',       title: 'Importing',        content: importingRaw },
  { id: 'categories',      title: 'Categories',       content: categoriesRaw },
  { id: 'rules',           title: 'Rules',            content: rulesRaw },
  { id: 'budgets',         title: 'Budgets',          content: budgetsRaw },
  { id: 'sinking-funds',   title: 'Sinking Funds',    content: sinkingFundsRaw },
  { id: 'recurring',       title: 'Recurring',        content: recurringRaw },
  { id: 'reports',         title: 'Reports',          content: reportsRaw },
  { id: 'settings',        title: 'Settings',         content: settingsRaw },
].map(d => ({ ...d, sections: extractSections(d.content), html: renderMarkdown(d.content) }));

export default function Help() {
  const [activeId, setActiveId] = useState(DOCS[0].id);
  const [activeSection, setActiveSection] = useState('');
  const [search, setSearch] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll-spy: highlight the sidebar section whose heading is near the top of the pane.
  useEffect(() => {
    setActiveSection('');
    const root = contentRef.current;
    if (!root) return;
    const headings = Array.from(root.querySelectorAll('h2[id]'));
    if (!headings.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActiveSection((visible[0].target as HTMLElement).id);
      },
      { root, rootMargin: '0px 0px -70% 0px' },
    );
    headings.forEach((h) => io.observe(h));
    return () => io.disconnect();
  }, [activeId]);

  const term = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    if (!term) return DOCS;
    return DOCS.filter(d =>
      d.title.toLowerCase().includes(term) || d.content.toLowerCase().includes(term)
    );
  }, [term]);

  // If active doc is filtered out, select first visible one
  useEffect(() => {
    if (filtered.length && !filtered.find(d => d.id === activeId)) {
      setActiveId(filtered[0].id);
    }
  }, [filtered, activeId]);

  const activeDoc = DOCS.find(d => d.id === activeId) ?? DOCS[0];

  function scrollTo(slug: string) {
    const el = contentRef.current?.querySelector(`#${slug}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectDoc(id: string, slug?: string) {
    setActiveId(id);
    if (slug) {
      // Wait for render then scroll
      setTimeout(() => scrollTo(slug), 50);
    } else {
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div className="flex gap-6 -mt-2">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 sticky top-4 self-start" style={{ maxHeight: 'calc(100vh - 5rem)', overflowY: 'auto' }}>
        <input
          type="search"
          aria-label="Search help"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="mb-3 w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />

        {filtered.length === 0 && (
          <p className="text-xs text-slate-400 px-1">No results for "{search}"</p>
        )}

        <nav className="space-y-0.5">
          {filtered.map(doc => {
            const isActive = doc.id === activeId;
            const visibleSections = term
              ? doc.sections.filter(s => s.text.toLowerCase().includes(term) || isActive)
              : doc.sections;

            return (
              <div key={doc.id}>
                <button
                  onClick={() => selectDoc(doc.id)}
                  className={`w-full text-left rounded px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {doc.title}
                </button>
                {isActive && visibleSections.map(s => (
                  <button
                    key={s.slug}
                    onClick={() => selectDoc(doc.id, s.slug)}
                    className={`w-full text-left rounded px-4 py-1 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${
                      s.slug === activeSection
                        ? 'font-semibold text-slate-900 dark:text-slate-100'
                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <div
        ref={contentRef}
        className="flex-1 min-w-0 help-prose text-slate-800 dark:text-slate-200"
        style={{ maxHeight: 'calc(100vh - 5rem)', overflowY: 'auto' }}
        dangerouslySetInnerHTML={{ __html: activeDoc.html }}
      />
    </div>
  );
}
