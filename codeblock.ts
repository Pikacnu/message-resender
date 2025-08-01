import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { createHighlighter, type BundledLanguage } from 'shiki';
import { join } from 'path';

// Register Fira Code font
GlobalFonts.registerFromPath(
  join(import.meta.dir, 'assets', 'fonts', 'FiraCodeNerdFont-Regular.ttf'),
  'Fira Code',
);

GlobalFonts.registerFromPath(
  join(import.meta.dir, 'assets', 'fonts', '微軟正黑體.ttf'),
  'Microsoft JhengHei',
);

export async function generateImage({
  code = ``,
  lang = 'ts' as BundledLanguage,
  width = 300,
  backgroundColor = '#ffffff00',
  fontSize = 16,
}) {
  const highlighter = await createHighlighter({
    themes: ['github-dark'],
    langs: [lang],
  });

  const tokens = highlighter.codeToTokens(code, {
    lang: lang,
    theme: 'github-dark',
  }).tokens;
  const lines = tokens.map((line) =>
    line.reduce((acc, token) => acc + token.content, ''),
  );
  const lineMaxWidth = width - fontSize * 2.5;
  const measureCanvas = createCanvas(1, 1);
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSize}px "Fira Code","Microsoft JhengHei"`;
  const wrappedLines = lines.flatMap((line) => {
    if (measureCtx.measureText(line).width > lineMaxWidth) {
      const lineData: string[] = [];
      let currentLine = '';
      for (const token of line) {
        if (measureCtx.measureText(currentLine + token).width > lineMaxWidth) {
          if (currentLine) {
            lineData.push(currentLine);
            currentLine = token; // Start new line with the current token
          }
        } else {
          currentLine += token; // Add token to the current line
        }
      }
      return lineData;
    }
    return line;
  });

  const lineHeight = fontSize * 1.5;
  const height = wrappedLines.length * lineHeight + fontSize * 2; // Add padding for top and bottom
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  const boxW = width;
  const boxH = height;
  drawRoundedRect(ctx, 0, 0, boxW, boxH, 16);
  ctx.fillStyle = '#282c34';
  ctx.fill();

  // Reset shadow
  ctx.shadowBlur = 0;

  // Draw tokens line-by-line
  let y = lineHeight;
  const defaultX = 20;
  for (const line of tokens) {
    let x = defaultX;
    for (const token of line) {
      ctx.font = `${fontSize}px "Fira Code"`;
      ctx.fillStyle = token.color ?? '#ffffff';

      if (measureCtx.measureText(token.content).width > lineMaxWidth) {
        const lines: string[] = [];
        let currentLine = '';
        for (const char of token.content) {
          const testLine = currentLine + char;
          if (measureCtx.measureText(testLine).width > lineMaxWidth) {
            if (currentLine) {
              lines.push(currentLine);
              currentLine = char; // Start new line with the current character
            } else {
              // If the current character itself exceeds the line width, split it
              lines.push(char);
              currentLine = '';
            }
          } else {
            currentLine = testLine; // Add character to the current line
          }
        }

        const remainingWidth = lineMaxWidth - x;
        const remainingText = token.content.slice(0, remainingWidth / fontSize);
        const remainingTextWidth = ctx.measureText(remainingText).width;
        if (remainingTextWidth > remainingWidth) {
          // If remaining text exceeds width, split it into multiple lines
          x = defaultX;
          y += lineHeight; // Move to next line
        }
        ctx.fillText(remainingText, x, y);
        x += remainingTextWidth; // Reset x position for new line
        lines.forEach((part) => {
          ctx.fillText(part, x, y);
          x += ctx.measureText(part).width;
          if (x > lineMaxWidth) {
            x = defaultX;
            y += lineHeight; // Move to next line if x exceeds width
          }
        });
        x += ctx.measureText(lines[lines.length - 1] || '').width; // Update x position
      } else {
        ctx.fillText(token.content, x, y);
        x += ctx.measureText(token.content).width; // Update x position
      }
      // Check if x exceeds width
      if (x > lineMaxWidth) {
        x = defaultX; // Reset x position if it exceeds width
        y += lineHeight; // Move to next line
      }
    }
    y += lineHeight;
  }

  // Export image
  const buffer = canvas.toDataURL('image/webp', 0.8);
  return [buffer, width, height] as const;
}

export const supportedLanguages =
  `'1c' | '1c-query' | 'abap' | 'actionscript-3' | 'ada' | 'adoc' | 'angular-html' | 'angular-ts' | 'apache' | 'apex' | 'apl' | 'applescript' | 'ara' | 'asciidoc' | 'asm' | 'astro' | 'awk' | 'ballerina' | 'bash' | 'bat' | 'batch' | 'be' | 'beancount' | 'berry' | 'bibtex' | 'bicep' | 'blade' | 'bsl' | 'c' | 'c#' | 'c++' | 'cadence' | 'cairo' | 'cdc' | 'clarity' | 'clj' | 'clojure' | 'closure-templates' | 'cmake' | 'cmd' | 'cobol' | 'codeowners' | 'codeql' | 'coffee' | 'coffeescript' | 'common-lisp' | 'console' | 'coq' | 'cpp' | 'cql' | 'crystal' | 'cs' | 'csharp' | 'css' | 'csv' | 'cue' | 'cypher' | 'd' | 'dart' | 'dax' | 'desktop' | 'diff' | 'docker' | 'dockerfile' | 'dotenv' | 'dream-maker' | 'edge' | 'elisp' | 'elixir' | 'elm' | 'emacs-lisp' | 'erb' | 'erl' | 'erlang' | 'f' | 'f#' | 'f03' | 'f08' | 'f18' | 'f77' | 'f90' | 'f95' | 'fennel' | 'fish' | 'fluent' | 'for' | 'fortran-fixed-form' | 'fortran-free-form' | 'fs' | 'fsharp' | 'fsl' | 'ftl' | 'gdresource' | 'gdscript' | 'gdshader' | 'genie' | 'gherkin' | 'git-commit' | 'git-rebase' | 'gjs' | 'gleam' | 'glimmer-js' | 'glimmer-ts' | 'glsl' | 'gnuplot' | 'go' | 'gql' | 'graphql' | 'groovy' | 'gts' | 'hack' | 'haml' | 'handlebars' | 'haskell' | 'haxe' | 'hbs' | 'hcl' | 'hjson' | 'hlsl' | 'hs' | 'html' | 'html-derivative' | 'http' | 'hxml' | 'hy' | 'imba' | 'ini' | 'jade' | 'java' | 'javascript' | 'jinja' | 'jison' | 'jl' | 'js' | 'json' | 'json5' | 'jsonc' | 'jsonl' | 'jsonnet' | 'jssm' | 'jsx' | 'julia' | 'kotlin' | 'kql' | 'kt' | 'kts' | 'kusto' | 'latex' | 'lean' | 'lean4' | 'less' | 'liquid' | 'lisp' | 'lit' | 'llvm' | 'log' | 'logo' | 'lua' | 'luau' | 'make' | 'makefile' | 'markdown' | 'marko' | 'matlab' | 'md' | 'mdc' | 'mdx' | 'mediawiki' | 'mermaid' | 'mips' | 'mipsasm' | 'mmd' | 'mojo' | 'move' | 'nar' | 'narrat' | 'nextflow' | 'nf' | 'nginx' | 'nim' | 'nix' | 'nu' | 'nushell' | 'objc' | 'objective-c' | 'objective-cpp' | 'ocaml' | 'pascal' | 'perl' | 'perl6' | 'php' | 'plsql' | 'po' | 'polar' | 'postcss' | 'pot' | 'potx' | 'powerquery' | 'powershell' | 'prisma' | 'prolog' | 'properties' | 'proto' | 'protobuf' | 'ps' | 'ps1' | 'pug' | 'puppet' | 'purescript' | 'py' | 'python' | 'ql' | 'qml' | 'qmldir' | 'qss' | 'r' | 'racket' | 'raku' | 'razor' | 'rb' | 'reg' | 'regex' | 'regexp' | 'rel' | 'riscv' | 'rs' | 'rst' | 'ruby' | 'rust' | 'sas' | 'sass' | 'scala' | 'scheme' | 'scss' | 'sdbl' | 'sh' | 'shader' | 'shaderlab' | 'shell' | 'shellscript' | 'shellsession' | 'smalltalk' | 'solidity' | 'soy' | 'sparql' | 'spl' | 'splunk' | 'sql' | 'ssh-config' | 'stata' | 'styl' | 'stylus' | 'svelte' | 'swift' | 'system-verilog' | 'systemd' | 'talon' | 'talonscript' | 'tasl' | 'tcl' | 'templ' | 'terraform' | 'tex' | 'tf' | 'tfvars' | 'toml' | 'ts' | 'ts-tags' | 'tsp' | 'tsv' | 'tsx' | 'turtle' | 'twig' | 'typ' | 'typescript' | 'typespec' | 'typst' | 'v' | 'vala' | 'vb' | 'verilog' | 'vhdl' | 'vim' | 'viml' | 'vimscript' | 'vue' | 'vue-html' | 'vue-vine' | 'vy' | 'vyper' | 'wasm' | 'wenyan' | 'wgsl' | 'wiki' | 'wikitext' | 'wit' | 'wl' | 'wolfram' | 'xml' | 'xsl' | 'yaml' | 'yml' | 'zenscript' | 'zig' | 'zsh' | '文言'`
    .split(' | ')
    .map((lang) =>
      lang
        .trim()
        .replaceAll(/'/g, '')
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    ) as BundledLanguage[];

// Draw rounded rectangle helper
function drawRoundedRect(
  ctx: any,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
