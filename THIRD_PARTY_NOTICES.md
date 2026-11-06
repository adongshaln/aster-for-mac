# Third-party notices

Aster 4.4 uses the official DeepSeek Harness SDK and runtime, pinned to
`@deepseek-ai/dsh@0.2.2-rc.1` and `@deepseek-ai/dsh-sdk-client@0.2.2-rc.1`.
Source: https://github.com/deepseek-ai/deepseek-harness
Audited source commit: fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159.
Copyright (c) 2026 DeepSeek. MIT license text: licenses/deepseek-harness.LICENSE.
The runtime packages are redistributed intact; the Aster deployment plugin,
provider proxy and Electron bridge live in runtime/ and electron/.

Node.js 24.11.1 is bundled for the task runtime. Node.js and its included
components have their full notices in licenses/node.LICENSE. Mermaid 12.3.0 and jsdiff 9.0.0 provide diagram rendering and line
alignment. The licenses and notices for these and all transitive dependencies
remain with the corresponding distributed node_modules packages. They are
not relicensed by this notice. Aster's UI also retains the CDS reference
credits documented in README.md.
