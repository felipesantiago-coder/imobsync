import fs

const filePath = '/home/z/my-project/src/app/simulador/page.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

// A seção duplicada começa em 'Schedule Tabs' e vai até 'Important Info Card'
const marker = '                {/* Schedule Tabs — sempre visível quando há dados */';
const idx = content.indexOf(marker);
if (idx === -1) { console.log('Marcador não encontrado'); process.exit(1); }
const before = content.substring(0, idx);
const after = content.substring(idx + marker.length);
fs.writeFileSync(filePath, before + after, 'utf-8');
console.log('Removida seção duplicada, chars:', content.length - (before.length + marker.length));
