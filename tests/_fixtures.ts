// Invented release text shared by the tests that check what a hostile body
// can reach: script, event handlers, an iframe, a javascript: link, an opener
// link, and ids that would collide with the page's own.

export const HOSTILE = [
  '- <img src="x.png" onerror="alert(1)"> First bullet <script>alert(1)</script>' +
  ' <a href="https://site.example/" target="_blank" rel="opener">lead</a> <a id="theme-toggle">x</a>',
  "",
  "## Features",
  "",
  '<details ontoggle="alert(2)"><summary>More</summary>',
  "",
  '- <iframe src="https://frame.example/"></iframe> framed',
  "- [click me](javascript:alert(3))",
  '- <a href="https://site.example/" rel="opener" target="_blank">opener</a>',
  '- <a id="theme-toggle" href="#top">spoof</a>',
  "",
  "</details>",
].join("\n");
