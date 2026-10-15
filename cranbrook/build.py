import pathlib
root = pathlib.Path(__file__).parent
lib = root.parent / 'vendor/jspdf.umd.min.js'
out = (root / 'src/shell.html').read_text()
parts = {
    '/*CSS*/': (root / 'src/style.css').read_text(),
    '/*JSPDF*/': lib.read_text().replace('</script', '<\\/script'),
    '/*LOGIC*/': (root / 'src/core.js').read_text(),
    '/*APP*/': (root / 'src/ui.js').read_text(),
}
for k, v in parts.items():
    out = out.replace(k, v, 1)
(root / 'Volleyball_Scorebook.html').write_text(out)
print('built', len(out) // 1024, 'KB')
