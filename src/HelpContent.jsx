import { useRef, useState } from "react";
import { copyTextToClipboard } from "./clipboard.js";
import { HELP_TOPICS, searchHelp } from "./helpTopics.js";
import "./help.css";

function CodeExample({ code, label }) {
  const [status, setStatus] = useState("");
  const copying = useRef(false);
  async function copy() {
    if (copying.current) return;
    copying.current = true;
    setStatus("");
    try {
      await copyTextToClipboard(code);
      setStatus("Copied. Close Help and paste into the DBML editor.");
    } catch {
      setStatus("Copy failed. Select the example text and copy it manually.");
    } finally {
      copying.current = false;
    }
  }
  return (
    <div className="sker-help-example">
      <div className="sker-help-example-bar">
        <span>{label}</span>
        <button type="button" className="sker-button" onClick={() => void copy()} aria-label={`Copy example: ${label}`}>Copy DBML</button>
      </div>
      <pre tabIndex={0} aria-label={label}><code>{code}</code></pre>
      <p className="sker-help-copy-status" role="status">{status || "Copying an example does not change your diagram."}</p>
    </div>
  );
}

function HelpArticle({ article }) {
  return (
    <article className="sker-help-card" aria-labelledby={`help-${article.id}`}>
      {article.topic && <span className="sker-help-eyebrow">{article.topic}</span>}
      <h4 id={`help-${article.id}`}>{article.title}</h4>
      {article.description && <p>{article.description}</p>}
      {article.steps && <ol className="sker-help-steps">{article.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
      {article.code && <CodeExample code={article.code} label={article.codeLabel} />}
      {article.rows && (
        <div className="sker-help-table-wrap">
          <table>
            <caption className="sker-help-sr-only">{article.title}</caption>
            <thead><tr><th scope="col">{article.keyboard ? "Key / focus" : "Syntax"}</th><th scope="col">{article.keyboard ? "Action" : "Meaning"}</th></tr></thead>
            <tbody>{article.rows.map(([key, meaning]) => <tr key={key}><th scope="row">{article.keyboard ? <kbd>{key}</kbd> : <code>{key}</code>}</th><td>{meaning}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {article.note && <aside className="sker-help-note"><strong>Good to know</strong><p>{article.note}</p></aside>}
    </article>
  );
}

export default function HelpContent() {
  const [activeId, setActiveId] = useState("start");
  const [query, setQuery] = useState("");
  const headingRef = useRef(null);
  const searchRef = useRef(null);
  const active = HELP_TOPICS.find((topic) => topic.id === activeId);
  const searching = Boolean(query.trim());
  const articles = searching ? searchHelp(query) : active.articles;

  function navigate(id) {
    setActiveId(id);
    setQuery("");
    // The heading stays mounted, so it can receive focus before React updates its text.
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className="sker-help">
      <div className="sker-help-intro">
        <span className="sker-help-eyebrow">A little guidance. A clearer diagram.</span>
        <p>Start with a working example, learn a new trick, or find your next step.</p>
      </div>
      <div className="sker-help-search">
        <label htmlFor="sker-help-search">What would you like to do?</label>
        <div className="sker-help-search-field">
          <span aria-hidden="true">⌕</span>
          <input id="sker-help-search" ref={searchRef} type="search" value={query} placeholder="Try “relationships”, “export”, or “keyboard”…" onChange={(event) => setQuery(event.target.value)} aria-controls="sker-help-results" />
          {query && <button type="button" aria-label="Clear help search" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>Clear</button>}
        </div>
      </div>
      <div className="sker-help-layout">
        <nav className="sker-help-nav" aria-label="Help topics">
          {HELP_TOPICS.map((topic) => (
            <button type="button" key={topic.id} aria-current={!searching && activeId === topic.id ? "page" : undefined} onClick={() => navigate(topic.id)}>
              <span className="sker-help-nav-number" aria-hidden="true">{topic.icon}</span>
              <span>{topic.label}</span>
            </button>
          ))}
          <p className="sker-help-nav-hint">Your diagram stays as it is while you browse Help.</p>
        </nav>
        <div id="sker-help-results" className="sker-help-results">
          <header className="sker-help-section-heading">
            <h3 ref={headingRef} tabIndex={-1}>{searching ? "Search results" : active.label}</h3>
            <p role="status">{searching ? `${articles.length} ${articles.length === 1 ? "guide" : "guides"} found for “${query.trim()}”` : active.summary}</p>
          </header>
          {!articles.length && (
            <div className="sker-help-empty">
              <h4>No guides found</h4>
              <p>Try a shorter search, like “table”, “save”, or “zoom”, or choose a topic on the left.</p>
              <button type="button" className="sker-button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>Clear search</button>
            </div>
          )}
          {articles.map((article) => <HelpArticle key={article.id} article={article} />)}
          {!searching && activeId === "start" && (
            <div className="sker-help-next">
              <h4>What would you like to do next?</h4>
              <div className="sker-help-next-grid">
                {HELP_TOPICS.slice(1).map((topic) => <button type="button" key={topic.id} onClick={() => navigate(topic.id)}><strong>{topic.label}<span aria-hidden="true"> →</span></strong><span>{topic.summary}</span></button>)}
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="sker-help-footer"><span>Tip: Save a .sker file to keep an editable backup.</span><span><kbd>Esc</kbd> closes Help</span></footer>
    </div>
  );
}
