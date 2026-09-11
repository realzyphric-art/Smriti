import { useState } from 'react';

function inlineParts(line: string) {
  const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={index} className="chat-inline-code">{part.slice(1, -1)}</code>;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <span key={index}>{part}</span>;
  });
}

function highlight(code: string, language: string) {
  const tokenPattern = /(\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|async|await|import|from|export|class|new|true|false|null|undefined)\b|\b\d+(?:\.\d+)?\b)/g;
  const parts = code.split(tokenPattern).filter(Boolean);
  return parts.map((part, index) => {
    const isComment = part.startsWith('//') || (language === 'python' && part.startsWith('#'));
    const isString = part.startsWith('"') || part.startsWith("'");
    const isKeyword = /^(const|let|var|function|return|if|else|for|while|async|await|import|from|export|class|new|true|false|null|undefined)$/.test(part);
    const className = isComment ? 'code-comment' : isString ? 'code-string' : isKeyword ? 'code-keyword' : /^\d/.test(part) ? 'code-number' : '';
    return className ? <span key={index} className={className}>{part}</span> : <span key={index}>{part}</span>;
  });
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard access is optional */ }
  };
  return (
    <div className="chat-code-block">
      <div className="chat-code-header"><span>{language || 'code'}</span><button type="button" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button></div>
      <pre><code>{highlight(code, language)}</code></pre>
    </div>
  );
}

export function MarkdownMessage({ content }: { content: string }) {
  const blocks = content.split(/```([^\n]*)\n([\s\S]*?)```/g);
  const output: JSX.Element[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (!paragraph.length) return;
    output.push(<p key={`p-${output.length}`}>{paragraph.map((line, index) => <span key={index}>{inlineParts(line)}{index < paragraph.length - 1 && <br />}</span>)}</p>);
    paragraph = [];
  };
  for (let index = 0; index < blocks.length; index += 1) {
    if (index % 3 === 0) {
      blocks[index].split('\n').forEach((line) => {
        if (line.trim()) paragraph.push(line);
        else flush();
      });
    } else if (index % 3 === 1) {
      flush();
      output.push(<CodeBlock key={`code-${index}`} language={blocks[index].trim()} code={blocks[index + 1]} />);
      index += 1;
    }
  }
  flush();
  return <div className="chat-markdown">{output}</div>;
}
