const { test } = require('node:test');
const assert = require('node:assert/strict');
const { XmlOutlineParser } = require('../out/XmlOutlineParser');
const parser = new XmlOutlineParser();

for (const newline of ['\n', '\r\n']) {
  test(`nested elements and exact UTF-16 offsets with ${JSON.stringify(newline)}`, () => {
    const source = ['<?xml version="1.0"?>', '<svg xmlns="http://www.w3.org/2000/svg">',
      '  <!-- 😀 <fake/> -->', '  <g id="中😀">', '    <g', '      id="nested" data-note="a > b &amp; &quot;x&quot;">',
      '      <path d="M0 0"/>', '      <text><![CDATA[😀 <not-an-element/>]]><tspan>你好</tspan></text>',
      '    </g>', '  </g>', '</svg>'].join(newline);
    const roots = parser.parse(source);
    assert.equal(roots.length, 1);
    const svg = roots[0], g = svg.children[0], nested = g.children[0];
    assert.equal(g.id, '中😀');
    assert.equal(nested.id, 'nested');
    assert.deepEqual(nested.children.map(n => n.tag), ['path', 'text']);
    const path = nested.children[0], text = nested.children[1], span = text.children[0];
    for (const n of [svg, g, nested, path, text, span]) {
      assert.equal(source.slice(n.nameStart, n.nameEnd), n.tag);
      assert.equal(source[n.start], '<');
      assert.equal(source[n.end - 1], '>');
      assert(n.start <= n.nameStart && n.nameEnd <= n.end);
    }
    assert.equal(source.slice(path.start, path.end), '<path d="M0 0"/>');
    assert.equal(source.slice(span.start, span.end), '<tspan>你好</tspan>');
    assert.equal(g.start, source.indexOf('<g id'));
    assert.equal(nested.start, source.indexOf('<g' + newline));
    assert.equal(svg.end, source.length);
    assert.equal(path.id, undefined);
  });
}
test('defs, unknown tags, prefixes and decoded IDs are preserved', () => {
  const [root] = parser.parse('<svg xmlns:x="urn:x"><defs><x:custom id="A&amp;B"><tspan/></x:custom></defs></svg>');
  const custom = root.children[0].children[0];
  assert.equal(custom.tag, 'x:custom'); assert.equal(custom.id, 'A&B');
  assert.equal(custom.children[0].id, undefined);
});
test('text, comments, CDATA and processing instructions do not create fake elements', () => {
  const xml = '<svg><?demo x?><text>A &lt; B &amp; C<!-- <x/> --><![CDATA[<g/>]]></text></svg>';
  const [root] = parser.parse(xml);
  assert.deepEqual(root.children.map(n => n.tag), ['text']);
  assert.equal(root.children[0].children.length, 0);
  assert.equal(root.children[0].end, xml.indexOf('</text>') + 7);
});
for (const xml of ['', '<svg>', '<svg><g></svg>', '<svg a="1" a="2"/>', '<svg>&bad;</svg>',
  '<svg a="raw <"/>', '<svg/><svg/>', '<!DOCTYPE svg><svg/>', '<notSvg/>']) {
  test(`invalid input returns an empty tree: ${JSON.stringify(xml)}`, () => assert.deepEqual(parser.parse(xml), []));
}
test('edits move offsets, malformed input does not poison later valid requests', () => {
  const first = '<svg><circle/></svg>';
  const second = '<svg>\r\n<!-- 😀 -->\r\n<circle/></svg>';
  assert.equal(parser.parse(first)[0].children[0].start, 5);
  assert.deepEqual(parser.parse('<svg><circle'), []);
  assert.equal(parser.parse(second)[0].children[0].start, second.indexOf('<circle'));
  assert.equal(parser.parse(first)[0].children[0].end, 14);
});
test('cancellation discards partial results', () => assert.deepEqual(parser.parse('<svg><g/></svg>', () => true), []));
