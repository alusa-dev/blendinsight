import type { ReactNode } from "react";

const links = [
  ["Privacidade", "/privacy"],
  ["Termos", "/terms"],
  ["Exclusão de dados", "/data-deletion"],
  ["Suporte", "/support"],
] as const;

export function LegalDocument({
  title,
  eyebrow,
  intro,
  children,
}: {
  title: string;
  eyebrow: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <a className="legal-brand" href="/" aria-label="Blend Insight — início">
          <span className="legal-mark" aria-hidden="true">B</span>
          <span>Blend Insight</span>
        </a>
        <nav className="legal-nav" aria-label="Documentos e suporte">
          {links.map(([label, href]) => <a href={href} key={href}>{label}</a>)}
        </nav>
      </header>

      <article className="legal-paper">
        <div className="legal-heading">
          <p className="legal-eyebrow">{eyebrow} <span>·</span> Blend Insight</p>
          <h1>{title}</h1>
          <p className="legal-intro">{intro}</p>
          <p className="legal-date">Vigente desde 25 de setembro de 2026</p>
        </div>
        <div className="legal-body">{children}</div>
      </article>

      <footer className="legal-footer">
        <span>Blend Insight · ferramenta pessoal de integração com Instagram</span>
        <a href="mailto:gestao.alusa@gmail.com">gestao.alusa@gmail.com</a>
      </footer>
    </main>
  );
}
