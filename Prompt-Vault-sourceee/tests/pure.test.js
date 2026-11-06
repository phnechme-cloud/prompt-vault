const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const P = require('../pure.js');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../Code.gs'), 'utf8'), context, { filename: 'Code.gs' });
const autoName = context.autoName;
const suggestCategory = context.suggestCategory;
const plain = value => JSON.parse(JSON.stringify(value));

test('cleanPrompt gỡ escape, chuyển bullet, gỡ bold và dọn dòng', () => {
  const source = String.raw`\# ROLE — SENIOR` + '\n\n' + '* **Phase 1:** Nhận input   \n* **Phase 2:** Xử lý.';
  assert.equal(P.cleanPrompt(source), '# ROLE — SENIOR\n\n- Phase 1: Nhận input\n- Phase 2: Xử lý.');
});

test('cleanPrompt gỡ ngoặc kép bọc và escape CSV', () => {
  assert.equal(P.cleanPrompt('"Hãy đóng vai ""@abc""."'), 'Hãy đóng vai "@abc".');
  assert.equal(P.cleanPrompt('""""Nhập Tâm""""'), '"Nhập Tâm"');
});

test('JSON, code, dấu chấm và phép nhân được giữ nguyên', () => {
  const json = '{"version":"1.0","note":"**giữ**"}';
  assert.equal(P.cleanPrompt(json), json);
  assert.equal(P.cleanPrompt('Xuất file *.jpg và tính 5*3.'), 'Xuất file *.jpg và tính 5*3.');
  assert.equal(P.cleanPrompt('`**giữ**` và **bỏ**'), '`**giữ**` và bỏ');
});

test('extractVars lấy biến trùng một lần và giữ thứ tự xuất hiện', () => {
  const vars = P.extractVars('Dịch {Văn bản gốc} từ {Ngôn ngữ gốc} sang {Ngôn ngữ đích}, lặp lại {văn bản gốc}');
  assert.deepEqual(vars.map(v => v.label), ['Văn bản gốc', 'Ngôn ngữ gốc', 'Ngôn ngữ đích']);
  assert.equal(vars[0].matches.length, 2);
});

test('extractVars chỉ nhận placeholder dạng chỉ dẫn trong ngoặc vuông', () => {
  assert.equal(P.extractVars('[Dán link YouTube vào đây]').length, 1);
  assert.equal(P.extractVars('[Chosen Lens]').length, 0);
  assert.equal(P.extractVars('{"a":"b"}').length, 0);
  assert.equal(P.extractVars('{ x = 1; }').length, 0);
});

test('fillVars thay mọi lần xuất hiện và giữ placeholder khi ô trống', () => {
  const text = 'Dịch {Văn bản gốc}; lặp {văn bản gốc}; sang {Ngôn ngữ đích}';
  const vars = P.extractVars(text);
  assert.equal(P.fillVars(text, vars, { 'văn bản gốc': 'Xin chào', 'ngôn ngữ đích': 'English' }), 'Dịch Xin chào; lặp Xin chào; sang English');
  assert.equal(P.fillVars(text, vars, { 'văn bản gốc': '' }), text);
});

test('autoName theo các mẫu mẫu ở Phụ lục A', () => {
  const cases = [
    ['# ROLE — PROFESSIONAL PHOTOGRAPHIC REALISM & COLOR GRADING SPECIALIST', 'Professional Photographic Realism & Color Grading Specialist'],
    ['# ROLE — SENIOR LANDSCAPE ARCHITECTURAL VISUALIZER', 'Senior Landscape Architectural Visualizer'],
    ["Let's play a very interesting game: from now on you will play the role of a Birth Time Rectification Research Specialist…", 'Birth Time Rectification Research Specialist'],
    ['Return only Vietnamese. Bạn là nhân vật "Thầy dạy Huyền học".', 'Thầy dạy Huyền học'],
    ['Kiến Trúc Sư Lộ Trình Học Tập: Với mục tiêu học…', 'Kiến Trúc Sư Lộ Trình Học Tập'],
    ['## Prompt: vDebate v1.2.2 - Phản Biện Đa Chiều & Khám Phá Góc Nhìn (Enhanced…)', 'Phản Biện Đa Chiều & Khám Phá Góc Nhìn']
  ];
  for (const [source, expected] of cases) assert.equal(autoName(source).name, expected, source);
  assert.equal(autoName(cases[5][0]).nameSub, 'v1.2.2');
});

test('autoName phân biệt hai prompt trùng tên bằng cụm nhiệm vụ đầu tiên', () => {
  const first = autoName('Hãy đóng vai chuyên gia OSINT và phân tích dấu vết số công khai.');
  const second = autoName('Bạn là chuyên gia OSINT và nghiên cứu thông tin trên Internet.');
  assert.equal(first.name, 'Chuyên gia OSINT');
  assert.equal(second.name, 'Chuyên gia OSINT');
  const items = [{name:first.name,nameSource:'auto',variants:[{text:'Hãy đóng vai chuyên gia OSINT và phân tích dấu vết số công khai.'}]},{name:second.name,nameSource:'auto',variants:[{text:'Bạn là chuyên gia OSINT và nghiên cứu thông tin trên Internet.'}]}];
  context.disambiguateNames_(items);
  assert.deepEqual(items.map(x=>x.name), ['Chuyên gia OSINT · phân tích dấu vết số công khai', 'Chuyên gia OSINT · nghiên cứu thông tin trên Internet']);
});

test('suggestCategory cần từ hai keyword khác nhau và theo đúng nhóm động', () => {
  assert.equal(suggestCategory('OSINT truy vết nghiên cứu',['Nghiên cứu']).category, 'Nghiên cứu');
  assert.equal(suggestCategory('ảnh portrait phục chế',['Chỉnh sửa ảnh']).category, 'Chỉnh sửa ảnh');
  assert.equal(suggestCategory('lá số ngũ hành',['Huyền học']).category, 'Huyền học');
  assert.equal(suggestCategory('chỉ có portrait',['Chỉnh sửa ảnh']).category, '');
});

test('suggestCategory không dấu và tags không quá năm keyword', () => {
  const result = suggestCategory('Chỉnh sửa ảnh portrait render scan phục chế lightroom photoshop', ['Chỉnh sửa ảnh']);
  assert.equal(result.category, 'Chỉnh sửa ảnh');
  assert.ok(result.tags.length <= 5);
  assert.ok(result.tags.every(t => t === t.toLocaleLowerCase('vi')));
});

test('tìm kiếm không dấu xử lý chữ đ', () => {
  assert.equal(P.searchNormalize('Chỉnh sửa ảnh'), 'chinh sua anh');
  assert.equal(P.searchNormalize('Đồ án'), 'do an');
});
