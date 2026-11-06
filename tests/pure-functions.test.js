const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pure = require('../dist/pure.js');

const gasSource = fs.readFileSync(require.resolve('../Code.gs'), 'utf8');
const sandbox = { console, Utilities: { formatDate:()=>'', DigestAlgorithm:{MD5:'MD5'}, Charset:{UTF_8:'UTF_8'} } };
vm.createContext(sandbox);
vm.runInContext(gasSource, sandbox);
const autoName = sandbox.autoName;
const suggestCategory = sandbox.suggestCategory;

test('cleanPrompt cleans escaped markdown and bullet headings while preserving layout', () => {
  const input = '\\# ROLE — SENIOR\n\n* **Phase 1:** Nhận input  \n* **Phase 2:** Xử lý.';
  const actual = pure.cleanPrompt(input);
  assert.equal(actual, '# ROLE — SENIOR\n\n- Phase 1: Nhận input\n- Phase 2: Xử lý.');
});

test('cleanPrompt collapses doubled quotes and preserves JSON/code examples', () => {
  assert.equal(pure.cleanPrompt('"Hãy đóng vai ""@abc""."'), 'Hãy đóng vai "@abc".');
  assert.equal(pure.cleanPrompt('""""Nhập Tâm""""'), '"Nhập Tâm"');
  const json='{"version":"1.0","note":"**giữ**"}';
  assert.equal(pure.cleanPrompt(json), json);
  assert.equal(pure.cleanPrompt('Xuất file *.jpg và tính 5*3.'), 'Xuất file *.jpg và tính 5*3.');
  assert.equal(pure.cleanPrompt('```\n**giữ nguyên**\n```'), '```\n**giữ nguyên**\n```');
});

test('extractVars deduplicates labels and ignores non-input square brackets and JSON', () => {
  assert.deepEqual(pure.extractVars('Dịch {Văn bản gốc} từ {Ngôn ngữ gốc} sang {Ngôn ngữ đích}, lặp lại {văn bản gốc}').map(x=>x.label), ['Văn bản gốc','Ngôn ngữ gốc','Ngôn ngữ đích']);
  assert.equal(pure.extractVars('[Dán link YouTube vào đây]').length,1);
  assert.equal(pure.extractVars('[Chosen Lens], {"a":"b"}, { x = 1; }').length,0);
  assert.equal(pure.extractVars('{123} {a:b} {x = 1;}').length,0);
});

test('search normalizer ignores Vietnamese accents and case', () => {
  assert.equal(pure.normalizeSearch('Chỉnh sửa ảnh'), 'chinh sua anh');
  assert.equal(pure.normalizeSearch('Đồ án'), 'do an');
});

test('autoName follows title, role, and version conventions', () => {
  assert.equal(autoName('# ROLE — PROFESSIONAL PHOTOGRAPHIC REALISM & COLOR GRADING SPECIALIST').name, 'Professional Photographic Realism & Color Grading Specialist');
  assert.equal(autoName('Return only Vietnamese. Bạn là nhân vật "Thầy dạy Huyền học".').name, 'Thầy dạy Huyền học');
  assert.equal(autoName('## Prompt: vDebate v1.2.2 - Phản Biện Đa Chiều & Khám Phá Góc Nhìn (Enhanced)').name, 'Phản Biện Đa Chiều & Khám Phá Góc Nhìn');
  assert.equal(autoName('Kiến Trúc Sư Lộ Trình Học Tập: Với mục tiêu học…').name, 'Kiến Trúc Sư Lộ Trình Học Tập');
});

test('suggestCategory needs two distinct matching keywords', () => {
  assert.equal(suggestCategory('OSINT', ['Nghiên cứu']).category, '');
  assert.equal(suggestCategory('OSINT, truy vết và nghiên cứu', ['Nghiên cứu']).category, 'Nghiên cứu');
  assert.equal(suggestCategory('ảnh portrait phục chế', ['Chỉnh sửa ảnh']).category, 'Chỉnh sửa ảnh');
  assert.equal(suggestCategory('lá số và ngũ hành', ['Huyền học']).category, 'Huyền học');
});
